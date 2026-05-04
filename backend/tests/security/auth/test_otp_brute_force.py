# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression test for F-03-004 — OTP brute-force per-account cap.

Pre-fix attack model
--------------------

A 6-digit OTP has 10^6 entropy. The per-row attempt counter caps a
single code at 5 wrong guesses, but ``issue_otp`` allows a fresh code
every ``TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS`` (default 30s). At that
rate an attacker holding the email/password pair can spin
2 codes/min × 60 × 24 = 2 880 codes/day × 5 attempts each
= 14 400 guesses/day per account — about a 1.44 % daily success
probability against one specific account, ~10 % over a week.

Post-fix invariant
------------------

``email_otp_service.verify_otp`` now sums the per-row ``attempts``
counter over rows created in the last 24h and raises
``OTPLockoutError`` once the running total reaches
``settings.TWOFA_OTP_WRONG_ATTEMPT_CAP_24H`` (30 by default). The
sum-based window means the cap is independent of how many fresh codes
the attacker rotates through. The router maps the exception to HTTP
429.

Tests in this module pin three properties:

1. **Service-layer cap.** Direct ``verify_otp`` calls raise
   ``OTPLockoutError`` exactly once the 24h sum hits the cap, even when
   the attacker spawns fresh rows between cycles.
2. **Router-layer 429.** Brute-forcing the email-channel ``POST /api/token``
   path yields HTTP 429 with ``twofa_locked`` once the cap trips.
3. **Window expiry.** Wrong attempts older than 24h drop out of the
   sliding sum and the user can verify again — no admin intervention
   required.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import TwoFAEmailOTPCode, User
from app.services.email_otp_service import (
    OTPLockoutError,
    issue_otp,
    verify_otp,
)
from app.utils.security import get_password_hash

TWOFA_OTP_WRONG_ATTEMPT_CAP_24H = settings.TWOFA_OTP_WRONG_ATTEMPT_CAP_24H


async def _user_with_email_2fa(db: AsyncSession, email: str) -> User:
    """Helper: create a user with email-channel 2FA enabled."""
    user = User(
        email=email,
        hashed_password=get_password_hash("password"),
        email_verified_at=datetime.now(timezone.utc),
        is_totp_enabled=True,
        totp_channel="email",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _seed_wrong_attempts(
    db: AsyncSession, user: User, count: int
) -> None:
    """Seed historical OTP rows with `count` total wrong attempts in the window.

    Direct ORM inserts (bypassing ``verify_otp``) keep the test wall-
    clock under 5s — each ``verify_otp`` call runs a bcrypt check
    (~150 ms) which would dominate runtime for cap-sized loops. The
    sum-based cap doesn't care whether the wrong attempts came from
    real ``verify_otp`` calls or from seeded rows; the cap query just
    sums ``attempts`` over rows in the 24h window.

    Each row gets ``attempts=5`` (the per-row max), ``used_at=now``
    (so it's not "active"), and ``created_at`` set to 5 minutes ago
    (inside the 24h window).
    """
    five_min_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
    remaining = count
    while remaining > 0:
        chunk = min(5, remaining)
        # Use a fixed expired ``expires_at`` so the row is never
        # considered active even if ``used_at`` were not set.
        row = TwoFAEmailOTPCode(
            user_id=user.id,
            code_hash="$2b$12$dummy.hash.for.seeded.wrong.attempts.padding.padding.x",
            expires_at=five_min_ago + timedelta(minutes=1),
            attempts=chunk,
            used_at=five_min_ago,
            created_at=five_min_ago,
        )
        db.add(row)
        remaining -= chunk
    await db.commit()


@pytest.mark.asyncio
class TestOTPBruteForceCap:
    async def test_verify_raises_lockout_at_cap(self, db: AsyncSession) -> None:
        """Service layer: the (cap+1)th wrong attempt raises OTPLockoutError.

        Build the wrong-attempt history up to the cap, then call
        ``verify_otp`` once more — it must raise. Stays well under the
        14 400 baseline (cap is 30 by default).
        """
        user = await _user_with_email_2fa(db, "otp-cap@example.com")

        await _seed_wrong_attempts(db, user, TWOFA_OTP_WRONG_ATTEMPT_CAP_24H)

        # One more wrong attempt: the (cap+1)th must raise.
        await issue_otp(db, user)
        await db.commit()
        with pytest.raises(OTPLockoutError):
            await verify_otp(db, user, "000000")

    async def test_verify_below_cap_does_not_raise(
        self, db: AsyncSession
    ) -> None:
        """One short of the cap: real verify still returns False (no raise).

        Pin the boundary: the cap kicks in **at** the 24h sum, not
        below. A single wrong attempt with cap-1 prior must just return
        False so legitimate users who mistype within the window don't
        eat 429s.
        """
        user = await _user_with_email_2fa(db, "otp-below@example.com")

        await _seed_wrong_attempts(db, user, TWOFA_OTP_WRONG_ATTEMPT_CAP_24H - 1)

        await issue_otp(db, user)
        await db.commit()
        ok = await verify_otp(db, user, "000000")
        await db.commit()
        assert ok is False  # wrong code, but no lockout

        # The verify_otp above incremented row.attempts to 1 → total
        # in window is now exactly cap. The next verify must raise.
        # No new issue_otp needed (it would hit the resend cooldown
        # anyway); the current row is still active and the cap check
        # runs before the row check.
        with pytest.raises(OTPLockoutError):
            await verify_otp(db, user, "000000")

    async def test_router_returns_429_when_locked(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Router layer: locked verify on /api/token returns 429 twofa_locked.

        Pre-loads the cap via the service layer (no need to hammer
        ``/token`` 30 times — that path is exercised in the unit tests),
        then sends one /token request with an OTP header to confirm the
        router's mapping from ``OTPLockoutError`` to HTTP 429.
        """
        user = await _user_with_email_2fa(db, "otp-router@example.com")
        await _seed_wrong_attempts(db, user, TWOFA_OTP_WRONG_ATTEMPT_CAP_24H)

        # Issue a fresh code so /token has something to verify against
        # (the lockout fires regardless, but we want to confirm the
        # branch even reaches verify_otp before raising).
        await issue_otp(db, user)
        await db.commit()

        response = await client.post(
            "/api/token",
            data={"username": user.email, "password": "password"},
            headers={"x-totp-token": "000000"},
        )
        assert response.status_code == 429, response.text
        assert response.json()["message"] == "twofa_locked"

    async def test_old_attempts_age_out_of_window(
        self, db: AsyncSession
    ) -> None:
        """Sliding window: rows older than 24h must not count toward the cap.

        Build cap-worth of attempts, age them past 24h, then confirm
        ``verify_otp`` no longer raises. This pins the rolling-window
        behaviour so a future refactor cannot silently flip the
        comparator (e.g. to a fixed lifetime cap that locks users
        permanently).
        """
        user = await _user_with_email_2fa(db, "otp-window@example.com")
        await _seed_wrong_attempts(db, user, TWOFA_OTP_WRONG_ATTEMPT_CAP_24H)

        # Sanity: cap is currently tripping
        with pytest.raises(OTPLockoutError):
            await verify_otp(db, user, "000000")

        # Age every contributing row past the 24h cutoff.
        result = await db.execute(
            select(TwoFAEmailOTPCode).where(TwoFAEmailOTPCode.user_id == user.id)
        )
        long_ago = datetime.now(timezone.utc) - timedelta(hours=25)
        for row in result.scalars().all():
            row.created_at = long_ago
        await db.commit()

        # Fresh issue — cap now reads zero attempts in the window.
        await issue_otp(db, user)
        await db.commit()
        ok = await verify_otp(db, user, "000000")
        await db.commit()
        # Wrong code → False, but no raise (window is clear).
        assert ok is False
