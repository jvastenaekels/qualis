"""Integration tests for admin user management API."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.utils.security import create_access_token, get_password_hash


@pytest_asyncio.fixture
async def super_user(db: AsyncSession):
    """Creates a superuser for testing."""
    user = User(
        email="super@example.com",
        hashed_password=get_password_hash("password123"),
        is_active=True,
        is_superuser=True,
    )
    db.add(user)
    await db.commit()
    return user


@pytest_asyncio.fixture
async def normal_user(db: AsyncSession):
    """Creates a normal user for testing."""
    user = User(
        email="normal@example.com",
        hashed_password=get_password_hash("password123"),
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    await db.commit()
    return user


@pytest.mark.asyncio
async def test_list_users_as_superuser(client: AsyncClient, super_user: User):
    """Test that a superuser can list all users."""
    token = create_access_token(subject=super_user.email)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/api/admin/users/", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    emails = [u["email"] for u in data]
    assert super_user.email in emails


@pytest.mark.asyncio
async def test_list_users_as_normal_user_denied(client: AsyncClient, normal_user: User):
    """Test that a normal user cannot list users."""
    token = create_access_token(subject=normal_user.email)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/api/admin/users/", headers=headers)
    assert response.status_code == 403
    assert "Superuser privileges required" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_user_as_superuser(
    client: AsyncClient, super_user: User, db: AsyncSession
):
    """Test that a superuser can create a new user."""
    token = create_access_token(subject=super_user.email)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "email": "newuser@example.com",
        "password": "newpassword123",
        "is_superuser": False,
    }

    response = await client.post("/api/admin/users/", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["is_superuser"] is False

    # Verify in DB
    result = await db.execute(select(User).where(User.email == "newuser@example.com"))
    user = result.scalar_one()
    assert user is not None


@pytest.mark.asyncio
async def test_delete_user_as_superuser(
    client: AsyncClient, super_user: User, normal_user: User, db: AsyncSession
):
    """Test that a superuser can delete another user."""
    token = create_access_token(subject=super_user.email)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.delete(
        f"/api/admin/users/{normal_user.id}", headers=headers
    )
    assert response.status_code == 204

    # Verify in DB
    result = await db.execute(select(User).where(User.id == normal_user.id))
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_self_denied(client: AsyncClient, super_user: User):
    """Test that a superuser cannot delete themselves."""
    token = create_access_token(subject=super_user.email)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.delete(f"/api/admin/users/{super_user.id}", headers=headers)
    assert response.status_code == 400
    assert "Cannot delete your own account" in response.json()["detail"]
