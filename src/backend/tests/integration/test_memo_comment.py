"""Memo comment lifecycle: post, edit, soft-delete, resolve, mentions."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProjectMember, ProjectRole
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


async def test_post_comment_with_mention_dispatches_email(
    client,
    db: AsyncSession,
    seed_entry_id: int,
    seed_user_id: int,
    seed_other_user_id: int,
    seed_project_id: int,
    auth_headers_for_seed_user,
    monkeypatch,
) -> None:
    """Each non-self mention triggers send_memo_mention_email exactly once."""
    # seed_other_user_id is not yet a project member; validate_mentions requires it.
    member = ProjectMember(
        project_id=seed_project_id,
        user_id=seed_other_user_id,
        role=ProjectRole.viewer,
    )
    db.add(member)
    await db.commit()

    sent: list[dict] = []

    def fake_send(**kwargs: object) -> None:
        sent.append(dict(kwargs))

    monkeypatch.setattr(
        "app.utils.email.send_memo_mention_email",
        fake_send,
    )

    response = await client.post(
        f"/api/admin/memo-entries/{seed_entry_id}/comments",
        json={
            "body": "ping @other",
            "mentions": [seed_other_user_id],
        },
        headers=auth_headers_for_seed_user,
    )
    assert response.status_code == 201
    assert len(sent) == 1
    assert sent[0]["mentioner_name"]  # not empty


async def test_post_comment_skips_self_mention(
    client,
    db: AsyncSession,
    seed_entry_id: int,
    seed_user_id: int,
    seed_project_id: int,
    auth_headers_for_seed_user,
    monkeypatch,
) -> None:
    """Mentioning yourself does not trigger an email."""
    sent: list[dict] = []

    monkeypatch.setattr(
        "app.utils.email.send_memo_mention_email",
        lambda **kw: sent.append(dict(kw)),
    )

    response = await client.post(
        f"/api/admin/memo-entries/{seed_entry_id}/comments",
        json={
            "body": "ping @me",
            "mentions": [seed_user_id],  # self-mention
        },
        headers=auth_headers_for_seed_user,
    )
    assert response.status_code == 201
    assert sent == []
