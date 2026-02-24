"""Admin routes for study participant management."""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sqlalchemy import func

from app.database import get_db
from app.dependencies import PaginationParams, check_study_permission, get_current_user
from app.limiter import limiter
from app.models import (
    Participant,
    Study,
    StudyRole,
    StudyState,
    User,
    WorkspaceMember,
    WorkspaceRole,
)
from app.schemas import ParticipantDetailRead, ParticipantDiscardUpdate, ParticipantRead
from app.schemas.common import PaginatedResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{slug}/participants", response_model=PaginatedResponse[ParticipantRead])
async def list_study_participants(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    """List participants for a specific study with pagination."""
    base = select(Participant).where(Participant.study_id == study.id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar() or 0

    stmt = (
        base.order_by(Participant.created_at.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    result = await db.execute(stmt)
    items = list(result.scalars().all())

    return PaginatedResponse(
        items=items, total=total, limit=pagination.limit, offset=pagination.offset
    )


@router.get("/participants/{participant_id}", response_model=ParticipantDetailRead)
async def get_participant(
    participant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed participant info including responses."""
    from app.services.storage_service import storage_service

    stmt = (
        select(Participant)
        .join(Participant.study)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
        .where(
            Participant.id == participant_id,
            WorkspaceMember.user_id == current_user.id,
            WorkspaceMember.role.in_([WorkspaceRole.owner, WorkspaceRole.researcher]),
        )
        .options(
            selectinload(Participant.qsort_entries),
            selectinload(Participant.audio_recordings),
        )
    )
    result = await db.execute(stmt)
    participant = result.scalar_one_or_none()

    if not participant:
        raise HTTPException(
            status_code=404, detail="Participant not found or access denied"
        )

    # Generate fresh presigned URLs for audio recordings (24h expiration)
    for audio_rec in participant.audio_recordings:
        try:
            url = storage_service.generate_presigned_url(
                audio_rec.s3_key, expiration=86400
            )
            # Set runtime attributes (not in model, only in schema)
            setattr(audio_rec, "presigned_url", url)
            setattr(
                audio_rec, "url_expires_at", datetime.now(UTC) + timedelta(hours=24)
            )
        except Exception as e:
            # Log error but don't fail the request
            logger.warning(
                "Failed to generate presigned URL for %s: %s", audio_rec.s3_key, e
            )

    return participant


@router.patch("/participants/{participant_id}/discard", response_model=ParticipantRead)
@limiter.limit("30/minute")
async def discard_participant(
    request: Request,
    participant_id: int,
    discard_data: ParticipantDiscardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Flag or unflag a participant for exclusion from stats/exports."""
    # Security: Ensure participant belongs to a study in a workspace user can access
    stmt = (
        select(Participant)
        .join(Participant.study)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
        .where(
            Participant.id == participant_id,
            WorkspaceMember.user_id == current_user.id,
            WorkspaceMember.role.in_([WorkspaceRole.owner, WorkspaceRole.researcher]),
        )
    )
    result = await db.execute(stmt)
    participant = result.scalar_one_or_none()

    if not participant:
        raise HTTPException(
            status_code=404, detail="Participant not found or access denied"
        )

    try:
        participant.is_discarded = discard_data.is_discarded
        participant.discard_reason = discard_data.discard_reason

        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during participant discard: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while updating participant status",
        )
    await db.refresh(participant)
    return participant


@router.delete("/{slug}/test-runs", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def clear_test_runs(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Delete all participants flagged as is_test_run for this study."""
    from app.services.study_data_service import StudyDataService

    await StudyDataService.delete_audio_files_for_study(
        db, study.id, test_runs_only=True
    )
    await db.execute(
        delete(Participant).where(
            Participant.study_id == study.id, Participant.is_test_run.is_(True)
        )
    )
    await db.commit()
    return None


@router.delete("/{slug}/participants", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def clear_all_participants(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Delete ALL participants for this study. Only allowed in DRAFT state."""
    if study.state != StudyState.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete all participants unless study is in DRAFT state.",
        )
    from app.services.study_data_service import StudyDataService

    await StudyDataService.delete_audio_files_for_study(db, study.id)
    await db.execute(delete(Participant).where(Participant.study_id == study.id))
    await db.commit()
    return None
