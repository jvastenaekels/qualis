import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.utils.security import decode_invitation_token
from app.limiter import limiter
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, ProjectMember, ProjectRole

router = APIRouter(tags=["Admin Invitations"])


# Endpoint /slug/invite is deprecated and removed. Functionality moved to projects endpoint.


@router.get("/verify")
async def verify_invitation(
    token: str, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    """Verify an invitation token and return details including project name."""
    # Only the decode is inside the try: a token problem is a 400, but a DB
    # failure below must surface as a 500 (a real fault to investigate), not be
    # masked as a misleading "invalid token". Never leak str(e) to the client.
    try:
        payload = decode_invitation_token(token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token",
        )

    email = payload.get("sub")
    role = payload.get("role")
    if not email or not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invitation token payload",
        )

    project_id = payload.get("project_id") or payload.get("workspace_id")

    project_name = "Unknown Project"
    if project_id:
        from app.models import Project

        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if project:
            project_name = project.title

    return {
        "email": email,
        "project_id": project_id,
        "project_name": project_name,
        "role": role,
    }


class InvitationAccept(BaseModel):
    token: str


@router.post("/accept")
@limiter.limit("30/minute")
async def accept_invitation(
    request: Request,
    data: InvitationAccept,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    """
    Accept an invitation using an existing account.
    The email in the token must match the current user's email.
    """
    try:
        payload = decode_invitation_token(data.token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token",
        )

    # Verify email match
    if payload["sub"].lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invitation was sent to a different email address.",
        )

    project_id = payload.get("project_id") or payload.get("workspace_id")
    role = payload.get("role")

    if not project_id or not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token payload"
        )

    # Check if already a member
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none():
        return {"message": "Already a member of this project"}

    # Add member
    member = ProjectMember(
        project_id=project_id,
        user_id=current_user.id,
        role=ProjectRole(role),
    )
    db.add(member)
    await db.commit()

    return {"message": "Invitation accepted", "project_id": project_id}
