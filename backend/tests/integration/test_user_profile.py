import os
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User
from app.utils.security import get_password_hash

# -----------------------------------------------------------------------------
# Profile Tests
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_current_user_profile(
    client: AsyncClient,
    test_user: User,
    auth_token_factory,
):
    """Test getting the current user's profile."""
    headers = auth_token_factory(test_user)
    response = await client.get("/api/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_user.email
    assert "full_name" in data


@pytest.mark.asyncio
async def test_update_user_profile(
    client: AsyncClient,
    test_user: User,
    auth_token_factory,
):
    """Test updating the user's profile (Full Name)."""
    headers = auth_token_factory(test_user)
    new_name = "Updated Admin Name"
    payload = {"full_name": new_name}

    response = await client.patch("/api/me", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == new_name


@pytest.mark.asyncio
async def test_update_user_email_conflict(
    client: AsyncClient,
    test_user: User,
    auth_token_factory,
    db: AsyncSession,
):
    """Test updating email to one that already exists."""
    headers = auth_token_factory(test_user)

    # Create another user first
    other_user = User(
        email="other@example.com",
        hashed_password=get_password_hash("password123"),
        is_active=True,
    )
    db.add(other_user)
    await db.commit()

    payload = {"email": "other@example.com"}
    response = await client.patch("/api/me", json=payload, headers=headers)
    assert response.status_code == 400
    # Detail might strictly match "Email already registered" or similar
    assert "already registered" in response.json()["detail"]


# -----------------------------------------------------------------------------
# Password Change Tests
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_change_password_success(
    client: AsyncClient,
    test_user: User,
    auth_token_factory,
):
    """Test successful password change."""
    headers = auth_token_factory(test_user)
    # test_user fixture is created with TEST_PASSWORD="testpassword" in conftest.py
    current_password = "testpassword"
    new_password = "newSecurePassword123!"

    payload = {"current_password": current_password, "new_password": new_password}

    response = await client.post("/api/me/password", json=payload, headers=headers)

    assert response.status_code == 200
    assert response.json()["message"] == "Password updated successfully"

    # Verify we can login with the new password
    login_response = await client.post(
        "/api/token",
        data={"username": test_user.email, "password": new_password},
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


@pytest.mark.asyncio
async def test_change_password_wrong_current(
    client: AsyncClient,
    test_user: User,
    auth_token_factory,
):
    """Test password change with incorrect current password."""
    headers = auth_token_factory(test_user)
    payload = {
        "current_password": "wrongpassword",
        "new_password": "newSecurePassword123!",
    }
    response = await client.post("/api/me/password", json=payload, headers=headers)
    assert response.status_code == 400
    assert "Incorrect current password" in response.json()["detail"]


# -----------------------------------------------------------------------------
# Rate Limiting Tests
# -----------------------------------------------------------------------------


@pytest.mark.skipif(
    os.getenv("TESTING", "").lower() == "true",
    reason="Rate limiting is disabled in testing mode",
)
@pytest.mark.asyncio
async def test_rate_limiting_login(client: AsyncClient):
    """Test rate limiting on the login endpoint."""
    # We configured 5/minute.
    # Previous tests might have consumed some quota.
    # We loop until we hit 429 or a reasonable max to avoid infinite loops.

    limit_hit = False
    for _ in range(10):
        response = await client.post(
            "/api/token",
            data={"username": "wrong@example.com", "password": "wrongpassword"},
        )
        if response.status_code == 429:
            limit_hit = True
            break

    assert limit_hit, "Rate limit should have been reached within 10 requests"
    assert "Rate limit exceeded" in response.text
