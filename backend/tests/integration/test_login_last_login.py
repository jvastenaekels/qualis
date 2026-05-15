"""last_login_at is set only on a fully successful /api/token call."""

import pytest
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


@pytest.mark.asyncio
async def test_last_login_at_set_on_successful_login(
    client: AsyncClient, regular_user: User, db: AsyncSession
) -> None:
    assert regular_user.last_login_at is None

    resp = await client.post(
        "/api/token",
        data={"username": regular_user.email, "password": "regular-pw"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    await db.refresh(regular_user)
    assert regular_user.last_login_at is not None
    delta = (datetime.now(timezone.utc) - regular_user.last_login_at).total_seconds()
    assert 0 <= delta < 5, f"last_login_at not recent: delta={delta}s"


@pytest.mark.asyncio
async def test_last_login_at_unset_on_wrong_password(
    client: AsyncClient, regular_user: User, db: AsyncSession
) -> None:
    resp = await client.post(
        "/api/token",
        data={"username": regular_user.email, "password": "WRONG"},
    )
    assert resp.status_code == 401

    await db.refresh(regular_user)
    assert regular_user.last_login_at is None


@pytest.mark.asyncio
async def test_last_login_at_unset_on_requires_2fa_response(
    client: AsyncClient, totp_user: User, db: AsyncSession
) -> None:
    # totp_user has is_totp_enabled=True, channel='app', no header passed
    # -> requires_2fa response, no actual session issued.
    resp = await client.post(
        "/api/token",
        data={"username": totp_user.email, "password": "totp-pw"},
    )
    assert resp.status_code == 200
    assert resp.json().get("requires_2fa") is True
    assert resp.json().get("access_token") is None

    await db.refresh(totp_user)
    assert totp_user.last_login_at is None
