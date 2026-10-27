"""An invitation token is consumed once: removal from a project must stick."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.models import ProjectMember, ProjectRole


async def _is_member(db, project_id: int, user_id: int) -> bool:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


@pytest.mark.asyncio
class TestInvitationSingleUse:
    async def test_removed_member_cannot_reaccept_same_invitation(
        self,
        client: AsyncClient,
        db,
        user_factory,
        project_factory,
        auth_token_factory,
    ):
        owner = await user_factory()
        invitee = await user_factory()
        project = await project_factory(owner=owner)
        slug, invitee_id, project_id = project.slug, invitee.id, project.id
        invitee_headers = auth_token_factory(invitee)

        r = await client.post(
            f"/api/admin/projects/{slug}/invitations",
            json={"email": invitee.email, "role": "member"},
            headers=auth_token_factory(owner),
        )
        assert r.status_code == 200, r.text
        token = r.json()["token"]

        r = await client.post(
            "/api/admin/invitations/accept",
            json={"token": token},
            headers=invitee_headers,
        )
        assert r.status_code == 200, r.text
        assert await _is_member(db, project_id, invitee_id)

        r = await client.delete(
            f"/api/admin/projects/{slug}/members/{invitee_id}",
            headers=auth_token_factory(owner),
        )
        assert r.status_code == 204, r.text

        r = await client.post(
            "/api/admin/invitations/accept",
            json={"token": token},
            headers=invitee_headers,
        )
        assert r.status_code == 400
        assert r.json()["message"] == "invitation_already_used"
        db.expire_all()
        assert not await _is_member(db, project_id, invitee_id)

    async def test_invitation_used_at_register_cannot_be_accepted_again(
        self,
        client: AsyncClient,
        db,
        user_factory,
        project_factory,
        auth_token_factory,
    ):
        from app.models import User
        from app.utils.security import create_invitation_token

        owner = await user_factory()
        project = await project_factory(owner=owner)
        token = create_invitation_token(
            email="newcomer@example.com", role="member", project_id=project.id
        )

        r = await client.post(
            "/api/register",
            json={
                "email": "newcomer@example.com",
                "password": "securepass123",
                "invitation_token": token,
            },
        )
        assert r.status_code == 201, r.text
        newcomer = (
            await db.execute(select(User).where(User.email == "newcomer@example.com"))
        ).scalar_one()
        assert await _is_member(db, project.id, newcomer.id)

        r = await client.post(
            "/api/admin/invitations/accept",
            json={"token": token},
            headers=auth_token_factory(newcomer),
        )
        assert r.status_code == 400
        assert r.json()["message"] == "invitation_already_used"

    async def test_consumed_invitation_cannot_register_a_new_account(
        self, client: AsyncClient, db, user_factory, project_factory
    ):
        from app.services.email_token_consume_service import mark_jti_consumed
        from app.utils.security import create_invitation_token, decode_invitation_token

        owner = await user_factory()
        project = await project_factory(owner=owner)
        token = create_invitation_token(
            email="late@example.com", role="member", project_id=project.id
        )
        await mark_jti_consumed(
            db, decode_invitation_token(token)["jti"], purpose="invitation"
        )
        await db.commit()

        r = await client.post(
            "/api/register",
            json={
                "email": "late@example.com",
                "password": "securepass123",
                "invitation_token": token,
            },
        )
        assert r.status_code == 400
        assert r.json()["message"] == "invitation_already_used"

    async def test_legacy_invitation_without_jti_is_refused_cleanly(
        self,
        client: AsyncClient,
        user_factory,
        project_factory,
        auth_token_factory,
    ):
        owner = await user_factory()
        invitee = await user_factory()
        project = await project_factory(owner=owner)
        legacy = jwt.encode(
            {
                "sub": invitee.email,
                "role": "member",
                "type": "invitation",
                "project_id": project.id,
                "exp": datetime.now(timezone.utc) + timedelta(days=1),
            },
            settings.SECRET_KEY,
            algorithm="HS256",
        )
        r = await client.post(
            "/api/admin/invitations/accept",
            json={"token": legacy},
            headers=auth_token_factory(invitee),
        )
        assert r.status_code == 400
        assert r.json()["message"] == "invitation_expired"
