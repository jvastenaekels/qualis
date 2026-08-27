from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import User
from app.utils.security import get_password_hash
from app.routers.admin.users import delete_user
from fastapi import HTTPException, status


def _mock_request():
    """Create a minimal mock Request for rate-limited endpoints."""
    req = MagicMock()
    req.state = MagicMock()
    return req


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


@pytest.mark.asyncio
async def test_list_users_includes_admin_audit_fields(
    client: AsyncClient, superuser_token: str
) -> None:
    """GET /api/admin/users returns UserReadAdmin, which includes audit fields."""
    resp = await client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1, "at least the seeded superuser must appear"
    item = data["items"][0]
    assert "password_changed_at" in item
    assert item["password_changed_at"] is not None
    assert "last_login_at" in item
    assert "email_verified_at" in item
