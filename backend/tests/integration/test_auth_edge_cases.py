"""Edge case integration tests for authentication."""

import pytest
from datetime import timedelta
from httpx import AsyncClient
from app.utils.security import create_invitation_token, create_access_token


class TestAuthEdgeCases:
    """Tests covering expiration, invalid signatures, and token mismatches."""

    @pytest.mark.asyncio
    async def test_register_invitation_token_email_mismatch(self, client: AsyncClient):
        """Invitation token email must match registration email."""
        token = create_invitation_token(
            email="invited@example.com",
            study_id=1,
            role="editor",
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
        assert "does not match" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_invitation_token_expired(self, client: AsyncClient):
        """Expired invitation token is rejected."""
        token = create_invitation_token(
            email="late@example.com",
            study_id=1,
            role="editor",
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
        # detail will say "Invalid invitation token: Signature has expired"
        assert "Invalid invitation token" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_invitation_token_malformed(self, client: AsyncClient):
        """Malformed invitation token is rejected."""
        response = await client.post(
            "/api/register",
            json={
                "email": "hacker@example.com",
                "password": "password123",
                "invitation_token": "invalid.jwt.token",
            },
        )
        assert response.status_code == 400
        assert "Invalid invitation token" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_access_token_expired(self, client: AsyncClient, test_user):
        """Expired access token is rejected."""
        token = create_access_token(
            subject=test_user.email,
            expires_delta=timedelta(minutes=-1),
        )

        response = await client.get(
            "/api/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        assert "Could not validate credentials" in response.json()["detail"]
