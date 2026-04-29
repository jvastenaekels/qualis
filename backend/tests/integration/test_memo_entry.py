"""Memo entry CRUD via MemoService."""
from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MemoParentType
from app.services.memo_service import MemoService

pytestmark = pytest.mark.asyncio


async def test_add_entry_appends_at_end(
    db: AsyncSession, seed_concourse_id: int, seed_user_id: int
) -> None:
    """A new entry created without explicit position lands after existing entries."""
    e1 = await MemoService.add_entry(
        db,
        parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id,
        title="First",
        body="first body",
        user_id=seed_user_id,
    )
    e2 = await MemoService.add_entry(
        db,
        parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id,
        title="Second",
        body="second body",
        user_id=seed_user_id,
    )
    assert e1.position == 10
    assert e2.position == 20  # sparse, +10


async def test_add_entry_explicit_position_inserts_between(
    db: AsyncSession, seed_concourse_id: int, seed_user_id: int
) -> None:
    await MemoService.add_entry(
        db, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="A", user_id=seed_user_id,
    )
    await MemoService.add_entry(
        db, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="C", user_id=seed_user_id,
    )
    middle = await MemoService.add_entry(
        db, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="B", body="", position=15,
        user_id=seed_user_id,
    )
    assert middle.position == 15


async def test_update_entry_sets_last_edited_by(
    db: AsyncSession, seed_concourse_id: int,
    seed_user_id: int, seed_other_user_id: int,
) -> None:
    e = await MemoService.add_entry(
        db, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="t", user_id=seed_user_id,
    )
    updated = await MemoService.update_entry(
        db, entry_id=e.id, title="t2", user_id=seed_other_user_id,
    )
    assert updated.title == "t2"
    assert updated.created_by == seed_user_id
    assert updated.last_edited_by == seed_other_user_id


async def test_delete_entry_cascades_to_comments(
    db: AsyncSession, seed_concourse_id: int, seed_user_id: int,
) -> None:
    """Service-level cascade: delete_entry removes the entry. The
    SQLAlchemy `cascade='all, delete-orphan'` on MemoEntry.comments
    ensures comments go with it. We exercise the path here even
    though we don't seed any comments yet (T5 will add comment
    methods)."""
    e = await MemoService.add_entry(
        db, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="t", user_id=seed_user_id,
    )
    await MemoService.delete_entry(db, entry_id=e.id)
    memo = await MemoService.get_memo(
        db, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id,
    )
    assert memo.entries == []
