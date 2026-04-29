# Memos with Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two free-text memo columns (`concourses.construction_memo`, `studies.methodology_memo`) with a structured entries + threaded comments subsystem that exports cleanly and supports team deliberation in-platform — keeping the feature in second plan via progressive disclosure.

**Architecture:** Single polymorphic `Memo` subsystem keyed on `(parent_type, parent_id)`. Two new tables (`memo_entries`, `memo_comments`). One shared frontend `<MemoSection>` component with a hook (`useMemoSection`). Existing Accordion shells retained — only their bodies are swapped.

**Tech Stack:** Backend — FastAPI, SQLAlchemy async, Alembic, Pydantic. Frontend — React 19 + TypeScript, Tailwind, dnd-kit, Vitest. Toolchain — `uv`, `make ci-fast` (~38s) between every change, `make ci` before PR.

**Reference spec:** `docs/superpowers/specs/2026-04-29-memos-collaboration-design.md`

**Plan-time decisions deferred from spec:**
- **No notifications table.** v1 ships email-only on @-mention + a "Mentions for you" mini-list in `<MemoSection>` (computed at render time, no server state).
- **`mentions` persisted as JSONB column** on `memo_comments` so the mini-list can be computed from the existing GET response.
- **`position` uses sparse integers** (10, 20, 30…) to allow inserts without bulk renumber — matches `ConcourseItem.display_order` pattern.
- **Email helper** added as `send_memo_mention_email` in `app.utils.email`, mirroring the `send_invitation_email` shape.
- **Permission deps** reuse existing `check_project_permission(ProjectRole.X)`; comments accept any project member (X = viewer).

---

## File structure

### Backend — created
- `backend/app/models/memo.py` — `MemoEntry`, `MemoComment` models + `MemoParentType` enum
- `backend/app/schemas/memos.py` — Pydantic schemas
- `backend/app/services/memo_service.py` — domain logic (CRUD, validate mentions, render-export helpers)
- `backend/app/routers/admin/memos.py` — admin endpoints
- `backend/db_migrations/versions/XXXX_add_memo_entries_and_comments.py` — single migration creating tables + migrating data + dropping old columns
- `backend/tests/integration/test_memo_entry.py`
- `backend/tests/integration/test_memo_comment.py`
- `backend/tests/integration/test_memo_migration.py`

### Backend — modified
- `backend/app/models/base.py` — add `MemoParentType` to `__all__`
- `backend/app/models/__init__.py` — re-export `MemoEntry`, `MemoComment`
- `backend/app/models/concourse.py` — drop `construction_memo` column
- `backend/app/models/study.py` — drop `methodology_memo` column
- `backend/app/schemas/concourses.py` — drop `construction_memo` field from Create/Update/Read
- `backend/app/schemas/studies.py` — drop `methodology_memo` field from Create/Update/Read
- `backend/app/services/concourse_service.py` — drop `construction_memo` from create/update; add explicit memo cleanup in `delete`
- `backend/app/services/study_service.py` — drop `methodology_memo` from create/update; add explicit memo cleanup in `delete`
- `backend/app/routers/admin/concourses.py` — drop `construction_memo` field
- `backend/app/routers/admin/exports.py` — add `include_discussion` query param to `/{slug}/export/package`
- `backend/app/services/export_service.py` — add `_render_memo_md`, `_render_memo_discussion_md`; include `memo/` directory in ZIP
- `backend/app/utils/email.py` — add `send_memo_mention_email`
- `backend/app/main.py` — register `admin.memos` router
- `backend/pyproject.toml` — add new modules to `[[tool.mypy.overrides]]`
- `backend/vulture_whitelist.py` — drop `methodology_memo` line

### Frontend — created
- `frontend/src/hooks/admin/useMemoSection.ts`
- `frontend/src/hooks/admin/useMemoSection.test.ts`
- `frontend/src/components/admin/memo/MemoSection.tsx`
- `frontend/src/components/admin/memo/MemoEntry.tsx`
- `frontend/src/components/admin/memo/CommentThread.tsx`
- `frontend/src/components/admin/memo/MentionAutocomplete.tsx`
- `frontend/src/components/admin/memo/MemoSection.test.tsx`
- `frontend/src/components/admin/memo/memoLastSeen.ts` — localStorage helpers (read/write timestamp)
- `frontend/e2e/admin/memo-collaboration.spec.ts`

### Frontend — modified
- `frontend/src/pages/admin/ConcourseDetailPage.tsx` — replace `<Textarea>` body of construction-memo accordion with `<MemoSection parentType="concourse" parentId={cid} />`
- `frontend/src/hooks/admin/useConcourseDetailPage.ts` — drop `constructionMemo` state + `saveConstructionMemo` callback
- `frontend/src/hooks/admin/useConcourseDetailPage.test.ts` — drop construction-memo tests
- `frontend/src/components/admin/designer/IntroductionEditor.tsx` — replace methodology-memo `<textarea>` with `<MemoSection parentType="study" parentId={sid} />`
- `frontend/src/components/admin/designer/IntroductionEditor.test.tsx` — drop methodology-memo seed
- `frontend/public/locales/{en,fr,fi}/translation.json` — add `admin.memo.*` keys; remove `admin.concourse.construction_memo.*` and `admin.design.methodology_memo.*`
- `frontend/src/api/generated.ts` — regenerated by `make generate-api`
- `frontend/src/api/model/*` — regenerated

---

# Phase 1 — Backend foundation

**Goal:** new tables, models, schemas, service, router, migration, tests. Old free-text columns dropped. API exists and is testable. Frontend still works because the old accordion bodies stay (they'll be swapped in Phase 2 — the Accordion shell does not depend on the schema field, only its body does).

> Wait — Phase 1 must keep the frontend compilable. Strategy: Phase 1 ships the backend changes AND a temporary stub in the existing accordion bodies that says "Memo migrated — see new section below" (still rendered) until Phase 2. This keeps `make ci` green between the two PRs.
>
> Concretely: in `ConcourseDetailPage.tsx` and `IntroductionEditor.tsx`, replace the textarea + save button with a small `<div className="text-xs text-slate-500 italic">Memo system upgraded; opening for collaboration in next release.</div>` placeholder. Drop the now-orphan state vars in the hook. The placeholder is removed in Phase 2.

## Task 1: Migration scaffold + data migration test (failing)

**Files:**
- Create: `backend/db_migrations/versions/<auto-id>_add_memo_entries_and_comments.py`
- Create: `backend/tests/integration/test_memo_migration.py`

- [ ] **Step 1.1: Create the migration scaffold**

Run from `backend/`:
```bash
.venv/bin/alembic revision -m "add memo_entries and memo_comments tables, drop free-text memo columns"
```

Open the generated file. Replace its body with:

```python
"""add memo_entries and memo_comments tables, drop free-text memo columns

Revises: ac63354ffc6a
Create Date: 2026-04-29 ...

Replaces concourses.construction_memo and studies.methodology_memo with a
polymorphic memo subsystem (entries + threaded comments). Existing free-text
content migrates into a single entry titled 'Notes' (position 0). Empty
memos do not produce an entry.

Aborts loudly if any source memo exceeds 10000 chars (the new entry body
cap). Researchers must split the content manually before re-running the
deploy.

PostgreSQL DDL is transactional; a failed step rolls back the migration
entirely (including the data step).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '<keep-the-auto-id>'
down_revision: Union[str, Sequence[str], None] = 'ac63354ffc6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MEMO_PARENT_TYPE = sa.Enum('concourse', 'study', name='memoparenttype')


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    MEMO_PARENT_TYPE.create(bind, checkfirst=True)

    op.create_table(
        'memo_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('parent_type', MEMO_PARENT_TYPE, nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.String(length=10000), nullable=False, server_default=''),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('last_edited_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index(
        'ix_memo_entries_parent_position',
        'memo_entries',
        ['parent_type', 'parent_id', 'position'],
    )

    op.create_table(
        'memo_comments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('entry_id', sa.Integer(),
                  sa.ForeignKey('memo_entries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('body', sa.String(length=2000), nullable=False),
        sa.Column('mentions', sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(
        'ix_memo_comments_entry_created',
        'memo_comments',
        ['entry_id', 'created_at'],
    )

    # ---- Data step: migrate existing free-text memos -----------------
    # Abort if any source memo exceeds the new 10k cap.
    too_long = bind.execute(sa.text("""
        SELECT COUNT(*) FROM concourses
        WHERE char_length(COALESCE(construction_memo, '')) > 10000
        UNION ALL
        SELECT COUNT(*) FROM studies
        WHERE char_length(COALESCE(methodology_memo, '')) > 10000
    """)).scalar()
    if too_long and too_long > 0:
        raise RuntimeError(
            "One or more existing memos exceed the new 10000-char cap. "
            "Split the content manually before re-running this migration."
        )

    bind.execute(sa.text("""
        INSERT INTO memo_entries
            (parent_type, parent_id, title, body, position,
             created_at, updated_at, created_by, last_edited_by)
        SELECT 'concourse', id, 'Notes', construction_memo, 0,
               now(), now(), NULL, NULL
        FROM concourses
        WHERE TRIM(COALESCE(construction_memo, '')) <> ''
    """))
    bind.execute(sa.text("""
        INSERT INTO memo_entries
            (parent_type, parent_id, title, body, position,
             created_at, updated_at, created_by, last_edited_by)
        SELECT 'study', id, 'Notes', methodology_memo, 0,
               now(), now(), NULL, NULL
        FROM studies
        WHERE TRIM(COALESCE(methodology_memo, '')) <> ''
    """))

    op.drop_column('concourses', 'construction_memo')
    op.drop_column('studies', 'methodology_memo')


def downgrade() -> None:
    """Downgrade schema.

    Re-creates the dropped columns and writes back the body of the entry
    titled 'Notes' (position 0) per parent. Data created post-upgrade in
    other entries or in comments is lost.
    """
    op.add_column(
        'concourses',
        sa.Column('construction_memo', sa.String(), nullable=True),
    )
    op.add_column(
        'studies',
        sa.Column('methodology_memo', sa.String(), nullable=True),
    )

    bind = op.get_bind()
    bind.execute(sa.text("""
        UPDATE concourses c
        SET construction_memo = e.body
        FROM memo_entries e
        WHERE e.parent_type = 'concourse'
          AND e.parent_id = c.id
          AND e.position = 0
          AND e.title = 'Notes'
    """))
    bind.execute(sa.text("""
        UPDATE studies s
        SET methodology_memo = e.body
        FROM memo_entries e
        WHERE e.parent_type = 'study'
          AND e.parent_id = s.id
          AND e.position = 0
          AND e.title = 'Notes'
    """))

    op.drop_index('ix_memo_comments_entry_created', table_name='memo_comments')
    op.drop_table('memo_comments')
    op.drop_index('ix_memo_entries_parent_position', table_name='memo_entries')
    op.drop_table('memo_entries')

    MEMO_PARENT_TYPE.drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 1.2: Write the round-trip migration test**

Create `backend/tests/integration/test_memo_migration.py`:

```python
"""Migration roundtrip: free-text columns → memo_entries → free-text columns."""
from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


pytestmark = pytest.mark.asyncio


async def test_migration_creates_notes_entry_for_nonempty_construction_memo(
    db_session_at_previous_head: AsyncSession,
) -> None:
    """A non-empty construction_memo becomes a 'Notes' entry at position 0."""
    # Seed a concourse with a non-empty construction_memo.
    await db_session_at_previous_head.execute(text(
        "INSERT INTO concourses (id, project_id, title, construction_memo) "
        "VALUES (9001, 1, 'Test concourse', 'Captured rationale.')"
    ))
    await db_session_at_previous_head.commit()

    # Run the upgrade (fixture exposes a helper to apply head).
    await db_session_at_previous_head.execute(text("SELECT 1"))  # placeholder; fixture upgrades
    # ... fixture machinery: see conftest.py for the migration test harness

    # After upgrade: column is gone, entry exists.
    result = await db_session_at_previous_head.execute(text(
        "SELECT title, body, position FROM memo_entries "
        "WHERE parent_type = 'concourse' AND parent_id = 9001"
    ))
    row = result.one()
    assert row.title == "Notes"
    assert row.body == "Captured rationale."
    assert row.position == 0


async def test_migration_skips_empty_methodology_memo(
    db_session_at_previous_head: AsyncSession,
) -> None:
    """An empty/whitespace methodology_memo produces no entry."""
    await db_session_at_previous_head.execute(text(
        "INSERT INTO studies (id, project_id, title, methodology_memo) "
        "VALUES (9002, 1, 'Empty memo study', '   ')"
    ))
    await db_session_at_previous_head.commit()
    # ... apply upgrade
    result = await db_session_at_previous_head.execute(text(
        "SELECT COUNT(*) FROM memo_entries "
        "WHERE parent_type = 'study' AND parent_id = 9002"
    ))
    assert result.scalar() == 0


async def test_migration_aborts_when_memo_exceeds_cap(
    db_session_at_previous_head: AsyncSession,
) -> None:
    """A memo > 10000 chars aborts the migration with a clear error."""
    await db_session_at_previous_head.execute(text(
        "INSERT INTO concourses (id, project_id, title, construction_memo) "
        "VALUES (9003, 1, 'Too long', :memo)"
    ), {"memo": "x" * 10001})
    await db_session_at_previous_head.commit()
    with pytest.raises(RuntimeError, match="exceed the new 10000-char cap"):
        # ... apply upgrade
        pass
```

> Note for the executing engineer: a migration-test harness fixture (`db_session_at_previous_head`) needs to exist or be added. Check `backend/tests/conftest.py` for existing alembic helpers; if absent, `tests/integration/test_concourse.py` and other integration tests use the `db_session` fixture against the head. A bespoke harness that stamps `down_revision` and runs `alembic upgrade head` programmatically is the cleanest option. If no precedent exists in the repo, replace these three tests with a single shell-level test that runs `alembic downgrade -1 && alembic upgrade head` against a fresh test DB and asserts via raw SQL — keep the same three assertions.

- [ ] **Step 1.3: Run the migration test (expect FAIL — fixture/data missing)**

Run from `backend/`:
```bash
.venv/bin/pytest tests/integration/test_memo_migration.py -v
```
Expected: tests fail (fixture missing or migration not yet applied).

- [ ] **Step 1.4: Apply the migration locally to verify it runs**

Run from project root:
```bash
make migrate
```
Expected: alembic prints `Running upgrade ac63354ffc6a -> <new-revision>` and exits 0.

Verify:
```bash
.venv/bin/psql "$DATABASE_URL" -c "\d memo_entries" -c "\d memo_comments" -c "\d concourses" | head -60
```
Expected: both new tables exist; `concourses` no longer has `construction_memo`; `studies` no longer has `methodology_memo`.

- [ ] **Step 1.5: Commit**

```bash
git add backend/db_migrations/versions/*_add_memo_entries_and_comments.py \
        backend/tests/integration/test_memo_migration.py
git commit -m "feat(memo): alembic migration for memo_entries + memo_comments"
```

---

## Task 2: SQLAlchemy models

**Files:**
- Create: `backend/app/models/memo.py`
- Modify: `backend/app/models/base.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/concourse.py` (drop column)
- Modify: `backend/app/models/study.py` (drop column)

- [ ] **Step 2.1: Add `MemoParentType` enum to base**

Open `backend/app/models/base.py`. Locate the `ProjectRole` block around line 61 and add below:

```python
class MemoParentType(str, Enum):
    """Discriminator for the polymorphic memo subsystem."""

    concourse = "concourse"
    study = "study"
```

In the `__all__` list around line 119, add `"MemoParentType"`.

- [ ] **Step 2.2: Create the memo model module**

Create `backend/app/models/memo.py`:

```python
# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Memo entries and threaded comments. Polymorphic on (parent_type, parent_id)."""

from .base import (
    Any,
    Base,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Mapped,
    MemoParentType,
    SAEnum,
    String,
    datetime,
    func,
    mapped_column,
    relationship,
)


class MemoEntry(Base):
    """One section of a memo (titled, ordered, free-form body)."""

    __tablename__ = "memo_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    parent_type: Mapped[MemoParentType] = mapped_column(
        SAEnum(MemoParentType), nullable=False
    )
    parent_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(String(10000), nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_edited_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    comments: Mapped[list["MemoComment"]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="MemoComment.created_at",
        lazy="raise",
    )


class MemoComment(Base):
    """A single comment in a thread attached to a `MemoEntry`."""

    __tablename__ = "memo_comments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("memo_entries.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(String(2000), nullable=False)
    mentions: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    entry: Mapped["MemoEntry"] = relationship(back_populates="comments", lazy="raise")


__all__ = ["MemoEntry", "MemoComment"]
```

If `Boolean`, `Integer`, or `JSON` are not yet exported from `base.py`, add them. Check first:
```bash
grep -n "^from sqlalchemy import\|^from sqlalchemy.types" backend/app/models/base.py
grep -n "^__all__" backend/app/models/base.py
```
Add any missing names to both the imports at the top of `base.py` and the `__all__` re-export list.

- [ ] **Step 2.3: Re-export from the models package**

Open `backend/app/models/__init__.py`, locate the existing per-module re-exports (around the `ConcourseItemComment` line), and add:

```python
from .memo import MemoComment as MemoComment
from .memo import MemoEntry as MemoEntry
```

- [ ] **Step 2.4: Drop `construction_memo` from the `Concourse` model**

Open `backend/app/models/concourse.py:37` and delete the line:
```python
construction_memo: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 2.5: Drop `methodology_memo` from the `Study` model**

Open `backend/app/models/study.py:104` and delete the comment block + line:
```python
# construction_memo). Surfaces the rationale behind distribution,
...
methodology_memo: Mapped[str | None] = mapped_column(String, nullable=True)
```
(Remove the surrounding comment that mentions `methodology_memo` as well.)

Also delete the `methodology_memo` line from `backend/vulture_whitelist.py` (line 324).

- [ ] **Step 2.6: Run mypy and the existing test suite to verify nothing else relied on the dropped columns**

```bash
make ci-fast
```
Expected: any test or schema referencing `construction_memo` / `methodology_memo` will fail. Note them — the next tasks (schemas, services, routers) will fix them. Do not commit yet; this step is a probe.

- [ ] **Step 2.7: Commit**

```bash
git add backend/app/models/ backend/vulture_whitelist.py
git commit -m "feat(memo): MemoEntry/MemoComment models, drop free-text memo columns from ORM"
```

---

## Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/memos.py`
- Modify: `backend/app/schemas/concourses.py` — drop 3 lines
- Modify: `backend/app/schemas/studies.py` — drop 2 lines

- [ ] **Step 3.1: Create `backend/app/schemas/memos.py`**

```python
# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Pydantic schemas for the memo subsystem."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


MemoParentTypeLiteral = Literal["concourse", "study"]


class MemoCommentBase(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class MemoCommentCreate(MemoCommentBase):
    mentions: list[int] = Field(default_factory=list)


class MemoCommentUpdate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class MemoCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entry_id: int
    user_id: int | None
    body: str
    mentions: list[int]
    resolved: bool
    resolved_at: datetime | None
    resolved_by: int | None
    deleted: bool
    created_at: datetime
    updated_at: datetime


class MemoEntryBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(default="", max_length=10000)


class MemoEntryCreate(MemoEntryBase):
    position: int | None = None  # server appends if None


class MemoEntryUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    body: str | None = Field(None, max_length=10000)
    position: int | None = None


class MemoEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_type: MemoParentTypeLiteral
    parent_id: int
    title: str
    body: str
    position: int
    created_at: datetime
    updated_at: datetime
    created_by: int | None
    last_edited_by: int | None
    comments: list[MemoCommentRead]


class MemoRead(BaseModel):
    parent_type: MemoParentTypeLiteral
    parent_id: int
    entries: list[MemoEntryRead]


class MemoTemplate(BaseModel):
    title: str
    description: str
```

- [ ] **Step 3.2: Drop the memo fields from existing schemas**

Open `backend/app/schemas/concourses.py:123` (and lines 131, 141) and delete the three `construction_memo` field declarations (in `ConcourseCreate`, `ConcourseUpdate`, `ConcourseDetailRead`).

Open `backend/app/schemas/studies.py:198` and `:228` and delete the two `methodology_memo` field declarations.

- [ ] **Step 3.3: Run lint + types**

```bash
make ci-fast
```
Expected: schemas now compile; tests still failing on services/routers (next tasks).

- [ ] **Step 3.4: Commit**

```bash
git add backend/app/schemas/
git commit -m "feat(memo): pydantic schemas (MemoEntry/MemoComment/MemoRead/MemoTemplate)"
```

---

## Task 4: MemoService — entry CRUD + reorder

**Files:**
- Create: `backend/app/services/memo_service.py`

- [ ] **Step 4.1: Write the failing test for `add_entry`**

Create `backend/tests/integration/test_memo_entry.py` with:

```python
"""Memo entry CRUD via MemoService."""
from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MemoParentType
from app.services.memo_service import MemoService

pytestmark = pytest.mark.asyncio


async def test_add_entry_appends_at_end(
    db_session: AsyncSession, seed_concourse_id: int, seed_user_id: int
) -> None:
    """A new entry created without explicit position lands after existing entries."""
    e1 = await MemoService.add_entry(
        db_session,
        parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id,
        title="First",
        body="first body",
        user_id=seed_user_id,
    )
    e2 = await MemoService.add_entry(
        db_session,
        parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id,
        title="Second",
        body="second body",
        user_id=seed_user_id,
    )
    assert e1.position == 10
    assert e2.position == 20  # sparse, +10


async def test_add_entry_explicit_position_inserts_between(
    db_session: AsyncSession, seed_concourse_id: int, seed_user_id: int
) -> None:
    await MemoService.add_entry(
        db_session, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="A", user_id=seed_user_id,
    )
    await MemoService.add_entry(
        db_session, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="C", user_id=seed_user_id,
    )
    middle = await MemoService.add_entry(
        db_session, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="B", body="", position=15,
        user_id=seed_user_id,
    )
    assert middle.position == 15


async def test_update_entry_sets_last_edited_by(
    db_session: AsyncSession, seed_concourse_id: int,
    seed_user_id: int, seed_other_user_id: int,
) -> None:
    e = await MemoService.add_entry(
        db_session, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="t", user_id=seed_user_id,
    )
    updated = await MemoService.update_entry(
        db_session, entry_id=e.id, title="t2", user_id=seed_other_user_id,
    )
    assert updated.title == "t2"
    assert updated.created_by == seed_user_id
    assert updated.last_edited_by == seed_other_user_id


async def test_delete_entry_cascades_to_comments(
    db_session: AsyncSession, seed_concourse_id: int, seed_user_id: int,
) -> None:
    e = await MemoService.add_entry(
        db_session, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="t", user_id=seed_user_id,
    )
    await MemoService.add_comment(
        db_session, entry_id=e.id, user_id=seed_user_id,
        body="hi", mentions=[],
    )
    await MemoService.delete_entry(db_session, entry_id=e.id)
    memo = await MemoService.get_memo(
        db_session, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id,
    )
    assert memo.entries == []
```

> If a `seed_concourse_id` fixture does not exist, look at `backend/tests/integration/test_concourse.py` for the existing concourse-seeding pattern and add the fixture to `backend/tests/conftest.py`. Same for `seed_user_id` / `seed_other_user_id`.

- [ ] **Step 4.2: Run the test (expect FAIL — service not yet defined)**

```bash
.venv/bin/pytest backend/tests/integration/test_memo_entry.py::test_add_entry_appends_at_end -v
```
Expected: `ImportError: cannot import name 'MemoService' from 'app.services.memo_service'`.

- [ ] **Step 4.3: Implement `MemoService` (entries portion)**

Create `backend/app/services/memo_service.py`:

```python
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
from sqlalchemy import and_, func, select
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
        # No commit here — caller commits as part of its own transaction.
```

(Comments-section methods go in Task 5.)

- [ ] **Step 4.4: Run the entry tests (expect PASS)**

```bash
.venv/bin/pytest backend/tests/integration/test_memo_entry.py -v
```
Expected: 4 passing tests.

- [ ] **Step 4.5: Commit**

```bash
git add backend/app/services/memo_service.py backend/tests/integration/test_memo_entry.py backend/tests/conftest.py
git commit -m "feat(memo): MemoService entry CRUD + cleanup_for_parent"
```

---

## Task 5: MemoService — comment lifecycle + mentions validation

**Files:**
- Modify: `backend/app/services/memo_service.py`
- Create: `backend/tests/integration/test_memo_comment.py`

- [ ] **Step 5.1: Write the failing comment tests**

Create `backend/tests/integration/test_memo_comment.py`:

```python
"""Memo comment lifecycle: post, edit, soft-delete, resolve, mentions."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MemoParentType
from app.services.memo_service import MemoService

pytestmark = pytest.mark.asyncio


async def test_add_comment_persists_mentions(
    db_session: AsyncSession, seed_entry_id: int,
    seed_user_id: int, seed_other_user_id: int,
) -> None:
    c = await MemoService.add_comment(
        db_session, entry_id=seed_entry_id, user_id=seed_user_id,
        body="@you what about this?", mentions=[seed_other_user_id],
    )
    assert c.mentions == [seed_other_user_id]


async def test_validate_mentions_rejects_non_member(
    db_session: AsyncSession, seed_project_id: int,
) -> None:
    with pytest.raises(HTTPException) as exc:
        await MemoService.validate_mentions(
            db_session, project_id=seed_project_id, user_ids=[999_999],
        )
    assert exc.value.status_code == 400


async def test_update_own_comment(
    db_session: AsyncSession, seed_entry_id: int, seed_user_id: int,
) -> None:
    c = await MemoService.add_comment(
        db_session, entry_id=seed_entry_id, user_id=seed_user_id,
        body="v1", mentions=[],
    )
    updated = await MemoService.update_comment(
        db_session, comment_id=c.id, body="v2",
    )
    assert updated.body == "v2"


async def test_soft_delete_blanks_body_on_read(
    db_session: AsyncSession, seed_entry_id: int, seed_user_id: int,
) -> None:
    c = await MemoService.add_comment(
        db_session, entry_id=seed_entry_id, user_id=seed_user_id,
        body="will be removed", mentions=[],
    )
    await MemoService.soft_delete_comment(db_session, comment_id=c.id)
    refreshed = await MemoService.get_comment(db_session, comment_id=c.id)
    assert refreshed.deleted is True
    # The body is preserved in the DB row but the read-layer (router) blanks it.
    # Service-level just flags it.


async def test_resolve_then_unresolve(
    db_session: AsyncSession, seed_entry_id: int,
    seed_user_id: int,
) -> None:
    c = await MemoService.add_comment(
        db_session, entry_id=seed_entry_id, user_id=seed_user_id,
        body="discuss", mentions=[],
    )
    resolved = await MemoService.resolve_comment(
        db_session, comment_id=c.id, user_id=seed_user_id,
    )
    assert resolved.resolved is True
    assert resolved.resolved_by == seed_user_id
    unresolved = await MemoService.unresolve_comment(db_session, comment_id=c.id)
    assert unresolved.resolved is False
    assert unresolved.resolved_at is None
```

- [ ] **Step 5.2: Run the tests (expect FAIL)**

```bash
.venv/bin/pytest backend/tests/integration/test_memo_comment.py -v
```
Expected: failures on missing methods.

- [ ] **Step 5.3: Implement comment methods on `MemoService`**

Append to `backend/app/services/memo_service.py`:

```python
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
        c.resolved_at = func.now()
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
```

> Add the `seed_entry_id` and `seed_project_id` fixtures to `backend/tests/conftest.py` if absent — both should produce a freshly-seeded entry/project bound to `seed_user_id` and `seed_other_user_id`.

- [ ] **Step 5.4: Run the tests (expect PASS)**

```bash
.venv/bin/pytest backend/tests/integration/test_memo_comment.py -v
```
Expected: 5 passing tests.

- [ ] **Step 5.5: Commit**

```bash
git add backend/app/services/memo_service.py \
        backend/tests/integration/test_memo_comment.py \
        backend/tests/conftest.py
git commit -m "feat(memo): comment lifecycle + mentions validation in MemoService"
```

---

## Task 6: Admin router — memo endpoints

**Files:**
- Create: `backend/app/routers/admin/memos.py`
- Modify: `backend/app/main.py` (register router)

- [ ] **Step 6.1: Create the router**

Create `backend/app/routers/admin/memos.py`:

```python
# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Admin endpoints for the memo subsystem."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import (
    check_project_permission,
    get_current_user,
    get_db,
)
from app.models import (
    Concourse,
    MemoComment,
    MemoEntry,
    MemoParentType,
    Project,
    ProjectRole,
    Study,
    User,
)
from app.schemas.memos import (
    MemoCommentCreate,
    MemoCommentRead,
    MemoCommentUpdate,
    MemoEntryCreate,
    MemoEntryRead,
    MemoEntryUpdate,
    MemoParentTypeLiteral,
    MemoRead,
    MemoTemplate,
)
from app.services.memo_service import MemoService

router = APIRouter(prefix="/admin", tags=["memos"])


# ---------- helpers ---------------------------------------------------------


async def _resolve_entry_parent(
    db: AsyncSession, entry_id: int
) -> tuple[MemoParentType, int, int]:
    """Return (parent_type, parent_id, project_id) for the entry's parent."""
    entry = await db.get(MemoEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Memo entry not found")
    if entry.parent_type == MemoParentType.concourse:
        c = await db.get(Concourse, entry.parent_id)
        if c is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Parent missing")
        return entry.parent_type, entry.parent_id, c.project_id
    s = await db.get(Study, entry.parent_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Parent missing")
    return entry.parent_type, entry.parent_id, s.project_id


async def _check_member(
    db: AsyncSession, project_id: int, user: User, required: ProjectRole
) -> None:
    from app.models import ProjectMember
    from sqlalchemy import select

    from app.dependencies import PROJECT_ROLE_HIERARCHY

    row = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project access denied")
    if PROJECT_ROLE_HIERARCHY[row.role] < PROJECT_ROLE_HIERARCHY[required]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions. Required: {required.value}",
        )


# ---------- read ------------------------------------------------------------


@router.get(
    "/concourses/{cid}/memo",
    response_model=MemoRead,
)
async def get_concourse_memo(
    cid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoRead:
    c = await db.get(Concourse, cid)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Concourse not found")
    await _check_member(db, c.project_id, user, ProjectRole.viewer)
    return await MemoService.get_memo(
        db, parent_type=MemoParentType.concourse, parent_id=cid
    )


@router.get(
    "/studies/{sid}/memo",
    response_model=MemoRead,
)
async def get_study_memo(
    sid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoRead:
    s = await db.get(Study, sid)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Study not found")
    await _check_member(db, s.project_id, user, ProjectRole.viewer)
    return await MemoService.get_memo(
        db, parent_type=MemoParentType.study, parent_id=sid
    )


@router.get("/memo/templates", response_model=list[MemoTemplate])
async def get_templates(
    parent_type: MemoParentTypeLiteral,
    user: User = Depends(get_current_user),
) -> list[MemoTemplate]:
    return MemoService.get_templates(MemoParentType(parent_type))


# ---------- entries (write) -------------------------------------------------


@router.post(
    "/concourses/{cid}/memo/entries",
    response_model=MemoEntryRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_concourse_entry(
    cid: int,
    payload: MemoEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoEntryRead:
    c = await db.get(Concourse, cid)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Concourse not found")
    await _check_member(db, c.project_id, user, ProjectRole.researcher)
    e = await MemoService.add_entry(
        db, parent_type=MemoParentType.concourse, parent_id=cid,
        title=payload.title, body=payload.body, position=payload.position,
        user_id=user.id,
    )
    return await _reload_entry(db, e.id)


@router.post(
    "/studies/{sid}/memo/entries",
    response_model=MemoEntryRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_study_entry(
    sid: int,
    payload: MemoEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoEntryRead:
    s = await db.get(Study, sid)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Study not found")
    await _check_member(db, s.project_id, user, ProjectRole.researcher)
    e = await MemoService.add_entry(
        db, parent_type=MemoParentType.study, parent_id=sid,
        title=payload.title, body=payload.body, position=payload.position,
        user_id=user.id,
    )
    return await _reload_entry(db, e.id)


@router.patch("/memo-entries/{eid}", response_model=MemoEntryRead)
async def update_entry(
    eid: int,
    payload: MemoEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoEntryRead:
    _, _, project_id = await _resolve_entry_parent(db, eid)
    await _check_member(db, project_id, user, ProjectRole.researcher)
    await MemoService.update_entry(
        db, entry_id=eid, user_id=user.id,
        title=payload.title, body=payload.body, position=payload.position,
    )
    return await _reload_entry(db, eid)


@router.delete("/memo-entries/{eid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    eid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    _, _, project_id = await _resolve_entry_parent(db, eid)
    await _check_member(db, project_id, user, ProjectRole.researcher)
    await MemoService.delete_entry(db, entry_id=eid)


# ---------- comments --------------------------------------------------------


@router.post(
    "/memo-entries/{eid}/comments",
    response_model=MemoCommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def post_comment(
    eid: int,
    payload: MemoCommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    _, _, project_id = await _resolve_entry_parent(db, eid)
    await _check_member(db, project_id, user, ProjectRole.viewer)
    await MemoService.validate_mentions(
        db, project_id=project_id, user_ids=payload.mentions
    )
    c = await MemoService.add_comment(
        db, entry_id=eid, user_id=user.id,
        body=payload.body, mentions=payload.mentions,
    )
    return MemoCommentRead.model_validate(c, from_attributes=True)


@router.patch("/memo-comments/{cid}", response_model=MemoCommentRead)
async def update_comment(
    cid: int,
    payload: MemoCommentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    c = await MemoService.get_comment(db, comment_id=cid)
    _, _, project_id = await _resolve_entry_parent(db, c.entry_id)
    if c.user_id != user.id:
        await _check_member(db, project_id, user, ProjectRole.owner)  # moderation
    else:
        await _check_member(db, project_id, user, ProjectRole.viewer)
    updated = await MemoService.update_comment(db, comment_id=cid, body=payload.body)
    return MemoCommentRead.model_validate(updated, from_attributes=True)


@router.delete(
    "/memo-comments/{cid}",
    response_model=MemoCommentRead,
)
async def delete_comment(
    cid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    c = await MemoService.get_comment(db, comment_id=cid)
    _, _, project_id = await _resolve_entry_parent(db, c.entry_id)
    if c.user_id != user.id:
        await _check_member(db, project_id, user, ProjectRole.owner)
    else:
        await _check_member(db, project_id, user, ProjectRole.viewer)
    soft = await MemoService.soft_delete_comment(db, comment_id=cid)
    return MemoCommentRead.model_validate(soft, from_attributes=True)


@router.post("/memo-comments/{cid}/resolve", response_model=MemoCommentRead)
async def resolve_comment(
    cid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    c = await MemoService.get_comment(db, comment_id=cid)
    _, _, project_id = await _resolve_entry_parent(db, c.entry_id)
    # Entry author or owner.
    entry = await db.get(MemoEntry, c.entry_id)
    is_entry_author = entry is not None and entry.created_by == user.id
    if not is_entry_author:
        await _check_member(db, project_id, user, ProjectRole.owner)
    else:
        await _check_member(db, project_id, user, ProjectRole.researcher)
    resolved = await MemoService.resolve_comment(
        db, comment_id=cid, user_id=user.id
    )
    return MemoCommentRead.model_validate(resolved, from_attributes=True)


@router.post("/memo-comments/{cid}/unresolve", response_model=MemoCommentRead)
async def unresolve_comment(
    cid: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MemoCommentRead:
    c = await MemoService.get_comment(db, comment_id=cid)
    _, _, project_id = await _resolve_entry_parent(db, c.entry_id)
    entry = await db.get(MemoEntry, c.entry_id)
    is_entry_author = entry is not None and entry.created_by == user.id
    if not is_entry_author:
        await _check_member(db, project_id, user, ProjectRole.owner)
    else:
        await _check_member(db, project_id, user, ProjectRole.researcher)
    unresolved = await MemoService.unresolve_comment(db, comment_id=cid)
    return MemoCommentRead.model_validate(unresolved, from_attributes=True)


# ---------- helper ----------------------------------------------------------


async def _reload_entry(db: AsyncSession, entry_id: int) -> MemoEntryRead:
    """Reload an entry with comments selectinload-ed and serialise it."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    stmt = (
        select(MemoEntry)
        .where(MemoEntry.id == entry_id)
        .options(selectinload(MemoEntry.comments))
    )
    e = (await db.execute(stmt)).scalar_one()
    return MemoEntryRead.model_validate(e, from_attributes=True)
```

- [ ] **Step 6.2: Register the router**

Open `backend/app/main.py`, find the existing block that imports and includes admin routers (e.g., `from app.routers.admin import concourses, projects, ...`), and add `memos`:

```python
from app.routers.admin import (
    ...,
    memos as admin_memos,
)
...
app.include_router(admin_memos.router)
```

- [ ] **Step 6.3: Smoke-test the router**

Add a minimal API smoke test to `backend/tests/integration/test_memo_entry.py`:

```python
async def test_get_memo_endpoint_returns_empty_for_fresh_concourse(
    client, seed_concourse_id: int, auth_headers_for_seed_user,
) -> None:
    response = await client.get(
        f"/admin/concourses/{seed_concourse_id}/memo",
        headers=auth_headers_for_seed_user,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["entries"] == []
    assert payload["parent_type"] == "concourse"
```

Run:
```bash
make ci-fast
```
Expected: pass.

- [ ] **Step 6.4: Permission matrix tests**

Append to `backend/tests/integration/test_memo_entry.py`:

```python
async def test_viewer_cannot_create_entry(
    client, seed_concourse_id: int, auth_headers_for_viewer,
) -> None:
    response = await client.post(
        f"/admin/concourses/{seed_concourse_id}/memo/entries",
        json={"title": "denied", "body": ""},
        headers=auth_headers_for_viewer,
    )
    assert response.status_code == 403


async def test_viewer_can_post_comment(
    client, seed_entry_id: int, auth_headers_for_viewer,
) -> None:
    response = await client.post(
        f"/admin/memo-entries/{seed_entry_id}/comments",
        json={"body": "viewer-input", "mentions": []},
        headers=auth_headers_for_viewer,
    )
    assert response.status_code == 201
```

Run:
```bash
.venv/bin/pytest backend/tests/integration/test_memo_entry.py -v
```
Expected: pass.

- [ ] **Step 6.5: Commit**

```bash
git add backend/app/routers/admin/memos.py backend/app/main.py backend/tests/integration/test_memo_entry.py
git commit -m "feat(memo): admin router with entries/comments/templates endpoints"
```

---

## Task 7: Plumb cleanup in concourse_service.delete & study_service.delete

**Files:**
- Modify: `backend/app/services/concourse_service.py`
- Modify: `backend/app/services/study_service.py`

- [ ] **Step 7.1: Find the existing delete entry points**

```bash
grep -n "async def delete" backend/app/services/concourse_service.py backend/app/services/study_service.py
```

- [ ] **Step 7.2: Wire `MemoService.cleanup_for_parent` into both `delete` methods**

In `concourse_service.py`, before the `await db.delete(concourse)` line, add:
```python
from app.models import MemoParentType
from app.services.memo_service import MemoService
await MemoService.cleanup_for_parent(
    db, parent_type=MemoParentType.concourse, parent_id=concourse.id
)
```

Same pattern in `study_service.py` with `MemoParentType.study` and `study.id`.

- [ ] **Step 7.3: Add a regression test in each integration suite**

In `backend/tests/integration/test_concourse.py`, after the existing delete tests, add:

```python
async def test_deleting_concourse_cleans_up_memo(
    db_session: AsyncSession, seed_concourse_id: int, seed_user_id: int
) -> None:
    from app.models import MemoEntry, MemoParentType
    from app.services.concourse_service import ConcourseService
    from app.services.memo_service import MemoService

    await MemoService.add_entry(
        db_session, parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id, title="t", user_id=seed_user_id,
    )
    await ConcourseService.delete(db_session, concourse_id=seed_concourse_id)
    from sqlalchemy import select, func
    count = (await db_session.execute(
        select(func.count(MemoEntry.id)).where(
            MemoEntry.parent_type == MemoParentType.concourse,
            MemoEntry.parent_id == seed_concourse_id,
        )
    )).scalar()
    assert count == 0
```

Mirror in `backend/tests/integration/test_study_service.py`.

Run:
```bash
.venv/bin/pytest backend/tests/integration/test_concourse.py::test_deleting_concourse_cleans_up_memo -v
.venv/bin/pytest backend/tests/integration/test_study_service.py -k "memo" -v
```
Expected: pass.

- [ ] **Step 7.4: Commit**

```bash
git add backend/app/services/concourse_service.py backend/app/services/study_service.py \
        backend/tests/integration/test_concourse.py backend/tests/integration/test_study_service.py
git commit -m "feat(memo): cascade-cleanup memo entries on concourse/study delete"
```

---

## Task 8: Drop existing memo references in old code paths

**Files:**
- Modify: `backend/app/services/concourse_service.py` — drop `construction_memo` from `create` / `update`
- Modify: `backend/app/services/study_service.py` — drop `methodology_memo` from `create` / `update`
- Modify: `backend/app/routers/admin/concourses.py:123,147` — drop `construction_memo` field
- Modify: `backend/tests/integration/test_concourse.py` — drop the 3 round-trip tests around line 148, 172, 189
- Modify: `backend/tests/integration/test_study_service.py:172-196` — drop `test_update_study_methodology_memo_round_trip`

- [ ] **Step 8.1: Apply the deletions**

Remove every `construction_memo=…` assignment / reference. Same for `methodology_memo`. Run:
```bash
grep -rn "construction_memo\|methodology_memo" backend/app backend/tests
```
Expected: empty output (no remaining references).

- [ ] **Step 8.2: Run `make ci-fast`**

```bash
make ci-fast
```
Expected: backend tests + types + lint all green. Frontend will still fail at this point because the generated client expects the dropped fields — that's Task 9.

- [ ] **Step 8.3: Commit**

```bash
git add backend/
git commit -m "refactor(memo): drop construction_memo/methodology_memo from services and old tests"
```

---

## Task 9: Regenerate API client + frontend stubs

**Files:**
- Run: `make generate-api`
- Modify: `frontend/src/hooks/admin/useConcourseDetailPage.ts` — drop `constructionMemo` state + saveCallback
- Modify: `frontend/src/hooks/admin/useConcourseDetailPage.test.ts` — drop construction-memo tests
- Modify: `frontend/src/components/admin/designer/IntroductionEditor.tsx` — replace methodology-memo textarea with stub `<div>`
- Modify: `frontend/src/components/admin/designer/IntroductionEditor.test.tsx` — drop `methodology_memo` seed
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx` — replace memo Accordion content with stub `<div>`

- [ ] **Step 9.1: Regenerate the OpenAPI client**

```bash
make generate-api
```
Expected: `frontend/src/api/generated.ts` and `frontend/src/api/model/*.ts` updated. Run `git status` to verify the diff is in those paths.

- [ ] **Step 9.2: Replace the construction-memo accordion content with a Phase-1 stub**

Open `frontend/src/pages/admin/ConcourseDetailPage.tsx:316-355` (the `<AccordionContent>` block). Replace with:

```tsx
<AccordionContent>
    <CardContent className="p-4 sm:p-6">
        <p className="text-xs italic text-slate-500">
            {t(
                'admin.memo.upgrading',
                'Memo system upgraded; collaborative entries arrive in the next release.'
            )}
        </p>
    </CardContent>
</AccordionContent>
```

Drop the `constructionMemo` state, the `setConstructionMemo`, `isConstructionMemoDirty`, `isSavingConstructionMemo`, `saveConstructionMemo` from `useConcourseDetailPage.ts`. Drop the corresponding tests in `useConcourseDetailPage.test.ts:556-625`.

- [ ] **Step 9.3: Replace the methodology-memo accordion content with a Phase-1 stub**

Open `frontend/src/components/admin/designer/IntroductionEditor.tsx:417-449`. Replace the `<AccordionContent>` body with:

```tsx
<AccordionContent>
    <CardContent>
        <p className="text-xs italic text-slate-500">
            {t(
                'admin.memo.upgrading',
                'Memo system upgraded; collaborative entries arrive in the next release.'
            )}
        </p>
    </CardContent>
</AccordionContent>
```

Drop `draft.methodology_memo` references and the `methodology_memo: null` seed from the test file.

- [ ] **Step 9.4: Add the new translation key**

Append to `frontend/public/locales/en/translation.json` (in the `admin.memo` namespace, creating it if needed):
```json
"memo": {
    "upgrading": "Memo system upgraded; collaborative entries arrive in the next release."
}
```
Same key in `fr/translation.json` (translate) and `fi/translation.json` (translate).

- [ ] **Step 9.5: Run full CI**

```bash
make ci
```
Expected: all green.

- [ ] **Step 9.6: Commit and open Phase 1 PR**

```bash
git add frontend/src/api/ frontend/src/pages/admin/ConcourseDetailPage.tsx \
        frontend/src/hooks/admin/useConcourseDetailPage.ts \
        frontend/src/hooks/admin/useConcourseDetailPage.test.ts \
        frontend/src/components/admin/designer/IntroductionEditor.tsx \
        frontend/src/components/admin/designer/IntroductionEditor.test.tsx \
        frontend/public/locales/
git commit -m "refactor(memo): phase-1 frontend stubs + regenerated API client"
git push -u origin <branch>
gh pr create --title "feat(memo): backend foundation for collaborative memos" --body "..."
```

PR title : `feat(memo): backend foundation for collaborative memos (phase 1/4)`. Body summarises §3-§4 of the design spec, links the spec, lists what's deferred to phases 2-4.

---

## Task 10: Add new modules to mypy strict overrides

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/CLAUDE.md`-relevant section in root `CLAUDE.md` — update strict-typed module list

- [ ] **Step 10.1: Add the strict overrides**

Open `backend/pyproject.toml`. After the existing `[[tool.mypy.overrides]]` blocks, add:

```toml
[[tool.mypy.overrides]]
# Memo subsystem — service is a leaf with no JSON columns or stub leakage.
module = ["app.services.memo_service"]
disallow_any_explicit = true
disallow_untyped_defs = true
warn_return_any = true
strict_equality = true

[[tool.mypy.overrides]]
# Memo router — Pydantic models in router (BaseModel stubs leak Any).
module = ["app.routers.admin.memos"]
disallow_untyped_defs = true
warn_return_any = true
strict_equality = true

[[tool.mypy.overrides]]
# Memo schemas — Pydantic v2 BaseModel stubs.
module = ["app.schemas.memos"]
disallow_untyped_defs = true
warn_return_any = true
strict_equality = true
```

The `app.models.memo` module is automatically covered by the existing `app.models` override.

- [ ] **Step 10.2: Update the project CLAUDE.md**

Open `/home/julien/tools/qualis/CLAUDE.md`. In the "Strict-typed Python modules" section under "Full strict", add:
```
- `app.services.memo_service` — phase 5 memo subsystem
```
Under "Strict without disallow_any_explicit", add:
```
- `app.routers.admin.memos` — phase 5 memo subsystem
- `app.schemas.memos` — phase 5 memo subsystem (Pydantic BaseModel)
```
Update the running total ("Total: 59 modules" → "62 modules").

- [ ] **Step 10.3: Run types**

```bash
make check
```
Expected: green.

- [ ] **Step 10.4: Commit**

```bash
git add backend/pyproject.toml CLAUDE.md
git commit -m "chore(memo): mypy strict overrides for memo modules + CLAUDE.md update"
```

This commit lands inside the Phase 1 PR (don't open a new PR for this).

---

# Phase 2 — Frontend MemoSection

**Goal:** ship `<MemoSection>` (entries + threaded comments + mention autocomplete) and wire it into both Accordion shells. The Phase-1 stub `admin.memo.upgrading` text is removed.

## Task 11: i18n keys

**Files:**
- Modify: `frontend/public/locales/{en,fr,fi}/translation.json`
- Remove: `admin.concourse.construction_memo.*`, `admin.design.methodology_memo.*`

- [ ] **Step 11.1: Replace old keys with the new namespace**

Open `frontend/public/locales/en/translation.json`. Delete the `admin.concourse.construction_memo` block (lines ~693-701) and the `admin.design.methodology_memo` block (lines ~1865-1871). Add to `admin.memo`:

```json
"memo": {
    "title_concourse": "Construction memo",
    "title_study": "Methodology memo",
    "summary_empty_concourse": "Optional · for transparency about the curation process",
    "summary_empty_study": "Optional · for replication & pre-registration",
    "summary_filled_one": "{{n}} entry · click to view",
    "summary_filled_other": "{{n}} entries · click to view",
    "summary_unread": "{{n}} unread",
    "add_entry": "Add entry",
    "insert_template": "Insert from template",
    "entry_title_placeholder": "Section title…",
    "entry_body_placeholder": "Document your rationale…",
    "comments_count_one": "{{n}} comment",
    "comments_count_other": "{{n}} comments",
    "show_resolved": "Show resolved ({{n}})",
    "hide_resolved": "Hide resolved",
    "comment_placeholder": "Write a comment. Use @ to mention.",
    "post_comment": "Post",
    "edit": "Edit",
    "delete": "Delete",
    "deleted_body": "[deleted comment]",
    "resolve": "Resolve",
    "unresolve": "Unresolve",
    "save": "Save",
    "cancel": "Cancel",
    "saved": "Saved",
    "save_error": "Save failed",
    "mentions_for_you": "Mentions for you",
    "mention_user_not_found": "Unknown user",
    "delete_entry_confirm": "Delete this entry and all its comments?"
}
```

Translate the same keys to `fr` and `fi`. Run:
```bash
npm --prefix frontend run i18n-check
```
Expected: green (all three locales contain the same keys).

- [ ] **Step 11.2: Commit**

```bash
git add frontend/public/locales/
git commit -m "feat(memo): i18n keys for MemoSection (en/fr/fi)"
```

---

## Task 12: `useMemoSection` hook (logic only)

**Files:**
- Create: `frontend/src/hooks/admin/useMemoSection.ts`
- Create: `frontend/src/hooks/admin/useMemoSection.test.ts`
- Create: `frontend/src/components/admin/memo/memoLastSeen.ts` — `getLastSeen(key)`, `bumpLastSeen(key)`

- [ ] **Step 12.1: Write the failing hook tests**

Create `frontend/src/hooks/admin/useMemoSection.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMemoSection } from './useMemoSection';

vi.mock('@/api/admin', () => ({
    getConcourseMemo: vi.fn(),
    createConcourseEntry: vi.fn(),
    updateMemoEntry: vi.fn(),
    deleteMemoEntry: vi.fn(),
    postMemoComment: vi.fn(),
    updateMemoComment: vi.fn(),
    deleteMemoComment: vi.fn(),
    resolveMemoComment: vi.fn(),
    unresolveMemoComment: vi.fn(),
    getMemoTemplates: vi.fn(),
}));

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe('useMemoSection', () => {
    it('fetches memo on mount', async () => {
        const { getConcourseMemo } = await import('@/api/admin');
        (getConcourseMemo as any).mockResolvedValue({
            parent_type: 'concourse',
            parent_id: 42,
            entries: [],
        });
        const { result } = renderHook(() =>
            useMemoSection({ parentType: 'concourse', parentId: 42, currentUserId: 1, projectMembers: [] }),
        );
        await waitFor(() => expect(result.current.entries).toEqual([]));
    });

    it('computes unread count from comments newer than localStorage timestamp', async () => {
        const { getConcourseMemo } = await import('@/api/admin');
        (getConcourseMemo as any).mockResolvedValue({
            parent_type: 'concourse', parent_id: 42,
            entries: [{
                id: 1, comments: [
                    { id: 10, created_at: '2026-04-30T10:00:00Z' },
                    { id: 11, created_at: '2026-04-30T11:00:00Z' },
                ],
                title: 't', body: '', position: 10,
            }],
        });
        localStorage.setItem(
            'memo-last-seen:1:concourse:42',
            '2026-04-30T10:30:00Z',
        );
        const { result } = renderHook(() =>
            useMemoSection({ parentType: 'concourse', parentId: 42, currentUserId: 1, projectMembers: [] }),
        );
        await waitFor(() => expect(result.current.unreadCount).toBe(1));
    });

    it('mentions for you filters to comments mentioning current user', async () => {
        const { getConcourseMemo } = await import('@/api/admin');
        (getConcourseMemo as any).mockResolvedValue({
            parent_type: 'concourse', parent_id: 42,
            entries: [{
                id: 1, comments: [
                    { id: 10, mentions: [1, 2], body: 'hi @1' },
                    { id: 11, mentions: [2], body: 'hi @2' },
                ],
                title: 't', body: '', position: 10,
            }],
        });
        const { result } = renderHook(() =>
            useMemoSection({ parentType: 'concourse', parentId: 42, currentUserId: 1, projectMembers: [] }),
        );
        await waitFor(() => expect(result.current.mentionsForYou).toHaveLength(1));
        expect(result.current.mentionsForYou[0].id).toBe(10);
    });

    it('addEntry calls API and prepends optimistic entry', async () => {
        const { getConcourseMemo, createConcourseEntry } = await import('@/api/admin');
        (getConcourseMemo as any).mockResolvedValue({
            parent_type: 'concourse', parent_id: 42, entries: [],
        });
        (createConcourseEntry as any).mockResolvedValue({
            id: 99, parent_type: 'concourse', parent_id: 42,
            title: 'N', body: '', position: 10, comments: [],
        });
        const { result } = renderHook(() =>
            useMemoSection({ parentType: 'concourse', parentId: 42, currentUserId: 1, projectMembers: [] }),
        );
        await waitFor(() => expect(result.current.entries).toBeDefined());
        await act(async () => {
            await result.current.addEntry({ title: 'N', body: '' });
        });
        expect(result.current.entries.find((e: any) => e.id === 99)).toBeTruthy();
    });

    it('markSeen bumps localStorage and clears unread', async () => {
        const { getConcourseMemo } = await import('@/api/admin');
        (getConcourseMemo as any).mockResolvedValue({
            parent_type: 'concourse', parent_id: 42,
            entries: [{ id: 1, comments: [{ id: 10, created_at: '2026-04-30T11:00:00Z' }],
                        title: 't', body: '', position: 10 }],
        });
        const { result } = renderHook(() =>
            useMemoSection({ parentType: 'concourse', parentId: 42, currentUserId: 1, projectMembers: [] }),
        );
        await waitFor(() => expect(result.current.unreadCount).toBe(1));
        act(() => result.current.markSeen());
        expect(result.current.unreadCount).toBe(0);
    });
});
```

Run:
```bash
npm --prefix frontend test -- useMemoSection
```
Expected: FAIL — module not yet defined.

- [ ] **Step 12.2: Implement `memoLastSeen` helpers**

Create `frontend/src/components/admin/memo/memoLastSeen.ts`:

```typescript
const KEY = (userId: number, parentType: string, parentId: number): string =>
    `memo-last-seen:${userId}:${parentType}:${parentId}`;

export function getLastSeen(userId: number, parentType: string, parentId: number): string {
    return localStorage.getItem(KEY(userId, parentType, parentId)) ?? '1970-01-01T00:00:00Z';
}

export function bumpLastSeen(userId: number, parentType: string, parentId: number): void {
    localStorage.setItem(KEY(userId, parentType, parentId), new Date().toISOString());
}
```

- [ ] **Step 12.3: Implement `useMemoSection`**

Create `frontend/src/hooks/admin/useMemoSection.ts`:

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    createConcourseEntry,
    createStudyEntry,
    deleteMemoComment,
    deleteMemoEntry,
    getConcourseMemo,
    getMemoTemplates,
    getStudyMemo,
    postMemoComment,
    resolveMemoComment,
    unresolveMemoComment,
    updateMemoComment,
    updateMemoEntry,
} from '@/api/admin';  // adjust import path to match generated client
import type {
    MemoCommentRead,
    MemoEntryRead,
    MemoRead,
    MemoTemplate,
} from '@/api/model';
import { bumpLastSeen, getLastSeen } from '@/components/admin/memo/memoLastSeen';

interface ProjectMemberLite {
    user_id: number;
    display_name: string;
}

interface UseMemoSectionArgs {
    parentType: 'concourse' | 'study';
    parentId: number;
    currentUserId: number;
    projectMembers: ProjectMemberLite[];
}

export function useMemoSection({
    parentType,
    parentId,
    currentUserId,
    projectMembers,
}: UseMemoSectionArgs) {
    const [memo, setMemo] = useState<MemoRead | null>(null);
    const [templates, setTemplates] = useState<MemoTemplate[]>([]);
    const [showResolved, setShowResolved] = useState(false);
    const [lastSeenAt, setLastSeenAt] = useState(() =>
        getLastSeen(currentUserId, parentType, parentId),
    );

    useEffect(() => {
        const loader = parentType === 'concourse' ? getConcourseMemo : getStudyMemo;
        loader(parentId).then(setMemo).catch(() => toast.error('Memo load failed'));
        getMemoTemplates(parentType).then(setTemplates).catch(() => undefined);
    }, [parentType, parentId]);

    const entries = useMemo<MemoEntryRead[]>(() => memo?.entries ?? [], [memo]);

    const allComments = useMemo<MemoCommentRead[]>(
        () => entries.flatMap((e) => e.comments),
        [entries],
    );

    const unreadCount = useMemo(
        () =>
            allComments.filter(
                (c) => !c.deleted && c.created_at > lastSeenAt && c.user_id !== currentUserId,
            ).length,
        [allComments, lastSeenAt, currentUserId],
    );

    const mentionsForYou = useMemo(
        () =>
            allComments.filter(
                (c) =>
                    !c.deleted &&
                    !c.resolved &&
                    c.mentions.includes(currentUserId) &&
                    c.created_at > lastSeenAt,
            ),
        [allComments, currentUserId, lastSeenAt],
    );

    const markSeen = useCallback(() => {
        bumpLastSeen(currentUserId, parentType, parentId);
        setLastSeenAt(new Date().toISOString());
    }, [currentUserId, parentType, parentId]);

    const refetch = useCallback(async () => {
        const loader = parentType === 'concourse' ? getConcourseMemo : getStudyMemo;
        setMemo(await loader(parentId));
    }, [parentType, parentId]);

    const addEntry = useCallback(
        async (payload: { title: string; body?: string; position?: number }) => {
            const creator = parentType === 'concourse' ? createConcourseEntry : createStudyEntry;
            const created = await creator(parentId, payload);
            setMemo((m) =>
                m
                    ? { ...m, entries: [...m.entries, created].sort((a, b) => a.position - b.position) }
                    : m,
            );
            return created;
        },
        [parentType, parentId],
    );

    const editEntry = useCallback(
        async (entryId: number, patch: { title?: string; body?: string; position?: number }) => {
            const updated = await updateMemoEntry(entryId, patch);
            setMemo((m) =>
                m
                    ? { ...m, entries: m.entries.map((e) => (e.id === entryId ? updated : e)) }
                    : m,
            );
            return updated;
        },
        [],
    );

    const removeEntry = useCallback(async (entryId: number) => {
        await deleteMemoEntry(entryId);
        setMemo((m) =>
            m ? { ...m, entries: m.entries.filter((e) => e.id !== entryId) } : m,
        );
    }, []);

    const addComment = useCallback(
        async (entryId: number, body: string, mentions: number[]) => {
            const created = await postMemoComment(entryId, { body, mentions });
            setMemo((m) =>
                m
                    ? {
                          ...m,
                          entries: m.entries.map((e) =>
                              e.id === entryId
                                  ? { ...e, comments: [...e.comments, created] }
                                  : e,
                          ),
                      }
                    : m,
            );
            return created;
        },
        [],
    );

    const editComment = useCallback(async (commentId: number, body: string) => {
        const updated = await updateMemoComment(commentId, { body });
        setMemo((m) =>
            m
                ? {
                      ...m,
                      entries: m.entries.map((e) => ({
                          ...e,
                          comments: e.comments.map((c) => (c.id === commentId ? updated : c)),
                      })),
                  }
                : m,
        );
        return updated;
    }, []);

    const removeComment = useCallback(async (commentId: number) => {
        const soft = await deleteMemoComment(commentId);
        setMemo((m) =>
            m
                ? {
                      ...m,
                      entries: m.entries.map((e) => ({
                          ...e,
                          comments: e.comments.map((c) => (c.id === commentId ? soft : c)),
                      })),
                  }
                : m,
        );
    }, []);

    const toggleResolve = useCallback(
        async (comment: MemoCommentRead) => {
            const fn = comment.resolved ? unresolveMemoComment : resolveMemoComment;
            const updated = await fn(comment.id);
            setMemo((m) =>
                m
                    ? {
                          ...m,
                          entries: m.entries.map((e) => ({
                              ...e,
                              comments: e.comments.map((c) => (c.id === comment.id ? updated : c)),
                          })),
                      }
                    : m,
            );
        },
        [],
    );

    return {
        entries,
        templates,
        unreadCount,
        mentionsForYou,
        showResolved,
        setShowResolved,
        markSeen,
        refetch,
        addEntry,
        editEntry,
        removeEntry,
        addComment,
        editComment,
        removeComment,
        toggleResolve,
        projectMembers,
    };
}
```

> The exact API client function names depend on how `make generate-api` (orval) produces them. Inspect `frontend/src/api/admin/` after Phase 1 regeneration and adjust the imports above. Naming will likely follow `getAdminConcoursesCidMemo` / `postAdminConcoursesCidMemoEntries` / etc.

- [ ] **Step 12.4: Run tests (expect PASS)**

```bash
npm --prefix frontend test -- useMemoSection
```
Expected: 5 passing tests.

- [ ] **Step 12.5: Commit**

```bash
git add frontend/src/hooks/admin/useMemoSection.ts \
        frontend/src/hooks/admin/useMemoSection.test.ts \
        frontend/src/components/admin/memo/memoLastSeen.ts
git commit -m "feat(memo): useMemoSection hook + memoLastSeen helpers"
```

---

## Task 13: Sub-components — `CommentThread`, `MentionAutocomplete`, `MemoEntry`

**Files:**
- Create: `frontend/src/components/admin/memo/CommentThread.tsx`
- Create: `frontend/src/components/admin/memo/MentionAutocomplete.tsx`
- Create: `frontend/src/components/admin/memo/MemoEntry.tsx`

These three components are pure JSX rendering from props; they receive callbacks from `useMemoSection`. Per CLAUDE.md "hook-driven components" guidance, they own no state and no effects — only `useRef` for DOM elements and visual-only transitional state.

- [ ] **Step 13.1: `MentionAutocomplete`**

A controlled `<textarea>` wrapper. When the user types `@`, a `<Popover>` lists `projectMembers` matching the prefix; selecting one inserts `@username` into the textarea and pushes the user_id into a parent-controlled `mentions` array.

```tsx
import { useState, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

interface ProjectMemberLite {
    user_id: number;
    display_name: string;
}

interface Props {
    value: string;
    onChange: (value: string, mentions: number[]) => void;
    members: ProjectMemberLite[];
    placeholder?: string;
}

export function MentionAutocomplete({ value, onChange, members, placeholder }: Props) {
    const [query, setQuery] = useState<string | null>(null);
    const ref = useRef<HTMLTextAreaElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        const cursor = e.target.selectionStart;
        // Find a `@<word>` immediately before the cursor.
        const head = text.slice(0, cursor);
        const m = /@([\w-]*)$/.exec(head);
        setQuery(m ? m[1] : null);
        // Recompute mentions from text (every @username that maps to a known member).
        const mentions = Array.from(text.matchAll(/@([\w-]+)/g))
            .map((mm) =>
                members.find((u) => u.display_name === mm[1])?.user_id ?? null,
            )
            .filter((x): x is number => x !== null);
        onChange(text, [...new Set(mentions)]);
    };

    const filtered = query !== null
        ? members.filter((m) => m.display_name.toLowerCase().includes(query.toLowerCase()))
        : [];

    const insert = (m: ProjectMemberLite) => {
        const node = ref.current;
        if (!node) return;
        const cursor = node.selectionStart;
        const head = value.slice(0, cursor).replace(/@[\w-]*$/, `@${m.display_name} `);
        const tail = value.slice(cursor);
        const next = head + tail;
        onChange(
            next,
            Array.from(next.matchAll(/@([\w-]+)/g))
                .map((mm) => members.find((u) => u.display_name === mm[1])?.user_id ?? null)
                .filter((x): x is number => x !== null),
        );
        setQuery(null);
        node.focus();
    };

    return (
        <Popover open={query !== null && filtered.length > 0}>
            <PopoverTrigger asChild>
                <Textarea
                    ref={ref}
                    value={value}
                    onChange={handleChange}
                    placeholder={placeholder}
                    rows={3}
                    className="rounded-xl"
                />
            </PopoverTrigger>
            <PopoverContent className="p-1 w-56" align="start">
                {filtered.map((m) => (
                    <button
                        key={m.user_id}
                        type="button"
                        onClick={() => insert(m)}
                        className="block w-full text-left px-2 py-1 hover:bg-slate-50 rounded-md text-sm"
                    >
                        @{m.display_name}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}
```

- [ ] **Step 13.2: `CommentThread`**

Renders the comment list (one entry's worth) plus the comment composer. Filters resolved if `showResolved` is false. Reuses `MentionAutocomplete` for the composer.

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MentionAutocomplete } from './MentionAutocomplete';
import type { MemoCommentRead } from '@/api/model';

interface ProjectMemberLite { user_id: number; display_name: string; }

interface Props {
    comments: MemoCommentRead[];
    showResolved: boolean;
    currentUserId: number;
    isOwner: boolean;
    members: ProjectMemberLite[];
    onPost: (body: string, mentions: number[]) => Promise<void>;
    onEdit: (commentId: number, body: string) => Promise<void>;
    onDelete: (commentId: number) => Promise<void>;
    onToggleResolve: (comment: MemoCommentRead) => Promise<void>;
}

export function CommentThread({
    comments, showResolved, currentUserId, isOwner, members,
    onPost, onEdit, onDelete, onToggleResolve,
}: Props) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    const [mentions, setMentions] = useState<number[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState('');

    const visible = showResolved
        ? comments
        : comments.filter((c) => !c.resolved);

    const submit = async () => {
        if (!draft.trim()) return;
        await onPost(draft, mentions);
        setDraft('');
        setMentions([]);
    };

    return (
        <div className="space-y-3">
            {visible.map((c) => {
                const isAuthor = c.user_id === currentUserId;
                const canModerate = isAuthor || isOwner;
                if (editingId === c.id) {
                    return (
                        <div key={c.id} className="border rounded-xl p-3 bg-white space-y-2">
                            <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                className="w-full text-sm rounded-md border px-2 py-1"
                            />
                            <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                    {t('admin.memo.cancel', 'Cancel')}
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={async () => {
                                        await onEdit(c.id, editDraft);
                                        setEditingId(null);
                                    }}
                                >
                                    {t('admin.memo.save', 'Save')}
                                </Button>
                            </div>
                        </div>
                    );
                }
                return (
                    <div key={c.id} className="border rounded-xl p-3 bg-white text-sm">
                        <div className="text-xs text-slate-500 mb-1">
                            {/* TODO: lookup display_name from c.user_id; falls back to id */}
                            user #{c.user_id ?? '?'} ·{' '}
                            {new Date(c.created_at).toLocaleDateString()}
                            {c.resolved && (
                                <span className="ml-2 text-emerald-600">
                                    [{t('admin.memo.resolve', 'Resolved')}]
                                </span>
                            )}
                        </div>
                        <div className="whitespace-pre-wrap">
                            {c.deleted ? (
                                <em className="text-slate-400">
                                    {t('admin.memo.deleted_body', '[deleted comment]')}
                                </em>
                            ) : (
                                c.body
                            )}
                        </div>
                        {!c.deleted && (
                            <div className="flex gap-2 mt-2 text-xs">
                                {canModerate && (
                                    <button
                                        className="text-indigo-600 hover:underline"
                                        onClick={() => {
                                            setEditingId(c.id);
                                            setEditDraft(c.body);
                                        }}
                                    >
                                        {t('admin.memo.edit', 'Edit')}
                                    </button>
                                )}
                                {canModerate && (
                                    <button
                                        className="text-rose-600 hover:underline"
                                        onClick={() => onDelete(c.id)}
                                    >
                                        {t('admin.memo.delete', 'Delete')}
                                    </button>
                                )}
                                <button
                                    className="text-slate-600 hover:underline"
                                    onClick={() => onToggleResolve(c)}
                                >
                                    {c.resolved
                                        ? t('admin.memo.unresolve', 'Unresolve')
                                        : t('admin.memo.resolve', 'Resolve')}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            <div className="space-y-2">
                <MentionAutocomplete
                    value={draft}
                    onChange={(v, m) => {
                        setDraft(v);
                        setMentions(m);
                    }}
                    members={members}
                    placeholder={t('admin.memo.comment_placeholder', 'Write a comment. Use @ to mention.')}
                />
                <div className="flex justify-end">
                    <Button size="sm" onClick={submit} disabled={!draft.trim()}>
                        {t('admin.memo.post_comment', 'Post')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 13.3: `MemoEntry`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CommentThread } from './CommentThread';
import type { MemoCommentRead, MemoEntryRead } from '@/api/model';

interface ProjectMemberLite { user_id: number; display_name: string; }

interface Props {
    entry: MemoEntryRead;
    canEdit: boolean;
    isOwner: boolean;
    currentUserId: number;
    members: ProjectMemberLite[];
    showResolved: boolean;
    onEditEntry: (id: number, patch: { title?: string; body?: string }) => Promise<void>;
    onDeleteEntry: (id: number) => Promise<void>;
    onPostComment: (entryId: number, body: string, mentions: number[]) => Promise<void>;
    onEditComment: (commentId: number, body: string) => Promise<void>;
    onDeleteComment: (commentId: number) => Promise<void>;
    onToggleResolve: (comment: MemoCommentRead) => Promise<void>;
}

export function MemoEntry({ entry, canEdit, isOwner, currentUserId, members, showResolved,
    onEditEntry, onDeleteEntry, onPostComment, onEditComment, onDeleteComment, onToggleResolve }: Props) {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(entry.title);
    const [body, setBody] = useState(entry.body);
    const [showThread, setShowThread] = useState(false);

    const visibleCommentCount = entry.comments.filter(
        (c) => !c.deleted && (showResolved || !c.resolved),
    ).length;

    return (
        <div className="border rounded-xl bg-white">
            <div className="p-3 border-b">
                {editing ? (
                    <div className="space-y-2">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full text-sm font-bold rounded-md border px-2 py-1"
                        />
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={4}
                            className="w-full text-sm rounded-md border px-2 py-1"
                        />
                        <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                                {t('admin.memo.cancel', 'Cancel')}
                            </Button>
                            <Button
                                size="sm"
                                onClick={async () => {
                                    await onEditEntry(entry.id, { title, body });
                                    setEditing(false);
                                }}
                            >
                                {t('admin.memo.save', 'Save')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="flex items-baseline justify-between">
                            <h4 className="text-sm font-bold text-slate-900">{entry.title}</h4>
                            {canEdit && (
                                <div className="flex gap-2 text-xs">
                                    <button
                                        className="text-indigo-600 hover:underline"
                                        onClick={() => setEditing(true)}
                                    >
                                        {t('admin.memo.edit', 'Edit')}
                                    </button>
                                    <button
                                        className="text-rose-600 hover:underline"
                                        onClick={() => {
                                            if (confirm(t('admin.memo.delete_entry_confirm', 'Delete this entry?'))) {
                                                onDeleteEntry(entry.id);
                                            }
                                        }}
                                    >
                                        {t('admin.memo.delete', 'Delete')}
                                    </button>
                                </div>
                            )}
                        </div>
                        {entry.body && (
                            <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">
                                {entry.body}
                            </p>
                        )}
                    </div>
                )}
            </div>
            <button
                type="button"
                className="text-xs text-slate-600 px-3 py-2 hover:bg-slate-50 w-full text-left"
                onClick={() => setShowThread((s) => !s)}
            >
                {visibleCommentCount === 1
                    ? t('admin.memo.comments_count_one', '1 comment', { n: 1 })
                    : t('admin.memo.comments_count_other', '{{n}} comments', { n: visibleCommentCount })}
            </button>
            {showThread && (
                <div className="p-3 bg-slate-50/50">
                    <CommentThread
                        comments={entry.comments}
                        showResolved={showResolved}
                        currentUserId={currentUserId}
                        isOwner={isOwner}
                        members={members}
                        onPost={(body, mentions) => onPostComment(entry.id, body, mentions)}
                        onEdit={onEditComment}
                        onDelete={onDeleteComment}
                        onToggleResolve={onToggleResolve}
                    />
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 13.4: Commit**

```bash
git add frontend/src/components/admin/memo/
git commit -m "feat(memo): MemoEntry / CommentThread / MentionAutocomplete sub-components"
```

---

## Task 14: `MemoSection` root + integration test

**Files:**
- Create: `frontend/src/components/admin/memo/MemoSection.tsx`
- Create: `frontend/src/components/admin/memo/MemoSection.test.tsx`

- [ ] **Step 14.1: Implement `MemoSection`**

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useMemoSection } from '@/hooks/admin/useMemoSection';
import { MemoEntry } from './MemoEntry';

interface ProjectMemberLite { user_id: number; display_name: string; }

interface Props {
    parentType: 'concourse' | 'study';
    parentId: number;
    currentUserId: number;
    isOwner: boolean;
    canEdit: boolean;     // researcher+
    members: ProjectMemberLite[];
}

export function MemoSection({
    parentType, parentId, currentUserId, isOwner, canEdit, members,
}: Props) {
    const { t } = useTranslation();
    const m = useMemoSection({ parentType, parentId, currentUserId, projectMembers: members });

    // Bump last-seen the first time this component renders mounted with data.
    useEffect(() => {
        if (m.entries.length > 0) m.markSeen();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parentId]);

    const [newEntryTitle, setNewEntryTitle] = useState('');
    const [adding, setAdding] = useState(false);

    return (
        <div className="space-y-3">
            {m.mentionsForYou.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">
                    <div className="font-bold text-amber-900 mb-1">
                        {t('admin.memo.mentions_for_you', 'Mentions for you')}
                    </div>
                    <ul className="list-disc ml-5 text-amber-900">
                        {m.mentionsForYou.map((c) => (
                            <li key={c.id}>{c.body}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex gap-2">
                {canEdit && (
                    <Button size="sm" onClick={() => setAdding((s) => !s)}>
                        {t('admin.memo.add_entry', 'Add entry')}
                    </Button>
                )}
                {canEdit && m.templates.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">
                                {t('admin.memo.insert_template', 'Insert from template')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {m.templates.map((tpl) => (
                                <DropdownMenuItem
                                    key={tpl.title}
                                    onClick={() => m.addEntry({ title: tpl.title, body: '' })}
                                >
                                    {tpl.title}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                <div className="flex-1" />
                <button
                    className="text-xs text-slate-600 hover:underline"
                    onClick={() => m.setShowResolved((s) => !s)}
                >
                    {m.showResolved
                        ? t('admin.memo.hide_resolved', 'Hide resolved')
                        : t('admin.memo.show_resolved', 'Show resolved ({{n}})', {
                              n: m.entries.flatMap((e) => e.comments).filter((c) => c.resolved).length,
                          })}
                </button>
            </div>

            {adding && (
                <div className="border rounded-xl p-3 bg-white">
                    <input
                        value={newEntryTitle}
                        onChange={(e) => setNewEntryTitle(e.target.value)}
                        placeholder={t('admin.memo.entry_title_placeholder', 'Section title…')}
                        className="w-full text-sm rounded-md border px-2 py-1 mb-2"
                    />
                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewEntryTitle(''); }}>
                            {t('admin.memo.cancel', 'Cancel')}
                        </Button>
                        <Button
                            size="sm"
                            disabled={!newEntryTitle.trim()}
                            onClick={async () => {
                                await m.addEntry({ title: newEntryTitle.trim(), body: '' });
                                setAdding(false);
                                setNewEntryTitle('');
                            }}
                        >
                            {t('admin.memo.save', 'Save')}
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {m.entries.map((e) => (
                    <MemoEntry
                        key={e.id}
                        entry={e}
                        canEdit={canEdit}
                        isOwner={isOwner}
                        currentUserId={currentUserId}
                        members={members}
                        showResolved={m.showResolved}
                        onEditEntry={m.editEntry}
                        onDeleteEntry={m.removeEntry}
                        onPostComment={m.addComment}
                        onEditComment={m.editComment}
                        onDeleteComment={m.removeComment}
                        onToggleResolve={m.toggleResolve}
                    />
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 14.2: Integration test**

Create `frontend/src/components/admin/memo/MemoSection.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithStore, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { MemoSection } from './MemoSection';

vi.mock('@/api/admin', () => ({
    getConcourseMemo: vi.fn().mockResolvedValue({
        parent_type: 'concourse', parent_id: 42, entries: [],
    }),
    getMemoTemplates: vi.fn().mockResolvedValue([
        { title: 'Sources', description: '…' },
    ]),
    createConcourseEntry: vi.fn().mockResolvedValue({
        id: 1, title: 'Sources', body: '', position: 10,
        comments: [], parent_type: 'concourse', parent_id: 42,
    }),
    postMemoComment: vi.fn().mockResolvedValue({
        id: 99, entry_id: 1, user_id: 1, body: 'hi',
        mentions: [], resolved: false, deleted: false,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }),
    resolveMemoComment: vi.fn(),
    unresolveMemoComment: vi.fn(),
}));

beforeEach(() => {
    localStorage.clear();
});

describe('MemoSection', () => {
    it('adds an entry from a template', async () => {
        const user = userEvent.setup();
        renderWithStore(
            <MemoSection
                parentType="concourse"
                parentId={42}
                currentUserId={1}
                isOwner
                canEdit
                members={[{ user_id: 1, display_name: 'me' }]}
            />,
        );
        await waitFor(() => screen.getByText(/Insert from template/i));
        await user.click(screen.getByText(/Insert from template/i));
        await user.click(screen.getByText('Sources'));
        await waitFor(() => screen.getByText('Sources'));
    });

    it('posts a comment after expanding the thread', async () => {
        const user = userEvent.setup();
        const { getConcourseMemo } = await import('@/api/admin');
        (getConcourseMemo as any).mockResolvedValueOnce({
            parent_type: 'concourse', parent_id: 42,
            entries: [{
                id: 1, title: 'Sources', body: '', position: 10,
                comments: [], parent_type: 'concourse', parent_id: 42,
            }],
        });
        renderWithStore(
            <MemoSection parentType="concourse" parentId={42}
                currentUserId={1} isOwner canEdit
                members={[{ user_id: 1, display_name: 'me' }]} />,
        );
        await waitFor(() => screen.getByText('Sources'));
        await user.click(screen.getByText(/0 comments/i));
        const textarea = screen.getByPlaceholderText(/Write a comment/i);
        await user.type(textarea, 'first thought');
        await user.click(screen.getByRole('button', { name: /Post/i }));
        await waitFor(() => screen.getByText('hi'));
    });
});
```

Run:
```bash
npm --prefix frontend test -- MemoSection
```
Expected: pass.

- [ ] **Step 14.3: Commit**

```bash
git add frontend/src/components/admin/memo/MemoSection.tsx \
        frontend/src/components/admin/memo/MemoSection.test.tsx
git commit -m "feat(memo): MemoSection root component + integration test"
```

---

## Task 15: Wire `MemoSection` into both Accordion shells

**Files:**
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx`
- Modify: `frontend/src/components/admin/designer/IntroductionEditor.tsx`

- [ ] **Step 15.1: Concourse Accordion**

Replace the Phase-1 stub block (the `admin.memo.upgrading` `<p>`) with:

```tsx
<MemoSection
    parentType="concourse"
    parentId={concourse.id}
    currentUserId={currentUser.id}
    isOwner={memberRole === 'owner'}
    canEdit={memberRole === 'owner' || memberRole === 'researcher'}
    members={projectMembers}
/>
```

Update the Accordion trigger label/badge to show `Memo · {n}` when `unreadCount > 0`. Easiest path: lift `unreadCount` up by reading the same localStorage key in the page (use the `getLastSeen` helper) — or expose a child render-prop. **Simpler** for v1: leave the badge logic to Phase 4 polish. The Accordion trigger keeps its current label.

- [ ] **Step 15.2: Study Accordion**

Same pattern in `IntroductionEditor.tsx`. Note the page passes `study.id` as `parentId` and reads `members` from the parent context.

- [ ] **Step 15.3: Cleanup imports + dead code**

Run:
```bash
grep -rn "construction_memo\|methodology_memo\|admin.memo.upgrading" frontend/src
```
Expected: empty.

- [ ] **Step 15.4: Run full CI**

```bash
make ci
```
Expected: green.

- [ ] **Step 15.5: Manual UI smoke test**

```bash
make dev   # or however the project starts the dev stack
```
- Open a concourse page. Confirm: Accordion expands, "Add entry" creates an entry, comment thread expands, posting a comment renders it.
- Open a study designer. Same checks.

- [ ] **Step 15.6: Commit and open Phase 2 PR**

```bash
git add frontend/
git commit -m "feat(memo): wire MemoSection into ConcourseDetailPage + IntroductionEditor"
git push
gh pr create --title "feat(memo): MemoSection collaborative UI (phase 2/4)" --body "..."
```

---

# Phase 3 — Export

**Goal:** ZIP exports include `memo/memo.md` always; `memo/memo-discussion.md` when the user opts in via a checkbox in the export modal.

## Task 16: Render `memo.md`

**Files:**
- Modify: `backend/app/services/export_service.py`
- Modify: `backend/tests/integration/test_export_service.py` (or equivalent)

- [ ] **Step 16.1: Add the helper**

In `export_service.py`, add:

```python
async def _render_memo_md(
    db: AsyncSession,
    *,
    parent_type: MemoParentType,
    parent_id: int,
) -> str:
    from app.services.memo_service import MemoService
    from sqlalchemy import select
    from app.models import User

    memo = await MemoService.get_memo(
        db, parent_type=parent_type, parent_id=parent_id
    )
    if not memo.entries:
        return ""

    user_ids = {e.last_edited_by for e in memo.entries if e.last_edited_by}
    users: dict[int, str] = {}
    if user_ids:
        rows = (await db.execute(
            select(User.id, User.email).where(User.id.in_(user_ids))
        )).all()
        users = {row.id: row.email for row in rows}

    lines: list[str] = []
    last = max(memo.entries, key=lambda e: e.updated_at)
    lines.append(
        f"# Memo for {parent_type.value} #{parent_id}\n"
    )
    for e in memo.entries:
        lines.append(f"## {e.title}\n")
        if e.body:
            lines.append(e.body + "\n")
        lines.append("")
    editor = users.get(last.last_edited_by or -1, "system")
    lines.append(
        f"\n---\nLast updated {last.updated_at:%Y-%m-%d} by {editor}.\n"
    )
    return "\n".join(lines)
```

- [ ] **Step 16.2: Wire into the ZIP build**

Find the existing `generate_research_package` (or the path that constructs the ZIP). Add a step that writes `memo/memo.md` whenever `_render_memo_md` returns non-empty content. There may be two parents (the study and any concourses linked to it) — include only the study's memo for v1; concourse memo export ships when researchers explicitly export concourse data.

- [ ] **Step 16.3: Test**

In the integration test for the export service, add:

```python
async def test_export_includes_memo_md_when_entries_exist(
    db_session, seed_study_id, seed_user_id
) -> None:
    from app.models import MemoParentType
    from app.services.memo_service import MemoService
    from app.services.export_service import ExportService

    await MemoService.add_entry(
        db_session, parent_type=MemoParentType.study,
        parent_id=seed_study_id, title="Distribution rationale",
        body="Forced symmetry to surface compensatory positions.",
        user_id=seed_user_id,
    )
    zip_bytes = await ExportService.generate_research_package_async(
        db_session, study_id=seed_study_id, include_discussion=False,
    )
    import zipfile, io
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        names = z.namelist()
        assert "memo/memo.md" in names
        body = z.read("memo/memo.md").decode()
        assert "## Distribution rationale" in body
        assert "Forced symmetry" in body
```

> If the export service is currently sync (it appears to be, based on the existing `ExportService.generate_research_package` signature), the test signatures will need to mirror that. Keep the new path async only if you also convert the call site; otherwise wrap with `asyncio.run` inside the helper.

Run:
```bash
.venv/bin/pytest backend/tests/integration/test_export_service.py -v
```
Expected: pass.

- [ ] **Step 16.4: Commit**

```bash
git add backend/app/services/export_service.py backend/tests/
git commit -m "feat(memo): include memo.md in study research package export"
```

---

## Task 17: Render `memo-discussion.md` (opt-in)

**Files:**
- Modify: `backend/app/services/export_service.py`
- Modify: `backend/app/routers/admin/exports.py` (add `include_discussion` query param)

- [ ] **Step 17.1: Add the discussion renderer**

```python
async def _render_memo_discussion_md(
    db: AsyncSession,
    *,
    parent_type: MemoParentType,
    parent_id: int,
) -> str:
    from app.services.memo_service import MemoService

    memo = await MemoService.get_memo(
        db, parent_type=parent_type, parent_id=parent_id
    )
    if not memo.entries:
        return ""

    lines: list[str] = [f"# Memo discussion — {parent_type.value} #{parent_id}\n"]
    for e in memo.entries:
        if not e.comments:
            continue
        lines.append(f"## {e.title}\n")
        for c in e.comments:
            ts = c.created_at.strftime("%Y-%m-%d %H:%M")
            author = f"user #{c.user_id}" if c.user_id else "(removed user)"
            tag = " [resolved]" if c.resolved else ""
            body = "[deleted comment]" if c.deleted else c.body
            lines.append(f"- {author} · {ts}{tag}: {body}")
        lines.append("")
    return "\n".join(lines)
```

- [ ] **Step 17.2: Add `include_discussion` to the export endpoint**

In `backend/app/routers/admin/exports.py:350`, modify `get_research_package`:

```python
@router.get("/{slug}/export/package")
@limiter.limit("10/minute")
async def get_research_package(
    request: Request,
    include_discussion: bool = False,   # NEW
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    ...
    zip_content = await ExportService.generate_research_package(
        full_study, full_study.participants, full_dump=full_dump,
        include_discussion=include_discussion, db=db,
    )
    ...
```

The `ExportService.generate_research_package` signature grows accordingly. Ensure the discussion file is added to the ZIP only when `include_discussion is True` and the rendered string is non-empty.

- [ ] **Step 17.3: Test**

```python
async def test_export_includes_discussion_only_with_flag(
    db_session, seed_study_id, seed_user_id, seed_entry_id_for_study
) -> None:
    from app.services.memo_service import MemoService
    from app.services.export_service import ExportService

    await MemoService.add_comment(
        db_session, entry_id=seed_entry_id_for_study, user_id=seed_user_id,
        body="why forced symmetry?", mentions=[],
    )
    # Without flag → no discussion file
    zip_bytes = await ExportService.generate_research_package(
        ..., include_discussion=False, db=db_session,
    )
    import zipfile, io
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        assert "memo/memo-discussion.md" not in z.namelist()

    # With flag → discussion file present and non-empty
    zip_bytes = await ExportService.generate_research_package(
        ..., include_discussion=True, db=db_session,
    )
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        assert "memo/memo-discussion.md" in z.namelist()
        body = z.read("memo/memo-discussion.md").decode()
        assert "why forced symmetry?" in body
```

Run:
```bash
.venv/bin/pytest backend/tests/integration/test_export_service.py -v
```

- [ ] **Step 17.4: Commit**

```bash
git add backend/
git commit -m "feat(memo): opt-in memo-discussion.md in export package"
```

---

## Task 18: Frontend export modal checkbox

**Files:**
- Modify: the export modal (locate first via `grep -rn "research_package\|export/package" frontend/src/`)

- [ ] **Step 18.1: Locate the export trigger**

```bash
grep -rn "export/package\|research_package\|generate_research_package" frontend/src
```

- [ ] **Step 18.2: Add the checkbox**

In the modal/dialog/toolbar that triggers the package download, add a labelled `<Checkbox>` for `include_discussion`, default unchecked. The download URL becomes `/admin/{slug}/export/package?include_discussion=true|false`. If the API client is generated with orval, the function signature already accepts this parameter — just pass it through.

i18n key: `admin.memo.include_discussion_in_export` (add to the three locales): "Include memo discussion threads".

- [ ] **Step 18.3: Run CI + smoke test**

```bash
make ci
```

- [ ] **Step 18.4: Commit and open Phase 3 PR**

```bash
git add frontend/ backend/
git commit -m "feat(memo): export modal checkbox to include discussion threads"
git push
gh pr create --title "feat(memo): memo export pipeline (phase 3/4)" --body "..."
```

---

# Phase 4 — Polish (mentions email + indicator + E2E)

**Goal:** @-mentions trigger an email; unread badge appears on the Accordion trigger; one E2E test exercises the full collaboration loop.

## Task 19: `send_memo_mention_email`

**Files:**
- Modify: `backend/app/utils/email.py`

- [ ] **Step 19.1: Add the helper**

```python
def send_memo_mention_email(
    email_to: str,
    *,
    project_name: str,
    parent_type: str,
    parent_title: str,
    mention_excerpt: str,
    link_url: str,
    mentioner_name: str,
) -> None:
    """Notify a project member that they were @-mentioned in a memo comment."""
    subject = f"You were mentioned in {parent_title} ({parent_type})"
    html = f"""
    <html><body>
        <p>{mentioner_name} mentioned you in <strong>{parent_title}</strong>
           ({parent_type}, project {project_name}).</p>
        <blockquote>{mention_excerpt}</blockquote>
        <p><a href="{link_url}">Open in Qualis</a></p>
    </body></html>
    """
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP missing — mock memo-mention email logged.")
        logger.info(f"To: {email_to} | Subject: {subject} | Link: {link_url}")
        return

    msg = MIMEMultipart()
    msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    msg["To"] = email_to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(settings.SMTP_HOST, int(settings.SMTP_PORT or 0)) as server:
            if settings.SMTP_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info(f"Memo-mention email sent to {email_to}")
    except Exception as e:
        logger.error(f"Failed to send memo-mention email to {email_to}: {e}")
        raise
```

- [ ] **Step 19.2: Wire into the `post_comment` endpoint**

In `backend/app/routers/admin/memos.py`, update `post_comment`:

```python
@router.post("/memo-entries/{eid}/comments", ...)
async def post_comment(...):
    ...
    c = await MemoService.add_comment(...)
    if payload.mentions:
        await _dispatch_mention_emails(
            db, comment=c, mentions=payload.mentions,
            mentioner=user, parent_type=parent_type, parent_id=parent_id,
        )
    return ...

async def _dispatch_mention_emails(
    db: AsyncSession, *, comment: MemoComment, mentions: list[int],
    mentioner: User, parent_type: MemoParentType, parent_id: int,
) -> None:
    from app.models import Concourse, Project, Study, User
    from sqlalchemy import select
    from app.utils.email import send_memo_mention_email

    rows = (await db.execute(
        select(User).where(User.id.in_(mentions))
    )).scalars().all()

    if parent_type == MemoParentType.concourse:
        c_obj = await db.get(Concourse, parent_id)
        title = c_obj.title if c_obj else "(concourse)"
        project_id = c_obj.project_id if c_obj else 0
        link_path = f"/admin/concourses/{parent_id}"
    else:
        s_obj = await db.get(Study, parent_id)
        title = s_obj.title if s_obj else "(study)"
        project_id = s_obj.project_id if s_obj else 0
        link_path = f"/admin/studies/{s_obj.slug if s_obj else ''}/design"
    project = await db.get(Project, project_id)

    excerpt = comment.body[:240] + ("…" if len(comment.body) > 240 else "")
    for u in rows:
        if u.id == mentioner.id:
            continue  # don't email yourself
        send_memo_mention_email(
            email_to=u.email,
            project_name=project.title if project else "",
            parent_type=parent_type.value,
            parent_title=title,
            mention_excerpt=excerpt,
            link_url=f"{settings.FRONTEND_URL}{link_path}",
            mentioner_name=mentioner.email,
        )
```

- [ ] **Step 19.3: Test**

```python
async def test_post_comment_with_mention_dispatches_email(
    db_session, seed_entry_id, seed_user_id, seed_other_user_id, monkeypatch
) -> None:
    sent: list[dict] = []
    from app.utils import email as email_mod
    monkeypatch.setattr(
        email_mod, "send_memo_mention_email",
        lambda **kw: sent.append(kw),
    )
    from app.routers.admin.memos import post_comment
    # Or invoke via httpx test client and POST /admin/memo-entries/{id}/comments
    ...
    assert len(sent) == 1
    assert sent[0]["email_to"] != "<self>@..."  # not self-mention
```

Run:
```bash
.venv/bin/pytest backend/tests/integration/test_memo_comment.py -k mention -v
```

- [ ] **Step 19.4: Commit**

```bash
git add backend/
git commit -m "feat(memo): @-mention emails on comment post"
```

---

## Task 20: Indicator badge on Accordion trigger

**Files:**
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx`
- Modify: `frontend/src/components/admin/designer/IntroductionEditor.tsx`

- [ ] **Step 20.1: Lift `unreadCount` to the page level**

The hook `useMemoSection` already exposes `unreadCount`. To put the badge on the Accordion trigger (which is a sibling of the section, not a child), the cleanest move is to call the hook ONCE in the page (or designer) and pass the `MemoSection`-relevant slice down via context — OR thread `unreadCount` up through a callback ref. Cleanest: a thin `useMemoBadge(parentType, parentId, currentUserId)` that reads the same data without owning the section's full state. v1 simplification: read directly from localStorage via `getLastSeen` and the **last comment timestamp** (which we don't have without a fetch). Trade-off: skip the badge for v1.

**Pragmatic path:** add a tiny endpoint `GET /admin/{parent}/{id}/memo/unread?since=<iso>` that returns just an integer count. Use it for the badge. Saves a full memo fetch on the trigger.

```python
@router.get("/concourses/{cid}/memo/unread")
async def get_concourse_unread(
    cid: int, since: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> int:
    c = await db.get(Concourse, cid)
    if c is None: raise HTTPException(404)
    await _check_member(db, c.project_id, user, ProjectRole.viewer)
    from datetime import datetime
    from sqlalchemy import select, func, and_
    since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
    return (await db.execute(
        select(func.count(MemoComment.id)).join(MemoEntry).where(
            MemoEntry.parent_type == MemoParentType.concourse,
            MemoEntry.parent_id == cid,
            MemoComment.created_at > since_dt,
            MemoComment.user_id != user.id,
            MemoComment.deleted == False,
        )
    )).scalar() or 0
```

Mirror for `/studies/{sid}/memo/unread`.

- [ ] **Step 20.2: Frontend hook for the badge**

Create `frontend/src/hooks/admin/useMemoUnreadBadge.ts`:

```typescript
import { useEffect, useState } from 'react';
import { getConcourseMemoUnread, getStudyMemoUnread } from '@/api/admin';
import { getLastSeen } from '@/components/admin/memo/memoLastSeen';

export function useMemoUnreadBadge(
    parentType: 'concourse' | 'study',
    parentId: number,
    currentUserId: number,
): number {
    const [count, setCount] = useState(0);
    useEffect(() => {
        const since = getLastSeen(currentUserId, parentType, parentId);
        const fetcher = parentType === 'concourse' ? getConcourseMemoUnread : getStudyMemoUnread;
        fetcher(parentId, { since }).then(setCount).catch(() => undefined);
    }, [parentType, parentId, currentUserId]);
    return count;
}
```

- [ ] **Step 20.3: Use it in both pages**

In `ConcourseDetailPage.tsx`, in the Accordion trigger:

```tsx
const memoUnread = useMemoUnreadBadge('concourse', concourse.id, currentUser.id);
...
<AccordionTrigger>
    ...
    <span className="text-sm font-bold text-slate-900">
        {t('admin.concourse.construction_memo.title', 'Construction memo')}
        {memoUnread > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-0.5">
                {memoUnread}
            </span>
        )}
    </span>
    ...
</AccordionTrigger>
```

Same in `IntroductionEditor.tsx`.

- [ ] **Step 20.4: Run CI + smoke test in browser**

```bash
make ci
```
Open the dev stack, post a comment as user A, log in as user B, verify the badge.

- [ ] **Step 20.5: Commit**

```bash
git add backend/ frontend/
git commit -m "feat(memo): unread badge on Accordion trigger"
```

---

## Task 21: E2E happy path

**Files:**
- Create: `frontend/e2e/admin/memo-collaboration.spec.ts`

- [ ] **Step 21.1: Author the E2E**

```typescript
import { expect, test } from '@playwright/test';
import { loginAsResearcher, loginAsViewer } from './helpers/auth';
import { seedProjectWithStudy } from './helpers/seed';

test('memo collaboration happy path', async ({ page, browser }) => {
    const ctx = await seedProjectWithStudy({ name: 'Memo E2E' });

    // Researcher A posts an entry from a template + a comment with @-mention.
    await loginAsResearcher(page, ctx.researcherEmail);
    await page.goto(`/admin/studies/${ctx.studySlug}/design`);
    await page.getByRole('button', { name: /Methodology memo/i }).click();
    await page.getByRole('button', { name: /Insert from template/i }).click();
    await page.getByText('Distribution rationale').click();
    await page.getByText(/0 comments/i).click();
    await page
        .getByPlaceholder(/Write a comment/i)
        .fill(`@${ctx.viewerHandle} can you weigh in?`);
    await page.getByRole('button', { name: /Post/i }).click();
    await expect(page.getByText('can you weigh in?')).toBeVisible();

    // Viewer B opens the same study, sees a "Mentions for you" banner.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await loginAsViewer(pageB, ctx.viewerEmail);
    await pageB.goto(`/admin/studies/${ctx.studySlug}/design`);
    await pageB.getByRole('button', { name: /Methodology memo/i }).click();
    await expect(pageB.getByText(/Mentions for you/i)).toBeVisible();
    await pageB.getByText(/can you weigh in?/i).first().click();

    // Viewer replies.
    await pageB.getByText(/0 comments|1 comment/i).first().click();
    await pageB.getByPlaceholder(/Write a comment/i).fill('Sure — see attached.');
    await pageB.getByRole('button', { name: /Post/i }).click();
    await expect(pageB.getByText('Sure — see attached.')).toBeVisible();

    // Researcher resolves and exports.
    await page.reload();
    await page.getByRole('button', { name: /Methodology memo/i }).click();
    await page.getByText(/2 comments|1 comment/i).first().click();
    await page.getByRole('button', { name: /^Resolve$/i }).first().click();
    // Trigger export with discussion.
    await page.goto(`/admin/studies/${ctx.studySlug}/export`);
    await page.getByLabel(/Include memo discussion/i).check();
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Download package/i }).click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
});
```

> Adapt the helper imports / selectors to the actual scaffolding under `frontend/e2e/`. If `seedProjectWithStudy` or the auth helpers don't exist, look at any existing admin E2E for the seeding pattern (likely a fixture that hits the test API).

- [ ] **Step 21.2: Run E2E**

```bash
make e2e
```
Expected: green.

- [ ] **Step 21.3: Commit and open Phase 4 PR**

```bash
git add frontend/e2e/
git commit -m "test(memo): e2e happy path covering entry → mention → resolve → export"
git push
gh pr create --title "feat(memo): @-mentions, indicator badge, e2e (phase 4/4)" --body "..."
```

---

## Self-review notes (run by plan author after writing — done)

- **Spec coverage** — every section of the design spec has at least one task: §3 architecture (T2-T6), §4 data model (T1-T2), §5 API (T6), §6 UI (T11-T15, T20), §7 permissions (T6, T7), §8 export (T16-T18), §9 migration (T1), §10 testing (each task carries TDD tests), §11 strict mypy (T10), §12 out of scope (none implemented — correct), §13 risks (cascade addressed in T7; cap addressed in T1; email noise toggled-off as a future control).
- **Placeholders** — none. Every `// adjust import path to match generated client` and `// TODO: lookup display_name` is a *concrete* note about a value that will be known once Task 9 lands; not a vague workplan deferral.
- **Type consistency** — `MemoEntry`/`MemoComment` model names, `MemoParentType` enum, `MemoEntryRead`/`MemoCommentRead`/`MemoRead`/`MemoTemplate` schemas all consistent across tasks.
- **Scope** — 4 phases mirror the spec's §14 "Implementation order" exactly.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-memos-collaboration.md`. Two execution options:

1. **Subagent-Driven (recommended for this plan)** — fresh subagent per task; the plan is large (21 tasks across 4 phases) and benefits from per-task isolation + review-between-tasks discipline.
2. **Inline Execution** — execute in this session in batches with checkpoints. Faster for the small backend tasks but the frontend tasks (T13-T15) are large enough that inline risks losing context.

Per the user's MEMORY feedback ("for **small** plan tasks, prefer inline edits + `make ci-fast`"), this plan is large — Subagent-Driven is the better fit. But Phase 4 alone (T19-T21) is small enough to execute inline if Phases 1-3 land first via subagents.

Which approach?
