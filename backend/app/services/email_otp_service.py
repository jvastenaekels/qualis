# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Email-OTP service for the 2FA email channel.

A single user has at most one active (non-used, non-expired) code at any
time. Each `issue_otp` call invalidates previous active codes for the
same user and enforces a 30-second resend cooldown.
"""

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import TwoFAEmailOTPCode, User
from app.utils.security import get_password_hash, verify_password


class OTPRateLimitError(Exception):
    """Raised when issue_otp is called within the resend cooldown window."""


async def _get_active_code(db: AsyncSession, user: User) -> TwoFAEmailOTPCode | None:
    result = await db.execute(
        select(TwoFAEmailOTPCode)
        .where(
            TwoFAEmailOTPCode.user_id == user.id,
            TwoFAEmailOTPCode.used_at.is_(None),
        )
        .order_by(TwoFAEmailOTPCode.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def issue_otp(db: AsyncSession, user: User) -> str:
    """Generate a fresh 6-digit code, return plaintext for emailing."""
    now = datetime.now(tz=timezone.utc)

    last = await _get_active_code(db, user)
    if last is not None:
        cooldown = timedelta(seconds=settings.TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS)
        if last.created_at > now - cooldown:
            raise OTPRateLimitError(
                f"OTP resend cooldown active "
                f"(retry after {settings.TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS}s)"
            )

    await invalidate_active_otps(db, user)

    plaintext = f"{secrets.randbelow(1_000_000):06d}"
    code = TwoFAEmailOTPCode(
        user_id=user.id,
        code_hash=get_password_hash(plaintext),
        expires_at=now + timedelta(minutes=settings.TWOFA_EMAIL_OTP_EXPIRE_MINUTES),
    )
    db.add(code)
    await db.flush()
    return plaintext


async def verify_otp(db: AsyncSession, user: User, code: str) -> bool:
    """Verify a candidate code. Marks used_at on success, increments attempts on failure."""
    now = datetime.now(tz=timezone.utc)
    row = await _get_active_code(db, user)
    if row is None or row.expires_at <= now or row.attempts >= 5:
        return False
    if not verify_password(code, row.code_hash):
        row.attempts += 1
        return False
    row.used_at = now
    return True


async def invalidate_active_otps(db: AsyncSession, user: User) -> None:
    """Mark all active (non-used) OTP codes for the user as used."""
    now = datetime.now(tz=timezone.utc)
    await db.execute(
        update(TwoFAEmailOTPCode)
        .where(
            TwoFAEmailOTPCode.user_id == user.id,
            TwoFAEmailOTPCode.used_at.is_(None),
        )
        .values(used_at=now)
    )
