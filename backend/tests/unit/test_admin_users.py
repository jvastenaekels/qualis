from unittest.mock import MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User
from app.schemas import UserCreate
from app.utils.security import get_password_hash
from app.routers.admin.users import create_user, delete_user
from fastapi import HTTPException, status


def _mock_request():
    """Create a minimal mock Request for rate-limited endpoints."""
    req = MagicMock()
    req.state = MagicMock()
    return req


@pytest.mark.asyncio
async def test_create_user_success(db: AsyncSession):
    """Test successful user creation by an admin."""
    user_in = UserCreate(
        email="newuser@example.com",
        full_name=None,
        password="securepassword",
        is_active=True,
        is_superuser=False,
    )

    # Mock check_superuser dependency returning an admin user
    admin_user = User(id=1, email="admin@example.com", is_superuser=True)

    result = await create_user(
        request=_mock_request(), user_in=user_in, db=db, _admin=admin_user
    )

    assert result.email == "newuser@example.com"
    assert result.is_superuser is False

    # Verify in DB
    db_result = await db.execute(
        select(User).where(User.email == "newuser@example.com")
    )
    db_user = db_result.scalar_one_or_none()
    assert db_user is not None
    assert db_user.email == "newuser@example.com"


@pytest.mark.asyncio
async def test_create_duplicate_user_fails(db: AsyncSession):
    """Test that creating a user with an existing email fails."""
    # Create existing user
    existing_user = User(
        email="duplicate@example.com",
        hashed_password=get_password_hash("password123"),
        is_active=True,
    )
    db.add(existing_user)
    await db.commit()

    user_in = UserCreate(
        email="duplicate@example.com",
        full_name=None,
        password="newpassword",
        is_active=True,
    )

    admin_user = User(id=1, is_superuser=True)

    with pytest.raises(HTTPException) as excinfo:
        await create_user(
            request=_mock_request(), user_in=user_in, db=db, _admin=admin_user
        )

    assert excinfo.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "already exists" in excinfo.value.detail


@pytest.mark.asyncio
async def test_delete_user_success(db: AsyncSession):
    """Test successful user deletion by an admin."""
    target_user = User(
        email="todelete@example.com",
        hashed_password=get_password_hash("password123"),
        is_active=True,
    )
    db.add(target_user)
    await db.commit()
    await db.refresh(target_user)

    admin_user = User(id=999, is_superuser=True)  # Use a far-off ID to avoid collision

    await delete_user(
        request=_mock_request(), user_id=target_user.id, db=db, current_user=admin_user
    )

    # Verify deleted
    db_result = await db.execute(select(User).where(User.id == target_user.id))
    assert db_result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_self_fails(db: AsyncSession):
    """Test that an admin cannot delete their own account."""
    admin_user = User(
        id=1,
        email="admin@example.com",
        is_superuser=True,
        hashed_password=get_password_hash("password123"),
    )
    db.add(admin_user)
    await db.commit()
    await db.refresh(admin_user)

    with pytest.raises(HTTPException) as excinfo:
        await delete_user(
            request=_mock_request(),
            user_id=admin_user.id,
            db=db,
            current_user=admin_user,
        )

    assert excinfo.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "own account" in excinfo.value.detail
