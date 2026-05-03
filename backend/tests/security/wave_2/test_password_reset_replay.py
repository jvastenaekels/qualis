# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression test for F-03-002 — Password-reset token replay (pwa-gated).

Disposition: observation, not a finding. The password-reset token has
no JTI denylist entry; single-use semantics are enforced by the
``pwa`` claim round-trip:

1. At issue time, ``create_email_token`` embeds
   ``pwa = int(password_changed_at.timestamp() * 1_000_000)``.
2. At consume time, ``password_reset_confirm`` (auth.py:639-643)
   re-derives ``pwa_now`` from the user's current
   ``password_changed_at`` and 400s on mismatch.
3. After a successful consume the route advances
   ``password_changed_at = now()``, so any further replay's ``pwa``
   no longer matches.

The pre-consume window between issue and first use is the standard
email-channel attack model (an attacker with read access to the
mailbox can use the token once before the legitimate owner). This
is "as designed" for password reset and is not a finding.

This test pins the post-consume invariant: a token that has been
used MUST 400 on every subsequent attempt, even within ``exp``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.utils.security import create_email_token, get_password_hash


@pytest.mark.asyncio
class TestPasswordResetReplay:
    async def test_replay_after_consume_is_400(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Replaying a consumed reset token: pwa mismatch → 400 token_already_consumed."""
        original_pca = datetime(2026, 1, 1, tzinfo=timezone.utc)
        user = User(
            email="reset-replay@example.com",
            hashed_password=get_password_hash("old-password"),
            email_verified_at=datetime.now(timezone.utc),
            password_changed_at=original_pca,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        token = create_email_token(
            email=user.email,
            purpose="password_reset",
            expires_delta=timedelta(hours=1),
            password_changed_at=original_pca,
        )

        # First consume: success.
        first = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "new-password-1"},
        )
        assert first.status_code == 200, first.text

        await db.refresh(user)
        # password_changed_at advanced past original_pca.
        assert user.password_changed_at > original_pca

        # Replay: pwa in token still encodes original_pca, but pwa_now
        # is derived from the new password_changed_at. Mismatch → 400.
        second = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "new-password-2"},
        )
        assert second.status_code == 400
        assert second.json()["message"] == "token_already_consumed"

    async def test_pwa_mismatch_rejected_without_consume_attempt(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """A token issued with a stale pwa (e.g. user reset password through another channel) is rejected."""
        old_pca = datetime(2026, 1, 1, tzinfo=timezone.utc)
        new_pca = datetime(2026, 2, 1, tzinfo=timezone.utc)

        user = User(
            email="reset-stale@example.com",
            hashed_password=get_password_hash("pw"),
            email_verified_at=datetime.now(timezone.utc),
            password_changed_at=new_pca,
        )
        db.add(user)
        await db.commit()

        # Token minted with the OLD pwa — represents a token issued
        # before another channel rotated the password.
        token = create_email_token(
            email=user.email,
            purpose="password_reset",
            expires_delta=timedelta(hours=1),
            password_changed_at=old_pca,
        )

        response = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "new-password"},
        )
        assert response.status_code == 400
        assert response.json()["message"] == "token_already_consumed"

    async def test_invalid_signature_rejected(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """A tampered token is rejected before any DB lookup."""
        response = await client.post(
            "/api/password/reset/confirm",
            json={"token": "not-a-jwt", "new_password": "long-enough-password"},
        )
        assert response.status_code == 400
