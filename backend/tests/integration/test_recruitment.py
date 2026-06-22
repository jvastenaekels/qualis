"""Consolidated integration tests for recruitment links and collaborator invitations."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProjectRole, RecruitmentLink, User


@pytest.mark.asyncio
class TestRecruitment:
    """Tests for recruitment link management and statistics."""

    async def test_recruitment_logic(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        # 1. Setup
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        # test_user is already admin of project via factory
        headers = auth_token_factory(test_user)

        # 2. Create Links
        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=2",
            json={"type": "public", "name": "Social Media"},
            headers=headers,
        )
        assert response.status_code == 200
        links = response.json()
        assert len(links) == 2
        token = links[0]["token"]

        # 3. Access Study via Link (Increments start_count)
        response = await client.get(f"/api/study/{study.slug}?link_token={token}")
        assert response.status_code == 200

        # Verify stats
        response = await client.get(
            f"/api/admin/recruitment/{study.slug}/links", headers=headers
        )
        data = response.json()
        target_link = next(link for link in data if link["token"] == token)
        assert target_link["start_count"] == 1

    async def test_capacity_validation_rejects_zero(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        """Capacity must be > 0; 0 or negative values should be rejected."""
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "limited", "capacity": 0},
            headers=headers,
        )
        assert response.status_code == 422

        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "limited", "capacity": -1},
            headers=headers,
        )
        assert response.status_code == 422

    async def test_public_link_with_capacity_is_rejected(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        """A public (unlimited) link must reject an operator-supplied capacity.

        Previously the service silently dropped the capacity, so an operator
        could believe they had capped sign-ups when the link was unlimited.
        The capacity must now be rejected at the API boundary (422).
        """
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "public", "capacity": 10},
            headers=headers,
        )
        assert response.status_code == 422
        body = response.text.lower()
        assert "capacity" in body
        assert "public" in body

    async def test_public_link_without_capacity_succeeds(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        """Control: a public link without capacity must still succeed (unlimited)."""
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "public", "name": "Social Media"},
            headers=headers,
        )
        assert response.status_code == 200
        links = response.json()
        assert len(links) == 1
        assert links[0]["capacity"] is None

    async def test_limited_link_with_capacity_succeeds(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        """Control: a non-public (limited) link must still accept capacity."""
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "limited", "capacity": 20},
            headers=headers,
        )
        assert response.status_code == 200
        links = response.json()
        assert len(links) == 1
        assert links[0]["capacity"] == 20

    async def test_revoked_link_is_rejected(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        """A deactivated (is_active=False) link must be denied at the study handler.

        Regression net for the ``not link.is_active`` branch in
        validate_link_token (audit I) — previously only the cross-study and
        capacity branches had coverage.
        """
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "public"},
            headers=headers,
        )
        token = response.json()[0]["token"]

        # Control: the active link is accepted.
        ok = await client.get(f"/api/study/{study.slug}?link_token={token}")
        assert ok.status_code == 200

        # Revoke the link server-side (is_active is not settable via the API).
        result = await db.execute(
            select(RecruitmentLink).where(RecruitmentLink.token == token)
        )
        link = result.scalar_one()
        link.is_active = False
        await db.commit()

        denied = await client.get(f"/api/study/{study.slug}?link_token={token}")
        assert denied.status_code == 403
        assert "recruitment link" in denied.text.lower()

    async def test_expired_link_is_rejected(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        """A link whose expires_at is in the past must be denied at the handler.

        Regression net for the ``expires_at < now`` branch in
        validate_link_token (audit I).
        """
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "public"},
            headers=headers,
        )
        token = response.json()[0]["token"]

        # Backdate expiry server-side (expires_at is not settable via the API).
        result = await db.execute(
            select(RecruitmentLink).where(RecruitmentLink.token == token)
        )
        link = result.scalar_one()
        link.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        await db.commit()

        denied = await client.get(f"/api/study/{study.slug}?link_token={token}")
        assert denied.status_code == 403
        assert "recruitment link" in denied.text.lower()

        # Control: a future expiry is still accepted.
        link.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
        await db.commit()
        ok = await client.get(f"/api/study/{study.slug}?link_token={token}")
        assert ok.status_code == 200

    async def test_create_excludes_server_controlled_fields(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        """expires_at and is_active should not be settable via create endpoint."""
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        headers = auth_token_factory(test_user)

        # Create with is_active=False — should be ignored (server controls this)
        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "public", "is_active": False},
            headers=headers,
        )
        if response.status_code == 200:
            links = response.json()
            assert links[0]["is_active"] is True

    async def test_revoke_link_succeeds(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        """Owner can revoke a recruitment link via DELETE /api/admin/recruitment/links/{id}."""
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        headers = auth_token_factory(test_user)

        # Create a link
        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "public"},
            headers=headers,
        )
        assert response.status_code == 200
        link_id = response.json()[0]["id"]

        # Delete the link
        response = await client.delete(
            f"/api/admin/recruitment/links/{link_id}",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json() == {"status": "revoked"}

        # Confirm it is gone
        list_response = await client.get(
            f"/api/admin/recruitment/{study.slug}/links",
            headers=headers,
        )
        assert list_response.status_code == 200
        ids = [link["id"] for link in list_response.json()]
        assert link_id not in ids

    async def test_revoke_link_rejected_for_viewer(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
        user_factory,
    ):
        """A viewer-role member must receive 403 when attempting to revoke a link."""
        ws = await project_factory(owner=test_user)
        study = await study_factory(project=ws, owner=test_user)
        owner_headers = auth_token_factory(test_user)

        # Owner creates a link
        response = await client.post(
            f"/api/admin/recruitment/{study.slug}/links?count=1",
            json={"type": "public"},
            headers=owner_headers,
        )
        assert response.status_code == 200
        link_id = response.json()[0]["id"]

        # Add a viewer to the project
        viewer = await user_factory()
        await project_member_factory(ws, viewer, ProjectRole.viewer)
        viewer_headers = auth_token_factory(viewer)

        # Viewer tries to revoke — must be rejected
        response = await client.delete(
            f"/api/admin/recruitment/links/{link_id}",
            headers=viewer_headers,
        )
        assert response.status_code == 403


@pytest.mark.asyncio
class TestInvitations:
    """Tests for collaborator invitation flow."""

    async def test_invitation_flow(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        study_factory,
        project_factory,
        project_member_factory,
    ):
        ws = await project_factory(owner=test_user)
        await study_factory(project=ws, owner=test_user)
        # test_user is admin
        headers = auth_token_factory(test_user)

        # 1. Invite
        response = await client.post(
            f"/api/admin/projects/{ws.slug}/invitations",
            json={"email": "collab@test.com", "role": "member"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        token = data["token"]
        # Also check invite_url matches expected format
        assert "register?token=" in data["invite_url"]

        # 2. Verify Token
        response = await client.get(f"/api/admin/invitations/verify?token={token}")
        assert response.status_code == 200
        assert response.json()["email"] == "collab@test.com"
        assert response.json()["project_name"] == ws.title
        assert response.json()["project_id"] == ws.id
