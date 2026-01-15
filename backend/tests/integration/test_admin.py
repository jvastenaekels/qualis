"""Consolidated integration tests for global admin (superusers) and infrastructure."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.utils.security import create_access_token


@pytest.fixture
async def super_user(db: AsyncSession, user_factory):
    """Creates a superuser for testing."""
    user = await user_factory(email="super@admin.com")
    user.is_superuser = True
    await db.commit()
    return user


@pytest.mark.asyncio
class TestAdminUsers:
    """Tests for superuser-only user management."""

    async def test_list_users_as_superuser(self, client: AsyncClient, super_user: User):
        headers = {"Authorization": f"Bearer {create_access_token(super_user.email)}"}
        response = await client.get("/api/admin/users", headers=headers)
        assert response.status_code == 200
        assert any(u["email"] == super_user.email for u in response.json())

    async def test_list_users_forbidden_for_normal(
        self, client: AsyncClient, test_user: User
    ):
        headers = {"Authorization": f"Bearer {create_access_token(test_user.email)}"}
        response = await client.get("/api/admin/users", headers=headers)
        assert response.status_code == 403


@pytest.mark.asyncio
class TestAdminWorkspaces:
    """Tests for global workspace management."""

    async def test_create_workspace_as_superuser(
        self, client: AsyncClient, super_user: User, test_user: User
    ):
        headers = {"Authorization": f"Bearer {create_access_token(super_user.email)}"}
        payload = {"title": "Global WS", "slug": "global-ws", "owner_id": test_user.id}
        response = await client.post(
            "/api/admin/workspaces", json=payload, headers=headers
        )
        assert response.status_code == 201
        assert response.json()["slug"] == "global-ws"


@pytest.mark.asyncio
class TestLogs:
    """Tests for the frontend error reporting API."""

    async def test_report_log_success(self, client: AsyncClient):
        payload = {
            "level": "error",
            "message": "Front-end crash",
            "url": "http://localhost/test",
            "userAgent": "TestAgent",
        }
        response = await client.post("/api/logs", json=payload)
        assert response.status_code == 200
        assert response.json()["status"] == "received"
