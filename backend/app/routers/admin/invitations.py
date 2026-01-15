from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.utils.security import decode_invitation_token
from app.dependencies import get_current_user, get_db
from app.models import User, WorkspaceMember, WorkspaceRole

router = APIRouter(tags=["Admin Invitations"])


# Endpoint /slug/invite is deprecated and removed. Functionality moved to workspaces endpoint.


@router.get("/verify")
async def verify_invitation(token: str, db: AsyncSession = Depends(get_db)):
    """Verify an invitation token and return details including workspace name."""
    try:
        payload = decode_invitation_token(token)
        workspace_id = payload.get("workspace_id")

        workspace_name = "Unknown Workspace"
        if workspace_id:
            from app.models import Workspace

            result = await db.execute(
                select(Workspace).where(Workspace.id == workspace_id)
            )
            workspace = result.scalar_one_or_none()
            if workspace:
                workspace_name = workspace.title

        return {
            "email": payload["sub"],
            "workspace_id": workspace_id,
            "workspace_name": workspace_name,
            "role": payload["role"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or expired invitation token: {str(e)}",
        )


class InvitationAccept(BaseModel):
    token: str


@router.post("/accept")
async def accept_invitation(
    data: InvitationAccept,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept an invitation using an existing account.
    The email in the token must match the current user's email.
    """
    try:
        payload = decode_invitation_token(data.token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid token: {str(e)}",
        )

    # Verify email match
    if payload["sub"].lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation was sent to a different email address.",
        )

    workspace_id = payload.get("workspace_id")
    role = payload.get("role")

    if not workspace_id or not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token payload"
        )

    # Check if already a member
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none():
        return {"message": "Already a member of this workspace"}

    # Add member
    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=current_user.id,
        role=WorkspaceRole(role),
    )
    db.add(member)
    await db.commit()

    return {"message": "Invitation accepted", "workspace_id": workspace_id}
