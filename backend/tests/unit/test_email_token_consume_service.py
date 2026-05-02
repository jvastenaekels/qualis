"""Unit tests for the JTI single-use denylist."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConsumedEmailToken
from app.services.email_token_consume_service import (
    cleanup_consumed,
    is_jti_consumed,
    mark_jti_consumed,
)


@pytest.mark.asyncio
class TestEmailTokenConsume:
    async def test_jti_not_consumed_initially(self, db: AsyncSession) -> None:
        assert await is_jti_consumed(db, "fresh-jti") is False

    async def test_mark_then_check(self, db: AsyncSession) -> None:
        await mark_jti_consumed(db, "jti-abc", "twofa_disable")
        await db.commit()
        assert await is_jti_consumed(db, "jti-abc") is True

    async def test_double_mark_raises_integrity(self, db: AsyncSession) -> None:
        await mark_jti_consumed(db, "jti-dup", "twofa_disable")
        await db.commit()
        with pytest.raises(IntegrityError):
            await mark_jti_consumed(db, "jti-dup", "twofa_disable")
            await db.commit()

    async def test_cleanup_deletes_old_rows(self, db: AsyncSession) -> None:
        old = ConsumedEmailToken(
            jti="old-jti",
            purpose="twofa_disable",
            consumed_at=datetime.now(timezone.utc) - timedelta(days=10),
        )
        recent = ConsumedEmailToken(
            jti="recent-jti",
            purpose="twofa_disable",
            consumed_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add_all([old, recent])
        await db.commit()

        deleted = await cleanup_consumed(db, older_than=timedelta(days=7))
        await db.commit()
        assert deleted == 1
        assert await is_jti_consumed(db, "old-jti") is False
        assert await is_jti_consumed(db, "recent-jti") is True
