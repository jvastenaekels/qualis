"""Setting is_active=False must immediately reject the user's bearer token."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


@pytest.mark.asyncio
async def test_inactive_user_token_rejected(
    client: AsyncClient,
    regular_user: User,
    regular_user_token: str,
    db: AsyncSession,
) -> None:
    headers = {"Authorization": f"Bearer {regular_user_token}"}

    # Sanity: token works while active.
    ok = await client.get("/api/me", headers=headers)
    assert ok.status_code == 200

    # Flip the flag and refresh the row.
    regular_user.is_active = False
    await db.commit()

    # Same token, now refused.
    locked = await client.get("/api/me", headers=headers)
    assert locked.status_code == 401
    # Security invariant: a deactivated user's token must be
    # response-indistinguishable from an invalid/stale token — same 401,
    # same generic message. If this ever returns the get_current_active_user
    # 400 "Inactive user" body, that is an account-enumeration channel.
    # Note: the error middleware wraps HTTPException.detail into {"message": ...}.
    assert locked.json()["message"] == "Could not validate credentials"
