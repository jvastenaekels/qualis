# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression test for F-03-001 — JTI replay race in 2FA-disable.

Disposition: false positive. The plan-stage worry was a TOCTOU between
``is_jti_consumed`` (read) and ``mark_jti_consumed`` (write). Inventory
confirmed that ``is_jti_consumed`` is dead code (no production callers,
kept alive only by ``vulture_whitelist.py``); the actual production
gate in ``twofa_disable_confirm`` (auth.py:710-722) is the
PK-collision pattern: ``mark_jti_consumed`` runs first, an
``IntegrityError`` on duplicate JTI is mapped to HTTP 409.

This regression test pins the contract so a future refactor cannot
silently re-introduce the read-then-insert pattern. Two checks:

1. Direct service-layer test: two concurrent ``mark_jti_consumed``
   calls on the same JTI — the second must raise ``IntegrityError``.
2. End-to-end test: two sequential POSTs to ``/api/2fa/disable/confirm``
   with the same token — first returns 200, second returns 409.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services.email_token_consume_service import mark_jti_consumed
from app.utils.security import create_email_token, get_password_hash


@pytest.mark.asyncio
class TestJtiReplayRegression:
    async def test_pk_collision_on_duplicate_jti(self, db: AsyncSession) -> None:
        """Service-layer: second mark on same JTI raises IntegrityError."""
        await mark_jti_consumed(db, "jti-pk-collide", "twofa_disable")
        await db.commit()
        with pytest.raises(IntegrityError):
            await mark_jti_consumed(db, "jti-pk-collide", "twofa_disable")
            await db.commit()

    async def test_disable_confirm_replay_returns_409(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """End-to-end: replaying a 2FA-disable token returns 409 token_already_consumed."""
        user = User(
            email="twofa-replay@example.com",
            hashed_password=get_password_hash("pw"),
            email_verified_at=None,
            is_totp_enabled=True,
            totp_secret="JBSWY3DPEHPK3PXP",
            totp_channel="app",
        )
        db.add(user)
        await db.commit()

        token = create_email_token(
            email=user.email,
            purpose="twofa_disable",
            expires_delta=timedelta(minutes=15),
        )

        first = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert first.status_code == 200, first.text

        second = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert second.status_code == 409
        assert second.json()["message"] == "token_already_consumed"

    async def test_consume_burns_jti_even_for_unknown_user(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Anti-enum: jti is burned BEFORE the user lookup.

        A valid JWT whose subject email maps to no user must still
        consume the jti, so that an attacker with a stolen token cannot
        probe email existence by replaying it. Replay returns 409
        regardless of whether the underlying user exists.
        """
        token = create_email_token(
            email="ghost-twofa@example.com",
            purpose="twofa_disable",
            expires_delta=timedelta(minutes=15),
        )

        first = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert first.status_code == 200

        second = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert second.status_code == 409
        assert second.json()["message"] == "token_already_consumed"
