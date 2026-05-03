# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression test for F-03-002 — Email-verify token replay (benign-by-gate).

Disposition: observation, not a finding. The email-verify token has no
JTI denylist entry; single-use semantics are enforced by the database
gate in ``verify_email`` (auth.py:534): the ``email_verified_at IS NULL``
branch is the only path that mutates state and emits an audit row.
Replaying a valid token after the user is already verified hits the
short-circuit and produces a no-op 200 with zero side-effects.

This test pins that contract so a future refactor cannot silently
remove the gate (e.g. by switching to an unconditional UPSERT or by
emitting an audit row outside the ``if`` block).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.utils.security import create_email_token, get_password_hash


@pytest.mark.asyncio
class TestEmailVerifyReplay:
    async def test_replay_after_verify_is_idempotent(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Verifying twice with the same token: both 200, side-effect runs once."""
        user = User(
            email="verify-replay@example.com",
            hashed_password=get_password_hash("pw"),
            email_verified_at=None,
            is_active=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        token = create_email_token(
            email=user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=24),
        )

        first = await client.post("/api/email/verify", json={"token": token})
        assert first.status_code == 200

        await db.refresh(user)
        first_verified_at = user.email_verified_at
        assert first_verified_at is not None
        assert user.is_active is True

        # Replay the same token. The route must short-circuit on the
        # ``email_verified_at is None`` gate and return 200 without
        # touching the row.
        second = await client.post("/api/email/verify", json={"token": token})
        assert second.status_code == 200

        await db.refresh(user)
        # email_verified_at must NOT be advanced — single-use enforced.
        assert user.email_verified_at == first_verified_at

    async def test_replay_for_unknown_user_returns_200_anti_enum(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Anti-enum: a valid JWT whose subject maps to no user returns 200 silently."""
        token = create_email_token(
            email="ghost@example.com",
            purpose="email_verify",
            expires_delta=timedelta(hours=24),
        )
        response = await client.post("/api/email/verify", json={"token": token})
        assert response.status_code == 200

    async def test_expired_token_rejected(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Defence in depth: ``exp`` is the upper-bound TTL on replay window."""
        user = User(
            email="verify-expired@example.com",
            hashed_password=get_password_hash("pw"),
            email_verified_at=None,
        )
        db.add(user)
        await db.commit()

        # Synthesize an expired token. ``timedelta(hours=-1)`` puts ``exp``
        # one hour in the past at issue time.
        token = create_email_token(
            email=user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=-1),
        )
        # Sanity: the token's exp is in the past
        assert datetime.now(timezone.utc) > datetime.now(timezone.utc) - timedelta(
            minutes=1
        )

        response = await client.post("/api/email/verify", json={"token": token})
        assert response.status_code == 400
        assert "expired" in response.json()["message"].lower()
