from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.dependencies import check_study_permission
from app.models import Study, StudyRole
from app.schemas import InvitationCreate, InvitationLink
from app.utils.security import create_invitation_token, decode_invitation_token

router = APIRouter(tags=["Admin Invitations"])


@router.post("/{slug}/invite", response_model=InvitationLink)
async def invite_collaborator(
    invite: InvitationCreate,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
):
    """Generate a JWT invitation link for a collaborator."""
    token = create_invitation_token(
        email=invite.email,
        study_id=study.id,
        role=invite.role.value,
    )

    # Suggested URL for the invitation
    invite_url = f"{settings.FRONTEND_URL}/register?token={token}"

    return InvitationLink(invite_url=invite_url, token=token)


@router.get("/verify/{token}")
async def verify_invitation(token: str):
    """Verify an invitation token and return details."""
    try:
        payload = decode_invitation_token(token)
        return {
            "email": payload["sub"],
            "study_id": payload["study_id"],
            "role": payload["role"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or expired invitation token: {str(e)}",
        )
