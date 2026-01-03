from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db
from app.models import User, Workspace, WorkspaceMember, WorkspaceRole
from app.schemas import WorkspaceCreate, WorkspaceRead

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
    # Join WorkspaceMember to filter by user_id
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
        role=WorkspaceRole.admin,
    )
    db.add(member)
    await db.commit()
    await db.refresh(workspace)

    return workspace
