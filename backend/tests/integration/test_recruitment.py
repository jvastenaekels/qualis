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
        workspace_factory,
        workspace_member_factory,
    ):
        # 1. Setup
        ws = await workspace_factory(owner=test_user)
        study = await study_factory(workspace=ws, owner=test_user)
        # test_user is already admin of workspace via factory
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
        workspace_factory,
        workspace_member_factory,
    ):
        ws = await workspace_factory(owner=test_user)
        await study_factory(workspace=ws, owner=test_user)
        # test_user is admin
        headers = auth_token_factory(test_user)

        # 1. Invite
        response = await client.post(
            f"/api/admin/workspaces/{ws.slug}/invitations",
            json={"email": "collab@test.com", "role": "researcher"},
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
        assert response.json()["workspace_name"] == ws.title
        assert response.json()["workspace_id"] == ws.id
