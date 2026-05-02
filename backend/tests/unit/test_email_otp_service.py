"""Unit tests for the 2FA email-OTP service."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TwoFAEmailOTPCode, User
from app.services.email_otp_service import (
    OTPRateLimitError,
    invalidate_active_otps,
    issue_otp,
    verify_otp,
)


async def _active_row(db: AsyncSession, user: User) -> TwoFAEmailOTPCode:
    result = await db.execute(
        select(TwoFAEmailOTPCode).where(
            TwoFAEmailOTPCode.user_id == user.id,
            TwoFAEmailOTPCode.used_at.is_(None),
        )
    )
    return result.scalar_one()


@pytest.mark.asyncio
class TestEmailOTPService:
    async def test_issue_returns_six_digit_code(
        self, db: AsyncSession, test_user: User
    ) -> None:
        code = await issue_otp(db, test_user)
        await db.commit()
        assert len(code) == 6 and code.isdigit()

    async def test_verify_correct_code(
        self, db: AsyncSession, test_user: User
    ) -> None:
        code = await issue_otp(db, test_user)
        await db.commit()
        ok = await verify_otp(db, test_user, code)
        await db.commit()
        assert ok is True

    async def test_verify_wrong_code_increments_attempts(
        self, db: AsyncSession, test_user: User
    ) -> None:
        await issue_otp(db, test_user)
        await db.commit()
        ok = await verify_otp(db, test_user, "000000")
        await db.commit()
        assert ok is False
        row = await _active_row(db, test_user)
        assert row.attempts == 1

    async def test_five_wrong_attempts_kill_the_code(
        self, db: AsyncSession, test_user: User
    ) -> None:
        code = await issue_otp(db, test_user)
        await db.commit()
        for _ in range(5):
            await verify_otp(db, test_user, "000000")
            await db.commit()
        # Even the right code now fails
        ok = await verify_otp(db, test_user, code)
        await db.commit()
        assert ok is False

    async def test_issue_invalidates_previous_active_codes(
        self, db: AsyncSession, test_user: User
    ) -> None:
        old_code = await issue_otp(db, test_user)
        await db.commit()
        # Bypass rate-limit: backdate the row
        old_row = await _active_row(db, test_user)
        old_row.created_at = datetime.now(timezone.utc) - timedelta(seconds=60)
        await db.commit()

        new_code = await issue_otp(db, test_user)
        await db.commit()

        assert new_code != old_code
        # Old code is invalidated
        assert await verify_otp(db, test_user, old_code) is False
        await db.commit()
        assert await verify_otp(db, test_user, new_code) is True

    async def test_rate_limit_raises_within_cooldown(
        self, db: AsyncSession, test_user: User
    ) -> None:
        await issue_otp(db, test_user)
        await db.commit()
        with pytest.raises(OTPRateLimitError):
            await issue_otp(db, test_user)

    async def test_invalidate_active_otps(
        self, db: AsyncSession, test_user: User
    ) -> None:
        code = await issue_otp(db, test_user)
        await db.commit()
        await invalidate_active_otps(db, test_user)
        await db.commit()
        ok = await verify_otp(db, test_user, code)
        await db.commit()
        assert ok is False

    async def test_expired_code_fails_verify(
        self, db: AsyncSession, test_user: User
    ) -> None:
        code = await issue_otp(db, test_user)
        await db.commit()
        row = await _active_row(db, test_user)
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
        ok = await verify_otp(db, test_user, code)
        await db.commit()
        assert ok is False
