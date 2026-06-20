# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Audit Wave E — lifecycle & cross-entity integrity (E5 security, E1 GDPR).

E2/E3/E4 (all low-severity) are covered by the existing data-lifecycle /
study tests for no-regression; their fixes are self-evident (per-row audit
logging, a rollback in an except, and a leap-safe timedelta cutoff).
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models import MemoEntry, MemoParentType, Project, User
from app.schemas.concourses import (
    ConcourseCreate,
    ConcourseItemCreate,
    ConcourseItemTranslationCreate,
    ConcourseTagCreate,
)
from app.services.concourse_service import ConcourseService


@pytest.mark.asyncio
async def test_attach_cross_project_tag_is_rejected(
    db: AsyncSession, test_user: User, test_project: Project, project_factory
) -> None:
    """E5: a tag from another project cannot be attached to an item.

    Without the guard, a member of project A could attach — and, via the item
    response, read the name of — a tag belonging to project B (cross-project IDOR).
    """
    concourse_a = await ConcourseService.create_concourse(
        db, test_project.id, ConcourseCreate(title="A", description=""), test_user.id
    )
    project_b = await project_factory(owner=test_user)
    tag_b = await ConcourseService.create_tag(
        db, project_b.id, ConcourseTagCreate(name="B-tag", color="#abcdef")
    )

    cross = ConcourseItemCreate(
        code="X1",
        translations=[ConcourseItemTranslationCreate(language_code="en", text="x")],
        tag_ids=[tag_b.id],
    )
    with pytest.raises(NotFoundError):
        await ConcourseService.create_item(db, concourse_a.id, cross, test_user.id)

    # A same-project tag still attaches fine.
    tag_a = await ConcourseService.create_tag(
        db, test_project.id, ConcourseTagCreate(name="A-tag", color="#123456")
    )
    ok = ConcourseItemCreate(
        code="X2",
        translations=[ConcourseItemTranslationCreate(language_code="en", text="y")],
        tag_ids=[tag_a.id],
    )
    item = await ConcourseService.create_item(db, concourse_a.id, ok, test_user.id)
    assert item is not None


@pytest.mark.asyncio
async def test_delete_project_cleans_up_concourse_memos(
    db: AsyncSession,
    test_user: User,
    test_project: Project,
    client,
    auth_token_factory,
) -> None:
    """E1: deleting a project removes its concourses' polymorphic memo rows.

    Memos are keyed on (parent_type, parent_id) with NO DB foreign key, so the
    ON DELETE CASCADE that removes the concourses would otherwise leave orphan
    memo entries behind — escaping GDPR cleanup.
    """
    concourse = await ConcourseService.create_concourse(
        db, test_project.id, ConcourseCreate(title="C", description=""), test_user.id
    )
    concourse_id = concourse.id
    db.add(
        MemoEntry(
            parent_type=MemoParentType.concourse,
            parent_id=concourse_id,
            title="note",
            body="sensitive memo body",
            created_by=test_user.id,
        )
    )
    await db.commit()

    memo_stmt = select(MemoEntry).where(
        MemoEntry.parent_type == MemoParentType.concourse,
        MemoEntry.parent_id == concourse_id,
    )
    before = (await db.execute(memo_stmt)).scalars().all()
    assert len(before) == 1

    headers = auth_token_factory(test_user)
    resp = await client.delete(
        f"/api/admin/projects/{test_project.slug}", headers=headers
    )
    assert resp.status_code in (200, 204), resp.text

    after = (await db.execute(memo_stmt)).scalars().all()
    assert after == [], "concourse memo entries must be cleaned up, not orphaned"
