# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Domain service for memo entries and comments.

Polymorphic on (parent_type, parent_id). Existence of the parent
(concourse / study) and the user's project membership are validated
upstream by router dependencies — service-level methods assume valid
inputs.
"""

from __future__ import annotations

from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import MemoComment, MemoEntry, MemoParentType
from app.schemas.memos import MemoRead, MemoTemplate


_POSITION_STEP = 10


_TEMPLATES: dict[MemoParentType, list[MemoTemplate]] = {
    MemoParentType.concourse: [
        MemoTemplate(
            title="Sources canvassed",
            description=(
                "Which sources were searched? Databases, archives, prior studies, "
                "interviews. (Sneegas 2020 — concourse curation as a deliberate act.)"
            ),
        ),
        MemoTemplate(
            title="Voices retained",
            description="Whose perspectives are represented in the final item set?",
        ),
        MemoTemplate(
            title="Voices excluded",
            description=(
                "Whose perspectives were canvassed but not retained? Why? "
                "(Robbins & Krueger 2000 — exclusion is a research choice.)"
            ),
        ),
        MemoTemplate(
            title="Sampling rationale",
            description=(
                "How was the final Q-set arrived at? Saturation, theoretical "
                "sampling, balance across positions?"
            ),
        ),
        MemoTemplate(
            title="Version notes",
            description="Substantive revisions to the concourse over time.",
        ),
    ],
    MemoParentType.study: [
        MemoTemplate(
            title="Distribution rationale",
            description=(
                "Why this distribution shape? Forced-choice symmetry, range, "
                "expected statement variance. (Watts & Stenner 2012, ch. 4.)"
            ),
        ),
        MemoTemplate(
            title="Conditions of instruction",
            description=(
                "Why this CoI? Prompt design choices, framing decisions, "
                "what we asked participants to attend to."
            ),
        ),
        MemoTemplate(
            title="Q-set size",
            description="Why this number of items? Trade-offs vs participant load.",
        ),
        MemoTemplate(
            title="Pre/post-sort design choices",
            description="Pre-sort screening, post-sort feedback, demographics rationale.",
        ),
        MemoTemplate(
            title="Limitations",
            description=(
                "Known limits the dataset will inherit. Pre-register them here."
            ),
        ),
    ],
}


class MemoService:
    """Service for memo entries and comments."""

    @staticmethod
    def get_templates(parent_type: MemoParentType) -> list[MemoTemplate]:
        return list(_TEMPLATES[parent_type])

    @staticmethod
    async def get_memo(
        db: AsyncSession,
        *,
        parent_type: MemoParentType,
        parent_id: int,
    ) -> MemoRead:
        stmt = (
            select(MemoEntry)
            .where(
                MemoEntry.parent_type == parent_type,
                MemoEntry.parent_id == parent_id,
            )
            .options(selectinload(MemoEntry.comments))
            .order_by(MemoEntry.position, MemoEntry.id)
        )
        entries = (await db.execute(stmt)).scalars().all()
        return MemoRead.model_validate(
            {
                "parent_type": parent_type.value,
                "parent_id": parent_id,
                "entries": list(entries),
            },
            from_attributes=True,
        )

    @staticmethod
    async def add_entry(
        db: AsyncSession,
        *,
        parent_type: MemoParentType,
        parent_id: int,
        title: str,
        body: str = "",
        position: int | None = None,
        user_id: int | None,
    ) -> MemoEntry:
        if position is None:
            max_pos = (
                await db.execute(
                    select(func.coalesce(func.max(MemoEntry.position), 0)).where(
                        MemoEntry.parent_type == parent_type,
                        MemoEntry.parent_id == parent_id,
                    )
                )
            ).scalar() or 0
            position = max_pos + _POSITION_STEP
        entry = MemoEntry(
            parent_type=parent_type,
            parent_id=parent_id,
            title=title,
            body=body,
            position=position,
            created_by=user_id,
            last_edited_by=user_id,
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)
        return entry

    @staticmethod
    async def update_entry(
        db: AsyncSession,
        *,
        entry_id: int,
        user_id: int | None,
        title: str | None = None,
        body: str | None = None,
        position: int | None = None,
    ) -> MemoEntry:
        entry = await db.get(MemoEntry, entry_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Memo entry not found"
            )
        if title is not None:
            entry.title = title
        if body is not None:
            entry.body = body
        if position is not None:
            entry.position = position
        entry.last_edited_by = user_id
        await db.commit()
        await db.refresh(entry)
        return entry

    @staticmethod
    async def delete_entry(db: AsyncSession, *, entry_id: int) -> None:
        entry = await db.get(MemoEntry, entry_id)
        if entry is None:
            return  # idempotent
        await db.delete(entry)
        await db.commit()

    @staticmethod
    async def cleanup_for_parent(
        db: AsyncSession,
        *,
        parent_type: MemoParentType,
        parent_id: int,
    ) -> None:
        """Cascade-delete all memo content for a parent.

        Required because the (parent_type, parent_id) FK is logical, not
        enforced by PostgreSQL — concourse/study `delete()` calls this
        before removing themselves.
        """
        stmt = select(MemoEntry).where(
            MemoEntry.parent_type == parent_type,
            MemoEntry.parent_id == parent_id,
        )
        entries: Sequence[MemoEntry] = (await db.execute(stmt)).scalars().all()
        for entry in entries:
            await db.delete(entry)
        # No commit — caller commits as part of its own transaction.

    @staticmethod
    async def get_comment(db: AsyncSession, *, comment_id: int) -> MemoComment:
        c = await db.get(MemoComment, comment_id)
        if c is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Memo comment not found"
            )
        return c

    @staticmethod
    async def validate_mentions(
        db: AsyncSession, *, project_id: int, user_ids: list[int]
    ) -> None:
        """Reject if any user_id is not a member of the project."""
        if not user_ids:
            return
        from app.models import ProjectMember

        stmt = select(ProjectMember.user_id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id.in_(user_ids),
        )
        members = set((await db.execute(stmt)).scalars().all())
        invalid = set(user_ids) - members
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mentioned users are not project members: {sorted(invalid)}",
            )

    @staticmethod
    async def add_comment(
        db: AsyncSession,
        *,
        entry_id: int,
        user_id: int | None,
        body: str,
        mentions: list[int],
    ) -> MemoComment:
        c = MemoComment(
            entry_id=entry_id,
            user_id=user_id,
            body=body,
            mentions=mentions,
        )
        db.add(c)
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def update_comment(
        db: AsyncSession, *, comment_id: int, body: str
    ) -> MemoComment:
        c = await MemoService.get_comment(db, comment_id=comment_id)
        c.body = body
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def soft_delete_comment(
        db: AsyncSession, *, comment_id: int
    ) -> MemoComment:
        c = await MemoService.get_comment(db, comment_id=comment_id)
        c.deleted = True
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def resolve_comment(
        db: AsyncSession, *, comment_id: int, user_id: int | None
    ) -> MemoComment:
        c = await MemoService.get_comment(db, comment_id=comment_id)
        c.resolved = True
        c.resolved_by = user_id
        c.resolved_at = func.now()  # server-side timestamp
        await db.commit()
        await db.refresh(c)
        return c

    @staticmethod
    async def unresolve_comment(
        db: AsyncSession, *, comment_id: int
    ) -> MemoComment:
        c = await MemoService.get_comment(db, comment_id=comment_id)
        c.resolved = False
        c.resolved_by = None
        c.resolved_at = None
        await db.commit()
        await db.refresh(c)
        return c
