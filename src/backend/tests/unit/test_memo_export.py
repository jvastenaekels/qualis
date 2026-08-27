"""Unit tests for MemoService.render_markdown."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Concourse,
    MemoParentType,
    Project,
    User,
)
from app.services.memo_service import MemoService
from app.utils.security import get_password_hash


@pytest.mark.asyncio
class TestRenderMarkdown:
    async def _mk_user(
        self, db: AsyncSession, email: str, full_name: str | None
    ) -> User:
        u = User(
            email=email, hashed_password=get_password_hash("x"), full_name=full_name
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u

    async def _mk_concourse(self, db: AsyncSession) -> Concourse:
        p = Project(title="P", slug="p")
        db.add(p)
        await db.flush()
        c = Concourse(project_id=p.id, title="My Concourse")
        db.add(c)
        await db.commit()
        await db.refresh(c)
        return c

    async def test_empty_memo_has_header_and_no_entries_line(self, db: AsyncSession):
        c = await self._mk_concourse(db)
        md = await MemoService.render_markdown(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            parent_title="My Concourse",
        )
        assert "My Concourse" in md
        assert "No entries." in md

    async def test_entries_ordered_by_position(self, db: AsyncSession):
        c = await self._mk_concourse(db)
        user = await self._mk_user(db, "a@x.io", "Alice Adams")
        await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="Second",
            body="b2",
            position=20,
            user_id=user.id,
        )
        await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="First",
            body="b1",
            position=10,
            user_id=user.id,
        )
        md = await MemoService.render_markdown(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            parent_title="My Concourse",
        )
        assert md.index("## First") < md.index("## Second")
        assert "Alice Adams" in md

    async def test_name_falls_back_to_email_then_unknown(self, db: AsyncSession):
        c = await self._mk_concourse(db)
        no_name = await self._mk_user(db, "noname@x.io", None)
        e = await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="E",
            body="x",
            position=10,
            user_id=no_name.id,
        )
        await MemoService.add_comment(
            db,
            entry_id=e.id,
            user_id=None,
            body="anon comment",
            mentions=[],
        )
        md = await MemoService.render_markdown(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            parent_title="My Concourse",
        )
        assert "noname@x.io" in md
        assert "Unknown" in md

    async def test_deleted_comment_is_placeholder_but_keeps_author(
        self, db: AsyncSession
    ):
        c = await self._mk_concourse(db)
        user = await self._mk_user(db, "b@x.io", "Bob Brown")
        e = await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="E",
            body="x",
            position=10,
            user_id=user.id,
        )
        cm = await MemoService.add_comment(
            db,
            entry_id=e.id,
            user_id=user.id,
            body="secret",
            mentions=[],
        )
        await MemoService.soft_delete_comment(db, comment_id=cm.id)
        md = await MemoService.render_markdown(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            parent_title="My Concourse",
        )
        assert "secret" not in md
        assert "*[deleted]*" in md
        assert "Bob Brown" in md

    async def test_resolved_comment_is_marked(self, db: AsyncSession):
        c = await self._mk_concourse(db)
        user = await self._mk_user(db, "c@x.io", "Cara Cole")
        e = await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="E",
            body="x",
            position=10,
            user_id=user.id,
        )
        cm = await MemoService.add_comment(
            db,
            entry_id=e.id,
            user_id=user.id,
            body="please fix",
            mentions=[],
        )
        await MemoService.resolve_comment(db, comment_id=cm.id, user_id=user.id)
        md = await MemoService.render_markdown(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            parent_title="My Concourse",
        )
        assert "resolved by Cara Cole" in md

    async def test_comments_nest_under_their_own_entry(self, db: AsyncSession):
        c = await self._mk_concourse(db)
        user = await self._mk_user(db, "n@x.io", "Nel Nest")
        e1 = await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="Alpha",
            body="a",
            position=10,
            user_id=user.id,
        )
        e2 = await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="Beta",
            body="b",
            position=20,
            user_id=user.id,
        )
        await MemoService.add_comment(
            db, entry_id=e1.id, user_id=user.id, body="alpha-comment", mentions=[]
        )
        await MemoService.add_comment(
            db, entry_id=e2.id, user_id=user.id, body="beta-comment", mentions=[]
        )
        md = await MemoService.render_markdown(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            parent_title="My Concourse",
        )
        # Each comment must sit after its own entry heading and before the next.
        alpha_h = md.index("## Alpha")
        beta_h = md.index("## Beta")
        assert alpha_h < md.index("alpha-comment") < beta_h
        assert beta_h < md.index("beta-comment")

    async def test_last_edited_by_marker_only_when_different(self, db: AsyncSession):
        c = await self._mk_concourse(db)
        author = await self._mk_user(db, "auth@x.io", "Orig Author")
        editor = await self._mk_user(db, "edit@x.io", "Other Editor")
        same = await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="Untouched",
            body="x",
            position=10,
            user_id=author.id,
        )
        edited = await MemoService.add_entry(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            title="Edited",
            body="y",
            position=20,
            user_id=author.id,
        )
        await MemoService.update_entry(
            db, entry_id=edited.id, user_id=editor.id, body="y2"
        )
        md = await MemoService.render_markdown(
            db,
            parent_type=MemoParentType.concourse,
            parent_id=c.id,
            parent_title="My Concourse",
        )
        assert "last edited by Other Editor" in md
        # The untouched entry (created_by == last_edited_by) carries no marker.
        untouched_block = md.split("## Untouched")[1].split("## Edited")[0]
        assert "last edited by" not in untouched_block
        assert same.created_by == same.last_edited_by
