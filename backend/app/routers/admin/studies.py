"""Admin routes for study CRUD management.

Participant and import/export routes live in dedicated sub-routers
that are included into this router at the bottom of the file.
"""

import logging
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import (
    PaginationParams,
    check_study_permission,
    get_current_user,
    get_current_project,
    require_project_role,
)
from app.limiter import limiter
from app.models import (
    MemoParentType,
    Statement,
    Study,
    StudyRole,
    StudyState,
    User,
    Project,
    ProjectMember,
    ProjectRole,
)
from app.schemas import StudyCreate, StudyRead, StudyUpdate
from app.schemas.concourses import ConcourseImportToStudy, StaleStatementRead
from app.schemas.common import PaginatedResponse
from app.services.concourse_service import StaleStatementEntry
from app.services.study_service import StudyService
from app.utils.audit import log_admin_action

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("", response_model=StudyRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def create_study(
    request: Request,
    study: StudyCreate,
    project_ctx: tuple[Project, ProjectMember] = Depends(
        require_project_role(ProjectRole.member)
    ),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Create a new study in the active project.

    Requires Owner or Researcher project role.
    """
    project, _ = project_ctx
    return await StudyService.create_study(db, study, project.id)


@router.get("", response_model=PaginatedResponse[StudyRead])
async def list_studies(
    project_ctx: tuple[Project, ProjectMember] = Depends(get_current_project),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
) -> PaginatedResponse[StudyRead]:
    """List studies in the active project with pagination."""
    project, _ = project_ctx

    base = select(Study).where(Study.project_id == project.id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar() or 0

    query = (
        base.options(selectinload(Study.project))
        .order_by(Study.created_at.desc())
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    result = await db.execute(query)
    items = list(result.scalars().all())

    # FastAPI serialises Study → StudyRead via response_model; cast aligns mypy.
    return cast(
        PaginatedResponse[StudyRead],
        PaginatedResponse(
            items=items, total=total, limit=pagination.limit, offset=pagination.offset
        ),
    )


@router.get("/{slug}", response_model=StudyRead)
async def get_study(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Get study details."""
    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(
            selectinload(Study.translations),
            selectinload(Study.statements).selectinload(Statement.translations),
            selectinload(Study.participants),
        )
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.patch("/{slug}", response_model=StudyRead)
@limiter.limit("30/minute")
async def update_study(
    request: Request,
    study_update: StudyUpdate,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Update study configuration (draft only)."""
    # Re-load study with all relationships needed for the update
    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(
            selectinload(Study.translations),
            selectinload(Study.statements).selectinload(Statement.translations),
            selectinload(Study.participants),
        )
    )
    res = await db.execute(stmt)
    study_loaded = res.scalar_one_or_none()

    if study_loaded is None:
        raise HTTPException(status_code=404, detail="Study not found")

    # Pre-fetch all statement translations into identity map
    for s in study_loaded.statements:
        _ = s.translations

    return await StudyService.update_study(db, study_loaded, study_update)


@router.post("/{slug}/validate", response_model=list[str])
@limiter.limit("30/minute")
async def validate_study(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    """Check if study is ready for activation."""
    await db.refresh(study, attribute_names=["translations", "statements"])
    for s in study.statements:
        await db.refresh(s, attribute_names=["translations"])

    return StudyService.validate_for_activation(study)


@router.post("/{slug}/state", response_model=StudyRead)
@limiter.limit("30/minute")
async def change_study_state(
    request: Request,
    new_state: StudyState,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Change study state (Draft <-> Active <-> Closed <-> Archived)."""
    if new_state == StudyState.active:
        await db.refresh(study, attribute_names=["translations", "statements"])
        for s in study.statements:
            await db.refresh(s, attribute_names=["translations"])

        errors = StudyService.validate_for_activation(study)
        if errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Study is not ready for activation",
                    "errors": errors,
                },
            )

    previous_state = study.state
    try:
        study.state = new_state
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error("Unexpected error during study state change: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while changing study state",
        )

    log_admin_action(
        actor_user_id=current_user.id,
        action="state_change",
        resource="study",
        resource_id=study.id,
        slug=study.slug,
        previous_state=previous_state.value,
        new_state=new_state.value,
    )

    updated_study = await StudyService.get_study_by_slug(db, study.slug)
    if updated_study is None:
        raise HTTPException(
            status_code=404, detail="Study not found after state change"
        )
    return updated_study


@router.post("/{slug}/reset", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def reset_study_participants(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.owner)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete all participants for the study (Owner only)."""
    from app.services.study_data_service import StudyDataService

    await StudyDataService.reset_study_participants(db, study.id)
    log_admin_action(
        actor_user_id=current_user.id,
        action="reset_participants",
        resource="study",
        resource_id=study.id,
        slug=study.slug,
    )
    return None


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_study(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.owner)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a study (Superuser only, and must be Archived)."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can delete studies.",
        )

    if study.state != StudyState.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Study must be ARCHIVED before it can be deleted.",
        )

    from app.services.memo_service import MemoService
    from app.services.study_data_service import StudyDataService

    deleted_slug = study.slug
    deleted_id = study.id
    await StudyDataService.delete_audio_files_for_study(db, study.id)
    await MemoService.cleanup_for_parent(
        db, parent_type=MemoParentType.study, parent_id=study.id
    )
    await db.delete(study)
    await db.commit()
    log_admin_action(
        actor_user_id=current_user.id,
        action="delete",
        resource="study",
        resource_id=deleted_id,
        slug=deleted_slug,
    )
    return None


@router.post("/{slug}/import-concourse", response_model=StudyRead)
@limiter.limit("10/minute")
async def import_from_concourse(
    request: Request,
    slug: str,
    data: ConcourseImportToStudy,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Import concourse items into a study as statements (copies, no reference)."""
    from app.services.concourse_service import ConcourseService

    return await ConcourseService.import_to_study(db, study, data)


@router.get("/{slug}/stale-statements", response_model=list[StaleStatementRead])
async def check_stale_statements(
    slug: str,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> list[StaleStatementEntry]:
    """Check which imported statements have stale concourse sources."""
    from app.services.concourse_service import ConcourseService

    return await ConcourseService.check_stale_statements(db, study)


@router.post("/{slug}/sync-statement/{statement_id}", response_model=StudyRead)
@limiter.limit("30/minute")
async def sync_statement_from_concourse(
    request: Request,
    slug: str,
    statement_id: int,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Sync a single statement's text from its concourse source."""
    from app.services.concourse_service import ConcourseService

    await ConcourseService.sync_statement_from_concourse(db, study, statement_id)

    # Return refreshed study
    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(
            selectinload(Study.translations),
            selectinload(Study.statements).selectinload(Statement.translations),
            selectinload(Study.participants),
        )
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.post("/{slug}/sync-all-stale", response_model=StudyRead)
@limiter.limit("10/minute")
async def sync_all_stale_statements(
    request: Request,
    slug: str,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Sync all stale statements from their concourse sources."""
    from app.services.concourse_service import ConcourseService

    stale = await ConcourseService.check_stale_statements(db, study)
    for entry in stale:
        if entry["source_deleted"]:
            continue
        try:
            await ConcourseService.sync_statement_from_concourse(
                db, study, entry["statement_id"]
            )
        except Exception:
            logger.warning("Failed to sync statement %s", entry["statement_id"])

    # Return refreshed study
    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(
            selectinload(Study.translations),
            selectinload(Study.statements).selectinload(Statement.translations),
            selectinload(Study.participants),
        )
    )
    res = await db.execute(stmt)
    return res.scalar_one()


# ------------------------------------------------------------------
# Include sub-routers
# ------------------------------------------------------------------
from . import studies_participants, studies_import_export  # noqa: E402

router.include_router(studies_participants.router)
router.include_router(studies_import_export.router)
