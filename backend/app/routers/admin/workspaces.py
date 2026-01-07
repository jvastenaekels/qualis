from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    check_workspace_permission,
    get_current_active_user,
    get_db,
)
from app.models import User, Workspace, WorkspaceMember, WorkspaceRole
from app.schemas import (
    WorkspaceCreate,
    WorkspaceMemberRead,
    WorkspaceMemberUpdate,
    WorkspaceRead,
    WorkspaceUpdate,
    WorkspaceInvitationCreate,
    InvitationLink,
)
from app.utils.security import create_invitation_token
from app.utils.email import send_invitation_email
from app.core.config import settings
from fastapi import BackgroundTasks

router = APIRouter()


@router.get("/", response_model=list[WorkspaceRead])
async def list_workspaces(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[Workspace]:
    """
    List all workspaces the current user is a member of.
    """
    # Select workspaces where the user is a member
    query = (
        select(Workspace)
        .join(WorkspaceMember)
        .where(WorkspaceMember.user_id == current_user.id)
    )
    result = await db.execute(query)
    workspaces = result.scalars().all()
    return list(workspaces)


@router.post("/", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    workspace_in: WorkspaceCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    """
    Create a new workspace and assign the current user as Admin.
    """
    # Check if slug exists globally
    query = select(Workspace).where(Workspace.slug == workspace_in.slug)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace with this slug already exists",
        )

    # Create Workspace
    workspace = Workspace(
        title=workspace_in.title,
        slug=workspace_in.slug,
    )
    db.add(workspace)
    await db.flush()  # To get ID

    # Create Member (Admin)
    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=current_user.id,
        role=WorkspaceRole.owner,
    )
    db.add(member)
    await db.commit()
    await db.refresh(workspace)

    return workspace


@router.get("/{slug}", response_model=WorkspaceRead)
async def get_workspace(
    workspace: Workspace = Depends(check_workspace_permission(WorkspaceRole.viewer)),
) -> Workspace:
    """
    Get workspace details.
    """
    return workspace


@router.patch("/{slug}", response_model=WorkspaceRead)
async def update_workspace(
    workspace_in: WorkspaceUpdate,
    workspace: Workspace = Depends(check_workspace_permission(WorkspaceRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> Workspace:
    """
    Update workspace details.
    """
    if workspace_in.title is not None:
        workspace.title = workspace_in.title
    if workspace_in.slug is not None and workspace_in.slug != workspace.slug:
        # Check if new slug exists
        query = select(Workspace).where(Workspace.slug == workspace_in.slug)
        result = await db.execute(query)
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace with this slug already exists",
            )
        workspace.slug = workspace_in.slug

    await db.commit()
    await db.refresh(workspace)
    return workspace


@router.get("/{slug}/members", response_model=list[WorkspaceMemberRead])
async def list_workspace_members(
    workspace: Workspace = Depends(check_workspace_permission(WorkspaceRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceMember]:
    """
    List all members of a workspace.
    """
    from sqlalchemy.orm import selectinload

    query = (
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace.id)
        .options(selectinload(WorkspaceMember.user))
    )
    result = await db.execute(query)
    members = result.scalars().all()

    # Manually populate user_email for the schema if needed,
    # though lazy="selectin" or join should handle it.
    return list(members)


@router.patch("/{slug}/members/{user_id}", response_model=WorkspaceMemberRead)
async def update_workspace_member(
    user_id: int,
    member_in: WorkspaceMemberUpdate,
    workspace: Workspace = Depends(check_workspace_permission(WorkspaceRole.admin)),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceMember:
    """
    Update a workspace member's role.
    """
    query = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user_id
    )
    result = await db.execute(query)
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member not found"
        )

    member.role = member_in.role
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/{slug}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace_member(
    user_id: int,
    workspace: Workspace = Depends(check_workspace_permission(WorkspaceRole.admin)),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a member from the workspace.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself from the workspace",
        )

    query = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user_id
    )
    result = await db.execute(query)
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member not found"
        )

    await db.delete(member)
    await db.commit()


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace: Workspace = Depends(check_workspace_permission(WorkspaceRole.owner)),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a workspace (Owner only).
    """
    # Check for active studies
    # We can't delete if there are studies? Plan says: "impossible si des études sont actives".
    # Let's count studies.
    # Note: Studies are cascade deleted in DB usually if configured, but plan requests safety check.

    # Query count of studies
    from app.models import Study

    stmt = select(func.count(Study.id)).where(Study.workspace_id == workspace.id)
    result = await db.execute(stmt)
    study_count = result.scalar() or 0

    if study_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete workspace with {study_count} existing studies. Please delete them first.",
        )

    await db.delete(workspace)
    await db.commit()


@router.post("/{slug}/invitations", response_model=InvitationLink)
async def create_invitation(
    invitation_in: WorkspaceInvitationCreate,
    background_tasks: BackgroundTasks,
    workspace: Workspace = Depends(check_workspace_permission(WorkspaceRole.admin)),
):
    """
    Invite a user to the workspace.
    """
    token = create_invitation_token(
        email=invitation_in.email,
        workspace_id=workspace.id,
        role=invitation_in.role.value,
    )

    invite_url = f"{settings.FRONTEND_URL}/register?token={token}"

    background_tasks.add_task(
        send_invitation_email,
        email_to=invitation_in.email,
        context_name=workspace.title,
        invite_url=invite_url,
        context_type="workspace",
    )

    return InvitationLink(invite_url=invite_url, token=token)
