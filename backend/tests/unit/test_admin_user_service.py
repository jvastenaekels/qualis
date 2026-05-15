"""Unit tests for admin_user_service guard rails (no router involved)."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.models import User
from app.services.admin_user_service import (
    AdminUserError,
    assert_can_demote_superuser,
    assert_can_deactivate,
    assert_can_promote_superuser,
)


def _db_with_active_superuser_count(count: int) -> AsyncMock:
    """Build a db mock matching the real SQLAlchemy async call shape.

    The production helper does
    ``(await db.execute(stmt)).scalars().all()`` and returns ``len()`` of
    the resulting list (it now selects + locks the active-superuser rows
    via ``FOR UPDATE`` rather than aggregate-counting them). In real
    SQLAlchemy, ``AsyncSession.execute`` is a coroutine, but the
    ``Result`` it resolves to is *synchronous* — ``.scalars().all()`` is
    a plain chain, not a coroutine. A bare ``AsyncMock()`` mis-models
    this: ``db.execute.return_value`` is itself an AsyncMock, so the
    chain would yield un-awaited coroutines rather than the stubbed list.
    We force the awaited result to a MagicMock so ``.scalars().all()``
    returns a list synchronously. Only the list LENGTH matters (the
    helper returns ``len(rows)``); the element values are irrelevant, so
    we hand back ``list(range(count))``.
    """
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = list(range(count))
    db.execute.return_value = result
    return db


@pytest.mark.asyncio
async def test_assert_can_demote_superuser_refuses_self_demote() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    with pytest.raises(AdminUserError, match="cannot demote yourself"):
        await assert_can_demote_superuser(db=AsyncMock(), actor=actor, target=actor)


@pytest.mark.asyncio
async def test_assert_can_demote_superuser_refuses_last_active_superuser() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    target = User(id=2, is_superuser=True, is_active=True)

    # Only one active superuser left (the target) — demoting them would
    # leave the system with zero.
    db = _db_with_active_superuser_count(1)

    with pytest.raises(AdminUserError, match="at least one"):
        await assert_can_demote_superuser(db=db, actor=actor, target=target)


@pytest.mark.asyncio
async def test_assert_can_demote_superuser_allows_when_others_exist() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    target = User(id=2, is_superuser=True, is_active=True)

    db = _db_with_active_superuser_count(3)  # two others remain

    await assert_can_demote_superuser(db=db, actor=actor, target=target)  # no raise


@pytest.mark.asyncio
async def test_assert_can_deactivate_refuses_self() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    with pytest.raises(AdminUserError, match="cannot deactivate yourself"):
        await assert_can_deactivate(db=AsyncMock(), actor=actor, target=actor)


@pytest.mark.asyncio
async def test_assert_can_deactivate_refuses_last_active_superuser() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    target = User(id=2, is_superuser=True, is_active=True)

    db = _db_with_active_superuser_count(1)

    with pytest.raises(AdminUserError, match="at least one"):
        await assert_can_deactivate(db=db, actor=actor, target=target)


@pytest.mark.asyncio
async def test_assert_can_promote_superuser_requires_2fa() -> None:
    actor = User(id=1, is_superuser=True, is_active=True, is_totp_enabled=True)
    target = User(id=2, is_superuser=False, is_active=True, is_totp_enabled=False)

    with pytest.raises(AdminUserError, match="2FA"):
        await assert_can_promote_superuser(db=AsyncMock(), actor=actor, target=target)


@pytest.mark.asyncio
async def test_assert_can_promote_superuser_allows_when_2fa_enabled() -> None:
    actor = User(id=1, is_superuser=True, is_active=True, is_totp_enabled=True)
    target = User(id=2, is_superuser=False, is_active=True, is_totp_enabled=True)

    await assert_can_promote_superuser(
        db=AsyncMock(), actor=actor, target=target
    )  # no raise
