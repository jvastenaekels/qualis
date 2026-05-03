# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression test for F-03-003 — consumed_email_tokens cleanup hygiene.

Disposition: minor. The ``cleanup_consumed_email_tokens.py`` script
deletes rows older than 7 days but is **not** wired into the Procfile
or any other scheduler in the repo. Operators are expected to run it
from cron per ``docs/guides/deployment.md`` (the cron line is
documented). Without that, the table grows monotonically.

Volume estimate: each row is ~100 bytes. At an upper-bound of 1000
2FA-disable confirmations per year, that is ~100 KB/year — pure
hygiene, not a security boundary. The fix is operational; this PR
adds a regression test pinning the cleanup contract and leaves
infrastructure wiring to Wave 6 (supply-chain hardening).

The test verifies: the cleanup function deletes ONLY rows older than
the cutoff and leaves recent rows intact. This guards against a
future refactor that flips the comparator (e.g. ``> cutoff`` instead
of ``< cutoff``) and silently nukes the live denylist.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConsumedEmailToken
from app.services.email_token_consume_service import (
    cleanup_consumed,
    is_jti_consumed,
)


@pytest.mark.asyncio
class TestCleanupConsumedTokens:
    async def test_only_old_rows_deleted(self, db: AsyncSession) -> None:
        """Cleanup keeps rows newer than the cutoff."""
        now = datetime.now(timezone.utc)
        very_old = ConsumedEmailToken(
            jti="very-old", purpose="twofa_disable", consumed_at=now - timedelta(days=30)
        )
        old = ConsumedEmailToken(
            jti="old", purpose="twofa_disable", consumed_at=now - timedelta(days=8)
        )
        recent = ConsumedEmailToken(
            jti="recent", purpose="twofa_disable", consumed_at=now - timedelta(days=2)
        )
        fresh = ConsumedEmailToken(
            jti="fresh", purpose="twofa_disable", consumed_at=now - timedelta(hours=1)
        )
        db.add_all([very_old, old, recent, fresh])
        await db.commit()

        deleted = await cleanup_consumed(db, older_than=timedelta(days=7))
        await db.commit()

        assert deleted == 2
        # The two stale rows are gone.
        assert await is_jti_consumed(db, "very-old") is False
        assert await is_jti_consumed(db, "old") is False
        # The two recent rows survive — denylist is intact.
        assert await is_jti_consumed(db, "recent") is True
        assert await is_jti_consumed(db, "fresh") is True

    async def test_cleanup_with_no_old_rows_is_noop(
        self, db: AsyncSession
    ) -> None:
        """Calling cleanup against a fresh denylist deletes 0 rows."""
        now = datetime.now(timezone.utc)
        recent = ConsumedEmailToken(
            jti="recent-only",
            purpose="twofa_disable",
            consumed_at=now - timedelta(hours=1),
        )
        db.add(recent)
        await db.commit()

        deleted = await cleanup_consumed(db, older_than=timedelta(days=7))
        await db.commit()

        assert deleted == 0
        assert await is_jti_consumed(db, "recent-only") is True
