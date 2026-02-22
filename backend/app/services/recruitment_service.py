"""Service for managing recruitment links."""

import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RecruitmentLink, RecruitmentLinkType


class RecruitmentService:
    @staticmethod
    def _generate_token(length: int = 8) -> str:
        """Generate a random secure token."""
        alphabet = string.ascii_letters + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(length))

    @staticmethod
    async def create_links(
        db: AsyncSession,
        study_id: int,
        type: RecruitmentLinkType,
        count: int = 1,
        name: Optional[str] = None,
        capacity: Optional[int] = None,
        expires_in_days: Optional[int] = None,
    ) -> List[RecruitmentLink]:
        """Create one or more recruitment links for a study."""
        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        links = []
        for _ in range(count):
            link = RecruitmentLink(
                study_id=study_id,
                type=type,
                token=RecruitmentService._generate_token(),
                name=name,
                capacity=capacity if type != RecruitmentLinkType.public else None,
                expires_at=expires_at,
            )
            db.add(link)
            links.append(link)

        await db.commit()
        for link in links:
            await db.refresh(link)

        return links

    @staticmethod
    async def get_study_links(db: AsyncSession, study_id: int) -> List[RecruitmentLink]:
        """List all links for a specific study."""
        result = await db.execute(
            select(RecruitmentLink).where(RecruitmentLink.study_id == study_id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_link_by_token(
        db: AsyncSession, token: str
    ) -> Optional[RecruitmentLink]:
        """Fetch a specific link by its token."""
        result = await db.execute(
            select(RecruitmentLink).where(RecruitmentLink.token == token)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def delete_link(db: AsyncSession, link_id: int) -> bool:
        """Delete/revoke a recruitment link."""
        link = await db.get(RecruitmentLink, link_id)
        if link:
            await db.delete(link)
            await db.commit()
            return True
        return False

    @staticmethod
    async def increment_usage(db: AsyncSession, link_id: int) -> bool:
        """Atomically check capacity and increment usage count.

        Returns True if the increment succeeded, False if the link is
        at capacity (or not found).  The capacity check and the increment
        happen under a row-level lock so concurrent requests cannot
        over-subscribe a link.
        """
        stmt = (
            select(RecruitmentLink)
            .where(RecruitmentLink.id == link_id)
            .with_for_update()
        )
        result = await db.execute(stmt)
        link = result.scalar_one_or_none()

        if not link:
            return False

        if link.capacity is not None and link.usage_count >= link.capacity:
            return False

        link.usage_count += 1
        await db.flush()
        return True

    @staticmethod
    async def record_start(db: AsyncSession, link_id: int):
        """Increment start count for an individual or limited link."""
        stmt = (
            select(RecruitmentLink)
            .where(RecruitmentLink.id == link_id)
            .with_for_update()
        )
        result = await db.execute(stmt)
        link = result.scalar_one_or_none()

        if link:
            link.start_count += 1
            await db.flush()

    @staticmethod
    async def validate_link_token(
        db: AsyncSession, study_id: int, token: str
    ) -> Optional[RecruitmentLink]:
        """Validate a recruitment token for a specific study."""
        link = await RecruitmentService.get_link_by_token(db, token)
        if not link:
            return None

        if link.study_id != study_id:
            return None

        if not link.is_active:
            return None

        if link.expires_at and link.expires_at < datetime.now(timezone.utc):
            return None

        # Capacity is enforced atomically in increment_usage() under a
        # row-level lock, so we don't check it here (avoids TOCTOU race).

        return link
