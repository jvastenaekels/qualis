"""API router for study data exports."""

import io
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...database import get_db
from ...dependencies import get_current_user
from ...models import (
    Participant,
    Statement,
    Study,
    StudyCollaborator,
    StudyRole,
    User,
)
from ...services.export_service import ExportService

router = APIRouter(tags=["Admin Exports"])


async def check_export_permission(
    slug: str, current_user: User, db: AsyncSession
) -> Study:
    """Check if the user has permission to export data (Owner or Editor)."""
    query = (
        select(Study, StudyCollaborator)
        .join(StudyCollaborator)
        .where(Study.slug == slug)
        .where(StudyCollaborator.user_id == current_user.id)
    )
    result = await db.execute(query)
    row = result.one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found or access denied",
        )

    study, collaborator = row

    if collaborator.role == StudyRole.viewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return cast(Study, study)


@router.get("/{slug}/export/csv")
async def export_csv(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export study results as CSV."""
    study = await check_export_permission(slug, current_user, db)

    # Fetch participants with all relations needed for export
    # We need to explicitly load qsort_entries and their statements?
    # No, we have study.statements. We need p.qsort_entries.
    query = (
        select(Participant)
        .where(Participant.study_id == study.id)
        .options(selectinload(Participant.qsort_entries))
    )
    # Ensure study.statements are loaded
    # Re-fetch study with statements
    study_query = (
        select(Study)
        .where(Study.id == study.id)
        .options(selectinload(Study.statements))
    )
    study_res = await db.execute(study_query)
    study = study_res.scalar_one()

    participant_res = await db.execute(query)
    participants = list(participant_res.scalars().all())

    csv_content = ExportService.generate_csv(study, participants)

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={slug}_results.csv"},
    )


@router.get("/{slug}/export/pqmethod")
async def export_pqmethod(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export study results in PQMethod format (ZIP)."""
    study = await check_export_permission(slug, current_user, db)

    # Fetch relations
    study_query = (
        select(Study)
        .where(Study.id == study.id)
        .options(selectinload(Study.statements).selectinload(Statement.translations))
    )
    study_res = await db.execute(study_query)
    study = study_res.scalar_one()

    query = (
        select(Participant)
        .where(Participant.study_id == study.id)
        .options(selectinload(Participant.qsort_entries))
    )
    participant_res = await db.execute(query)
    participants = list(participant_res.scalars().all())

    zip_bytes = ExportService.generate_pqmethod_zip(study, participants)

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={slug}_pqmethod.zip"},
    )
