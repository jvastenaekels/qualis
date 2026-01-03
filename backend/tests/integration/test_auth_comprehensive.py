"""Comprehensive integration tests for auth router.

Target: >90% coverage for routers/auth.py
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


class TestLogin:
    """Tests for POST /api/token"""

    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient, test_user: User):
        """Valid credentials return access token."""
        response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": "testpassword"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Wrong password returns 401."""
        response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": "wrongpassword"},
        )
        assert response.status_code == 401
        assert "Incorrect" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Non-existent user returns 401."""
        response = await client.post(
            "/api/token",
            data={"username": "nobody@example.com", "password": "anypassword"},
        )
        assert response.status_code == 401


class TestRegister:
    """Tests for POST /api/register"""

    @pytest.mark.asyncio
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

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client: AsyncClient, test_user: User):
        """Duplicate email returns 400."""
        response = await client.post(
            "/api/register",
            json={"email": test_user.email, "password": "anypassword"},
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_with_valid_invitation(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
    ):
        """Registration with valid invitation token adds user to study."""
        from app.models import StudyCollaborator, StudyRole
        from app.utils.security import create_invitation_token

        # Setup: Create study
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)

        # Create invitation token
        token = create_invitation_token(
            email="invited@example.com",
            study_id=study.id,
            role="editor",
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

        # Verify collaborator was added
        result = await db.execute(
            select(StudyCollaborator).where(
                StudyCollaborator.study_id == study.id,
            )
        )
        collaborators = result.scalars().all()
        emails = []
        for c in collaborators:
            user_result = await db.execute(select(User).where(User.id == c.user_id))
            u = user_result.scalar_one()
            emails.append(u.email)
        assert "invited@example.com" in emails


class TestMe:
    """Tests for GET /api/me"""

    @pytest.mark.asyncio
    async def test_me_authenticated(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        """Authenticated user can get their info."""
        headers = auth_token_factory(test_user)
        response = await client.get("/api/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email

    @pytest.mark.asyncio
    async def test_me_unauthenticated(self, client: AsyncClient):
        """Unauthenticated request returns 401."""
        response = await client.get("/api/me")
        assert response.status_code == 401
