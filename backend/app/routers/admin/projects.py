from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import logging

from app.limiter import limiter
from app.dependencies import (
    PaginationParams,
    check_project_permission,
    get_current_active_user,
    get_db,
)
from app.models import User, Project, ProjectMember, ProjectRole
from app.schemas import (
    ProjectCreate,
    ProjectMemberRead,
    ProjectMemberUpdate,
    ProjectRead,
    ProjectUpdate,
    ProjectInvitationCreate,
    InvitationLink,
    ProjectWithRole,
    QuotaInfo,
)
from app.schemas.common import PaginatedResponse
from app.services.quotas import get_member_quota_state
from app.utils.audit import log_admin_action
from app.utils.security import create_invitation_token
from app.utils.email import send_invitation_email
from app.core.config import settings
from fastapi import BackgroundTasks

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=PaginatedResponse[ProjectWithRole])
async def list_projects(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
) -> PaginatedResponse[ProjectWithRole]:
    """
    List all projects the current user is a member of, with their role.
    """
    count_result = await db.execute(
        select(func.count()).where(ProjectMember.user_id == current_user.id)
    )
    total = count_result.scalar() or 0

    query = (
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == current_user.id)
        .options(selectinload(Project.members).selectinload(ProjectMember.user))
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    result = await db.execute(query)
    rows = result.unique().all()

    items: list[ProjectWithRole] = []
    for project, role in rows:
        quota = await get_member_quota_state(db, project.id, current_user)
        items.append(
            ProjectWithRole(
                **project.__dict__,
                user_role=role,
                member_quota=QuotaInfo(**quota),
            )
        )

    return cast(
        PaginatedResponse[ProjectWithRole],
        PaginatedResponse(
            items=items, total=total, limit=pagination.limit, offset=pagination.offset
        ),
    )


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def create_project(
    request: Request,
    project_in: ProjectCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    """
    Create a new project and assign the current user as Owner.
    """
    # Check if slug exists globally
    query = select(Project).where(Project.slug == project_in.slug)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project with this slug already exists",
        )

    # Quota gate: enforce MAX_PROJECTS_AS_OWNER (T5)
    from app.services.quotas import assert_can_create_owned_project

    await assert_can_create_owned_project(db, current_user)

    try:
        # Create Project
        project = Project(
            title=project_in.title,
            slug=project_in.slug,
        )
        db.add(project)
        await db.flush()  # To get ID

        # Create Member (Owner)
        member = ProjectMember(
            project_id=project.id,
            user_id=current_user.id,
            role=ProjectRole.owner,
        )
        db.add(member)
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        logger.error(
            f"Integrity check failed during project creation: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project with this slug likely already exists",
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during project creation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while creating the project",
        )
    # Re-query with members loaded for ProjectRead serialization
    query = (
        select(Project)
        .where(Project.id == project.id)
        .options(selectinload(Project.members).selectinload(ProjectMember.user))
    )
    result = await db.execute(query)
    project = result.scalar_one()

    quota = await get_member_quota_state(db, project.id, current_user)
    project_data = {**project.__dict__}
    project_data["members"] = project.members
    project_data["member_quota"] = QuotaInfo(**quota)
    return ProjectRead.model_validate(project_data)


@router.get("/{slug}", response_model=ProjectWithRole)
async def get_project(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    slug: str = Path(..., description="The slug of the project"),
) -> ProjectWithRole:
    """
    Get project details.
    """
    # Query membership to get the role
    query = (
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(Project.slug == slug)
        .where(ProjectMember.user_id == current_user.id)
        .options(selectinload(Project.members).selectinload(ProjectMember.user))
    )

    result = await db.execute(query)
    row = result.unique().one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied",
        )

    project, role = row
    quota = await get_member_quota_state(db, project.id, current_user)
    return ProjectWithRole(
        **project.__dict__,
        user_role=role,
        member_quota=QuotaInfo(**quota),
    )


@router.patch("/{slug}", response_model=ProjectRead)
@limiter.limit("30/minute")
async def update_project(
    request: Request,
    project_in: ProjectUpdate,
    project: Project = Depends(check_project_permission(ProjectRole.owner)),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    """
    Update project details.
    """
    try:
        if project_in.title is not None:
            project.title = project_in.title
        if project_in.slug is not None and project_in.slug != project.slug:
            # Check if new slug exists
            query = select(Project).where(Project.slug == project_in.slug)
            result = await db.execute(query)
            if result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Project with this slug already exists",
                )
            project.slug = project_in.slug

        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        logger.error(
            f"Integrity check failed during project update: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Database integrity check failed",
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during project update: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while updating the project",
        )
    # Re-query with members loaded for ProjectRead serialization
    query = (
        select(Project)
        .where(Project.id == project.id)
        .options(selectinload(Project.members).selectinload(ProjectMember.user))
    )
    result = await db.execute(query)
    project = result.scalar_one()
    quota = await get_member_quota_state(db, project.id, current_user)
    project_data = {**project.__dict__}
    project_data["members"] = project.members
    project_data["member_quota"] = QuotaInfo(**quota)
    return ProjectRead.model_validate(project_data)


@router.get("/{slug}/members", response_model=PaginatedResponse[ProjectMemberRead])
async def list_project_members(
    project: Project = Depends(check_project_permission(ProjectRole.viewer)),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
) -> PaginatedResponse[ProjectMemberRead]:
    """
    List all members of a project with pagination.
    """
    from sqlalchemy.orm import selectinload

    base = select(ProjectMember).where(ProjectMember.project_id == project.id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar() or 0

    query = (
        base.options(selectinload(ProjectMember.user))
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    result = await db.execute(query)
    items = list(result.scalars().all())

    # FastAPI serialises ProjectMember → ProjectMemberRead via response_model.
    return cast(
        PaginatedResponse[ProjectMemberRead],
        PaginatedResponse(
            items=items, total=total, limit=pagination.limit, offset=pagination.offset
        ),
    )


@router.patch("/{slug}/members/{user_id}", response_model=ProjectMemberRead)
@limiter.limit("30/minute")
async def update_project_member(
    request: Request,
    user_id: int,
    member_in: ProjectMemberUpdate,
    project: Project = Depends(check_project_permission(ProjectRole.owner)),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectMember:
    """
    Update a project member's role.
    """
    query = (
        select(ProjectMember)
        .where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user_id,
        )
        .options(selectinload(ProjectMember.user))
    )
    result = await db.execute(query)
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member not found"
        )

    if member_in.role == ProjectRole.owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OWNER_ROLE_IMMUTABLE",
        )

    previous_role = member.role
    try:
        member.role = member_in.role
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during member update: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while updating member role",
        )
    await db.refresh(member, attribute_names=["role"])
    # ProjectMember has a composite PK (project_id, user_id), no surrogate id.
    log_admin_action(
        actor_user_id=current_user.id,
        action="role_change",
        resource="project_member",
        resource_id=f"{project.id}:{user_id}",
        project_slug=project.slug,
        target_user_id=user_id,
        previous_role=previous_role.value,
        new_role=member.role.value,
    )
    return member


@router.delete("/{slug}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def remove_project_member(
    request: Request,
    user_id: int,
    project: Project = Depends(check_project_permission(ProjectRole.owner)),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Remove a member from the project.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself from the project",
        )

    query = select(ProjectMember).where(
        ProjectMember.project_id == project.id, ProjectMember.user_id == user_id
    )
    result = await db.execute(query)
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member not found"
        )

    removed_role = member.role
    try:
        await db.delete(member)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during member removal: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while removing the member",
        )

    log_admin_action(
        actor_user_id=current_user.id,
        action="remove_member",
        resource="project_member",
        resource_id=f"{project.id}:{user_id}",
        project_slug=project.slug,
        target_user_id=user_id,
        previous_role=removed_role.value,
    )


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_project(
    request: Request,
    project: Project = Depends(check_project_permission(ProjectRole.owner)),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete a project (Owner only).
    """
    # Check for active studies
    # We can't delete if there are studies? Plan says: "impossible si des études sont actives".
    # Let's count studies.
    # Note: Studies are cascade deleted in DB usually if configured, but plan requests safety check.

    # Query count of studies
    from app.models import Study

    stmt = select(func.count(Study.id)).where(Study.project_id == project.id)
    result = await db.execute(stmt)
    study_count = result.scalar() or 0

    if study_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete project with {study_count} existing studies. Please delete them first.",
        )

    deleted_id = project.id
    deleted_slug = project.slug
    try:
        await db.delete(project)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during project deletion: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while deleting the project",
        )
    log_admin_action(
        actor_user_id=current_user.id,
        action="delete",
        resource="project",
        resource_id=deleted_id,
        slug=deleted_slug,
    )


@router.post("/{slug}/invitations", response_model=InvitationLink)
@limiter.limit("30/minute")
async def create_invitation(
    request: Request,
    invitation_in: ProjectInvitationCreate,
    background_tasks: BackgroundTasks,
    project: Project = Depends(check_project_permission(ProjectRole.owner)),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> InvitationLink:
    """
    Invite a user to the project.
    """
    if invitation_in.role == ProjectRole.owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OWNER_ROLE_IMMUTABLE",
        )

    # Quota gate: enforce MAX_MEMBERS_PER_PROJECT (T5)
    from app.services.quotas import assert_can_add_member

    await assert_can_add_member(db, project.id, current_user)

    token = create_invitation_token(
        email=invitation_in.email,
        project_id=project.id,
        role=invitation_in.role.value,
    )

    invite_url = f"{settings.FRONTEND_URL}/register?token={token}"

    background_tasks.add_task(
        send_invitation_email,
        email_to=invitation_in.email,
        context_name=project.title,
        invite_url=invite_url,
        context_type="project",
    )

    return InvitationLink(invite_url=invite_url, token=token)
