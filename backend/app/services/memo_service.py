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

from app.models import MemoEntry, MemoParentType
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
