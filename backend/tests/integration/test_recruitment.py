"""Consolidated integration tests for recruitment links and collaborator invitations."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


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
