"""Consolidated integration tests for authentication, user profiles, and 2FA."""

import os
import pytest
import pyotp
from datetime import timedelta
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, WorkspaceRole, WorkspaceMember
from app.utils.security import create_invitation_token
from tests.conftest import TEST_PASSWORD


@pytest.mark.asyncio
class TestAuth:
    """Tests for authentication and token generation."""

    async def test_login_success(self, client: AsyncClient, test_user: User):
        """Valid credentials return access token."""
        response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Wrong password returns 401."""
        response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": "wrongpassword"},
        )
        assert response.status_code == 401
        assert "Incorrect" in response.json()["message"]

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Non-existent user returns 401."""
        response = await client.post(
            "/api/token",
            data={"username": "nobody@example.com", "password": "anypassword"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
class TestRegistration:
    """Tests for user registration."""

    async def test_register_success(self, client: AsyncClient, db: AsyncSession):
        """New user registration creates account."""
        response = await client.post(
            "/api/register",
            json={"email": "newuser@example.com", "password": "securepass123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"

        # Verify in DB
        result = await db.execute(
            select(User).where(User.email == "newuser@example.com")
        )
        user = result.scalar_one_or_none()
        assert user is not None

    async def test_register_duplicate_email(self, client: AsyncClient, test_user: User):
        """Duplicate email returns 400."""
        response = await client.post(
            "/api/register",
            json={"email": test_user.email, "password": "anypassword"},
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["message"]

    async def test_register_with_valid_invitation(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
    ):
        """Registration with valid invitation token adds user to workspace."""
        # Setup: Create workspace
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)

        # Create invitation token for workspace
        token = create_invitation_token(
            email="invited@example.com",
            workspace_id=workspace.id,
            role="researcher",  # WorkspaceRole
        )

        # Register with token
        response = await client.post(
            "/api/register",
            json={
                "email": "invited@example.com",
                "password": "securepass123",
                "invitation_token": token,
            },
        )
        assert response.status_code == 201

        # Verify WorkspaceMember was added
        result = await db.execute(
            select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace.id)
        )
        members = result.scalars().all()
        assert len(members) == 2  # Owner + Invited
        invited = next(m for m in members if m.user_id != owner.id)
        assert invited.role == WorkspaceRole.researcher

    async def test_register_invitation_token_email_mismatch(
        self, client: AsyncClient, user_factory, workspace_factory
    ):
        """Invitation token email must match registration email."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        token = create_invitation_token(
            email="invited@example.com", workspace_id=workspace.id, role="researcher"
        )
        response = await client.post(
            "/api/register",
            json={
                "email": "hacker@example.com",
                "password": "password123",
                "invitation_token": token,
            },
        )
        assert response.status_code == 400
        assert "does not match" in response.json()["message"]

    async def test_register_invitation_token_expired(
        self, client: AsyncClient, user_factory, workspace_factory
    ):
        """Expired invitation token is rejected."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        token = create_invitation_token(
            email="late@example.com",
            workspace_id=workspace.id,
            role="researcher",
            expires_delta=timedelta(minutes=-1),
        )
        response = await client.post(
            "/api/register",
            json={
                "email": "late@example.com",
                "password": "password123",
                "invitation_token": token,
            },
        )
        assert response.status_code == 400
        assert "Invalid invitation token" in response.json()["message"]


@pytest.mark.asyncio
class Test2FA:
    """Tests for 2FA (TOTP) flow."""

    async def test_2fa_full_flow(
        self, client: AsyncClient, db: AsyncSession, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)

        # 1. Setup 2FA
        response = await client.get("/api/me/2fa/setup", headers=headers)
        assert response.status_code == 200
        setup_data = response.json()
        secret = setup_data["secret"]
        assert secret is not None

        # 2. Enable 2FA
        totp = pyotp.TOTP(secret)
        valid_token = totp.now()
        response = await client.post(
            "/api/me/2fa/enable", json={"token": valid_token}, headers=headers
        )
        assert response.status_code == 200

        # 3. Login with 2FA
        # First step: regular login returns requires_2fa
        response = await client.post(
            "/api/token", data={"username": test_user.email, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        assert response.json()["requires_2fa"] is True

        # Second step: login with 2FA header
        valid_token = totp.now()
        response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
            headers={"X-TOTP-Token": valid_token},
        )
        assert response.status_code == 200
        assert "access_token" in response.json()

        # 4. Disable 2FA
        response = await client.post(
            "/api/me/2fa/disable",
            json={
                "current_password": TEST_PASSWORD,
                "new_password": "newsecurepassword123",
            },
            headers=headers,
        )
        assert response.status_code == 200
        await db.refresh(test_user)
        assert test_user.is_totp_enabled is False


@pytest.mark.asyncio
class TestProfile:
    """Tests for user profile management."""

    async def test_get_profile(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        response = await client.get("/api/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["email"] == test_user.email

    async def test_update_profile(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        response = await client.patch(
            "/api/me", json={"full_name": "New Name"}, headers=headers
        )
        assert response.status_code == 200
        assert response.json()["full_name"] == "New Name"

    async def test_change_password_success(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        payload = {
            "current_password": TEST_PASSWORD,
            "new_password": "newSecurePassword123!",
        }
        response = await client.post("/api/me/password", json=payload, headers=headers)
        assert response.status_code == 200

        # Verify login
        login_response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": "newSecurePassword123!"},
        )
        assert login_response.status_code == 200

    async def test_change_password_wrong_current(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        payload = {
            "current_password": "wrongpassword",
            "new_password": "newSecurePassword123!",
        }
        response = await client.post("/api/me/password", json=payload, headers=headers)
        assert response.status_code == 400


@pytest.mark.skipif(
    os.getenv("TESTING", "").lower() == "true",
    reason="Rate limiting is disabled in testing mode",
)
@pytest.mark.asyncio
async def test_rate_limiting_login(client: AsyncClient):
    """Test rate limiting on the login endpoint."""
    limit_hit = False
    for _ in range(10):
        response = await client.post(
            "/api/token",
            data={"username": "wrong@example.com", "password": "wrongpassword"},
        )
        if response.status_code == 429:
            limit_hit = True
            break
    assert limit_hit
