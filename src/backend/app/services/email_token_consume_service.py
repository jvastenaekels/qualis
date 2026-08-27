# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Single-use JTI denylist for stateless JWTs that need consume-once.

Currently used only by the 2FA-disable flow.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConsumedEmailToken


async def is_jti_consumed(db: AsyncSession, jti: str) -> bool:
    result = await db.execute(
        select(ConsumedEmailToken.jti).where(ConsumedEmailToken.jti == jti)
    )
    return result.scalar_one_or_none() is not None


async def mark_jti_consumed(db: AsyncSession, jti: str, purpose: str) -> None:
    """Insert a (jti, purpose) row. Raises IntegrityError if jti already exists."""
    db.add(ConsumedEmailToken(jti=jti, purpose=purpose))
    await db.flush()


async def cleanup_consumed(db: AsyncSession, older_than: timedelta) -> int:
    cutoff = datetime.now(timezone.utc) - older_than
    result = await db.execute(
        delete(ConsumedEmailToken).where(ConsumedEmailToken.consumed_at < cutoff)
    )
    return result.rowcount or 0  # type: ignore[attr-defined]
