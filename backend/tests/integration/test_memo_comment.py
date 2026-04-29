"""Memo comment lifecycle: post, edit, soft-delete, resolve, mentions."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.memo_service import MemoService

pytestmark = pytest.mark.asyncio


async def test_add_comment_persists_mentions(
    db: AsyncSession,
    seed_entry_id: int,
    seed_user_id: int,
    seed_other_user_id: int,
) -> None:
    c = await MemoService.add_comment(
        db,
        entry_id=seed_entry_id,
        user_id=seed_user_id,
        body="@you what about this?",
        mentions=[seed_other_user_id],
    )
    assert c.mentions == [seed_other_user_id]


async def test_validate_mentions_rejects_non_member(
    db: AsyncSession, seed_project_id: int
) -> None:
    with pytest.raises(HTTPException) as exc:
        await MemoService.validate_mentions(
            db, project_id=seed_project_id, user_ids=[999_999]
        )
    assert exc.value.status_code == 400


async def test_update_own_comment(
    db: AsyncSession, seed_entry_id: int, seed_user_id: int
) -> None:
    c = await MemoService.add_comment(
        db,
        entry_id=seed_entry_id,
        user_id=seed_user_id,
        body="v1",
        mentions=[],
    )
    updated = await MemoService.update_comment(
        db, comment_id=c.id, body="v2"
    )
    assert updated.body == "v2"


async def test_soft_delete_flags_comment(
    db: AsyncSession, seed_entry_id: int, seed_user_id: int
) -> None:
    c = await MemoService.add_comment(
        db,
        entry_id=seed_entry_id,
        user_id=seed_user_id,
        body="will be removed",
        mentions=[],
    )
    await MemoService.soft_delete_comment(db, comment_id=c.id)
    refreshed = await MemoService.get_comment(db, comment_id=c.id)
    assert refreshed.deleted is True
    # Service preserves the body in DB; the router-layer blanks it on read.
    # We deliberately don't assert about body contents here.


async def test_resolve_then_unresolve(
    db: AsyncSession, seed_entry_id: int, seed_user_id: int
) -> None:
    c = await MemoService.add_comment(
        db,
        entry_id=seed_entry_id,
        user_id=seed_user_id,
        body="discuss",
        mentions=[],
    )
    resolved = await MemoService.resolve_comment(
        db, comment_id=c.id, user_id=seed_user_id
    )
    assert resolved.resolved is True
    assert resolved.resolved_by == seed_user_id
    unresolved = await MemoService.unresolve_comment(
        db, comment_id=c.id
    )
    assert unresolved.resolved is False
    assert unresolved.resolved_at is None
