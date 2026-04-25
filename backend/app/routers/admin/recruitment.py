"""API router for managing study recruitment."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.limiter import limiter
from app.dependencies import (
    check_study_permission,
    get_current_user,
    ROLE_MAP,
    STUDY_ROLE_HIERARCHY,
)
from app.models import Study, StudyRole, RecruitmentLink, ProjectMember, User
from app.schemas import RecruitmentLinkCreate, RecruitmentLinkRead  # noqa: F401 (used in response_model)
from app.services.recruitment_service import RecruitmentService
from sqlalchemy import select

router = APIRouter(tags=["Admin Recruitment"])


@router.get("/{slug}/links", response_model=list[RecruitmentLinkRead])
async def list_study_links(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> list[RecruitmentLink]:
    """List all recruitment links for a specific study."""
    return await RecruitmentService.get_study_links(db, study.id)


@router.post("/{slug}/links", response_model=list[RecruitmentLinkRead])
@limiter.limit("30/minute")
async def create_recruitment_links(
    request: Request,
    data: RecruitmentLinkCreate,
    count: int = 1,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> list[RecruitmentLink]:
    """Create one or more recruitment links."""
    if count > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create more than 100 links at once",
        )

    return await RecruitmentService.create_links(
        db,
        study_id=study.id,
        type=data.type,
        count=count,
        name=data.name,
        capacity=data.capacity,
        expires_in_days=90,  # Default expiration
    )


@router.delete("/links/{link_id}")
@limiter.limit("30/minute")
async def revoke_recruitment_link(
    request: Request,
    link_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Revoke a recruitment link."""
    # 1. Fetch Link + Permissions
    # We require Editor permission on the study
    stmt = (
        select(RecruitmentLink, Study, ProjectMember)
        .join(Study, Study.id == RecruitmentLink.study_id)
        .join(ProjectMember, ProjectMember.project_id == Study.project_id)
        .where(
            RecruitmentLink.id == link_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    result = await db.execute(stmt)
    row = result.one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found or access denied",
        )

    link, study, member = row

    # Check Permission (Editor required)
    effective_role = ROLE_MAP.get(member.role, StudyRole.viewer)
    if STUDY_ROLE_HIERARCHY[effective_role] < STUDY_ROLE_HIERARCHY[StudyRole.editor]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
        )

    await db.delete(link)
    await db.commit()

    return {"status": "revoked"}
