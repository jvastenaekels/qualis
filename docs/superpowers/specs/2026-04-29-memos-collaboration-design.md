# Memos with collaboration — design

**Status:** approved (brainstorm), ready for implementation plan
**Date:** 2026-04-29
**Scope:** qualis admin

## 1. Problem

`concourses.construction_memo` (added 2026-04-26) and `studies.methodology_memo` (added 2026-04-28) are nullable free-text columns intended to surface **how** a concourse was curated and **why** a study's distribution / conditions of instruction were chosen — the reflexive infrastructure a critical-Q platform needs (Sneegas 2020; Watts & Stenner 2012).

Today the implementation does not deliver that intent:

- **Not exported.** Neither memo appears in `export_service.py` or `study_data_service.py`. Researchers cannot ship the rationale alongside the data for OSF / pre-registration / replication packages — the stated motivation in both migrations.
- **No read-only surface.** The memos are visible only inside their respective edit forms (Accordion in `ConcourseDetailPage`, Accordion in `IntroductionEditor`). A co-investigator opening the study from the dashboard never sees them.
- **No collaboration.** The fields are a single editable blob. When teams need to discuss a curatorial choice ("should we include syndicalist voices?"), they fall back to Google Doc / Notion / Slack. The reflexive trace then lives outside the platform.
- **Asymmetric quality.** `construction_memo` has a 10 000-char cap, save button with dirty-state tracking, and three integration tests. `methodology_memo` has no cap, no dedicated save UX, no backend round-trip tests (whitelisted in `vulture_whitelist.py`).

## 2. Goals

1. The memo content can travel with the exported study/concourse so it actually serves replication / pre-registration.
2. A research team can hold its delibrations on curatorial and methodological choices **inside qualis**, with no need for an external shared document.
3. The feature stays in the second plan: discoverable when relevant, invisible when not. Progressive disclosure.
4. Symmetric infrastructure across the two memo types: same data model, same UX, same test coverage.

Non-goals: replacing a full-fledged collaborative document editor (Google Docs feature parity), full version history of edits, search across memos, memos on other objects (participants, factors, analysis runs).

## 3. Architecture

A single `Memo` subsystem polymorphic over `parent_type ∈ {concourse, study}`. Two new tables, two new admin routers, one shared frontend module.

The system has three layers:

- **Entries** — short structured sections (title + body) ordered within a memo. Replace the previous free-text blob. Each entry carries one thread of comments.
- **Comments** — chronological, flat (no nested replies), per-entry. Soft-deletable. Resolvable.
- **Templates** — predefined entry titles per `parent_type`, surfaced as a "Insert from template" dropdown. The user can ignore them entirely (the system stays free-form).

## 4. Data model

### 4.1 New tables

```
memo_entries
  id              SERIAL PRIMARY KEY
  parent_type     ENUM('concourse', 'study')      NOT NULL
  parent_id       INTEGER                          NOT NULL
  title           VARCHAR(200)                     NOT NULL
  body            VARCHAR(10000)                   NOT NULL DEFAULT ''
  position        INTEGER                          NOT NULL DEFAULT 0
  created_at      TIMESTAMPTZ                      NOT NULL DEFAULT now()
  updated_at      TIMESTAMPTZ                      NOT NULL DEFAULT now()
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL
  last_edited_by  INTEGER REFERENCES users(id) ON DELETE SET NULL

  INDEX (parent_type, parent_id, position)
```

Rationale for `parent_type` + `parent_id` (polymorphic) rather than two FK columns: the two memos behave identically; the only differences (templates, surface location) are presentation-layer. A single table avoids duplicating router/service code.

```
memo_comments
  id           SERIAL PRIMARY KEY
  entry_id     INTEGER REFERENCES memo_entries(id) ON DELETE CASCADE  NOT NULL
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL
  body         VARCHAR(2000)                                          NOT NULL
  resolved     BOOLEAN                                                NOT NULL DEFAULT false
  resolved_at  TIMESTAMPTZ
  resolved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
  deleted      BOOLEAN                                                NOT NULL DEFAULT false
  created_at   TIMESTAMPTZ                                            NOT NULL DEFAULT now()
  updated_at   TIMESTAMPTZ                                            NOT NULL DEFAULT now()

  INDEX (entry_id, created_at)
```

`deleted = true` keeps the row but blanks the body in the response (`[deleted comment]`); preserves thread continuity and audit trail.

### 4.2 Removed columns

`concourses.construction_memo` and `studies.methodology_memo` are dropped by the same migration that introduces `memo_entries` and `memo_comments`. The migration data-step:

For each row of `concourses` (resp. `studies`) where the memo column is non-empty after `TRIM`:
```
INSERT INTO memo_entries
  (parent_type, parent_id, title, body, position, created_by, last_edited_by)
VALUES
  ('concourse', concourses.id, 'Notes', concourses.construction_memo, 0, NULL, NULL)
```
Then drop the column. `created_by = NULL` marks the entry as system-migrated.

The `vulture_whitelist.py` entry for `methodology_memo` is removed in the same PR.

### 4.3 Templates (static)

Hard-coded in `app/services/memo_service.py` (no DB):

- `concourse`: `["Sources canvassed", "Voices retained", "Voices excluded", "Sampling rationale", "Version notes"]`
- `study`: `["Distribution rationale", "Conditions of instruction", "Q-set size", "Pre/post-sort design choices", "Limitations"]`

The literature citations (Sneegas 2020 / Watts & Stenner 2012) currently inlined in the IntroductionEditor help text move into per-template `description` strings exposed via the templates endpoint, so the help is contextual (per slot) rather than blanket.

## 5. API

All endpoints under `/admin/`. Authentication via existing JWT; project-membership check via existing dependency `require_project_member`.

```
GET    /admin/concourses/{cid}/memo
GET    /admin/studies/{sid}/memo
       → MemoRead { entries: [MemoEntryRead { …, comments: [MemoCommentRead] }] }

POST   /admin/concourses/{cid}/memo/entries
POST   /admin/studies/{sid}/memo/entries
       body: { title, body?, position? }   (researcher+)

PATCH  /admin/memo-entries/{eid}           (researcher+)
       body: partial { title?, body?, position? }
DELETE /admin/memo-entries/{eid}           (researcher+; cascades to comments)

POST   /admin/memo-entries/{eid}/comments  (any project member)
       body: { body, mentions: [user_id] }
PATCH  /admin/memo-comments/{cid}          (author only; or owner for moderation)
       body: { body }
DELETE /admin/memo-comments/{cid}          (author or owner; soft delete)

POST   /admin/memo-comments/{cid}/resolve  (entry author or owner)
POST   /admin/memo-comments/{cid}/unresolve

GET    /admin/memo/templates?parent_type=concourse|study
       → [{ title, description }]
```

`mentions` is a list of `user_id`. Server validates each user is a project member; rejects otherwise. Each valid mention triggers an in-app notification (new table `notifications` if not present — out of scope check at plan time) and a templated email via `app.utils.email`.

OpenAPI is regenerated via `make generate-api` after the schemas land.

## 6. UI / UX

### 6.1 Surface

- **Concourse**: replace the existing `construction_memo` Accordion in `ConcourseDetailPage.tsx` with a `<MemoSection parentType="concourse" parentId={cid} />` component. Same Accordion shell (collapsed when populated, expanded when empty).
- **Study**: replace the existing `methodology_memo` AccordionItem in `IntroductionEditor.tsx` with `<MemoSection parentType="study" parentId={sid} />` rendered inside the same Accordion shell.

The trigger label keeps the existing wording ("Construction memo", "Methodology memo"). When unread content exists, append a small badge: `Memo · 3` (3 = number of unread items in scope, see §6.3).

### 6.2 Content layout

When expanded, the section renders:

```
[+ Add entry]   [Insert from template ▾]

┌─ Sources canvassed ────────────────────────────┐
│ <body markdown rendered, click-to-edit>        │
│                                                │
│ ▸ Comments (2)         [Show resolved (1)]     │
│   ├─ @julien · 2d ago                          │
│   │  We exclude editorials.                    │
│   │  [Resolve]                                 │
│   └─ @marie · 1d ago                           │
│      But peer-reviewed letters?                │
│      [Edit] [Delete]                           │
│   [Comment box with @-mention autocomplete]    │
└────────────────────────────────────────────────┘

┌─ Voices excluded ─────────────────────────────┐
│ …                                              │
└────────────────────────────────────────────────┘

[+ Add entry]
```

Reordering by drag handle on the entry's left margin (reuse `dnd-kit` already used elsewhere in the codebase). `position` updates batch-fired on drop.

### 6.3 Indicator semantics

A server-side "user-state" table (`memo_reads`) is **not** introduced (out of scope). Instead, the unread count is computed client-side: the count of comments whose `created_at` is later than a `last_seen_at` timestamp held in `localStorage` and keyed by `(user_id, parent_type, parent_id)`. The timestamp is bumped to `now()` whenever the user expands the section. Imperfect across devices, but proportional to the second-plan goal — and the @-mention path covers the cases that actually matter.

### 6.4 Hook architecture

Per the project's hook-driven component convention (CLAUDE.md, item G), `<MemoSection>` delegates to `useMemoSection(parentType, parentId)`. The hook owns: data fetch, optimistic mutations, mention resolution, unread-count derivation. The component renders JSX from the hook's return value. A unit test `useMemoSection.test.ts` covers ≥5 pure logic paths without rendering. An integration test renders one full thread interaction.

### 6.5 i18n

All new strings under `admin.memo.*` in `en/fr/fi`. The pre-existing `admin.concourse.construction_memo.*` and `admin.design.methodology_memo.*` keys are removed.

## 7. Permissions

| Action | owner | researcher | viewer |
|---|---|---|---|
| Read entries + comments | yes | yes | yes |
| Create / edit / delete / reorder entries | yes | yes | no |
| Post / edit own comment | yes | yes | yes |
| Edit / delete others' comments | yes (moderation) | no | no |
| Resolve a thread | yes | yes (if entry author) | no |
| @-mention | yes | yes | yes |

Viewer comment-write is intentional: it lets external advisors / ethics reviewers contribute without granting study edit rights.

Soft-deleted comments are visible (as `[deleted]`) to all readers; only the author or an owner can re-delete (idempotent) — there is no "undelete".

## 8. Export

The export ZIP gets a new top-level directory `memo/` containing:

- `memo.md` (always present): for each entry, in `position` order:
  ```
  ## <title>

  <body>
  ```
  Footer: `Last updated YYYY-MM-DD by <user.email or "system">`.
- `memo-discussion.md` (only when the export modal's `Include discussion threads` checkbox is checked, default off):
  ```
  ## <entry title>

  - <author> · <date>: <body>     [resolved]
  - <author> · <date>: [deleted comment]
  - <author> · <date>: <body>
  ```

`export_service.py` gets a new `_render_memo_md()` helper. The discussion flag is plumbed through `ExportRequest` schema. The frontend modal grows one checkbox.

## 9. Migration

One Alembic migration:

1. `CREATE TABLE memo_entries`, `CREATE TABLE memo_comments` (with all indexes).
2. Data step (raw SQL, both tables in one statement per parent type):
   ```sql
   INSERT INTO memo_entries (parent_type, parent_id, title, body, position)
   SELECT 'concourse', id, 'Notes', construction_memo, 0
   FROM concourses WHERE TRIM(COALESCE(construction_memo, '')) <> '';
   ```
   Same for studies/methodology_memo.
3. `ALTER TABLE concourses DROP COLUMN construction_memo`.
4. `ALTER TABLE studies DROP COLUMN methodology_memo`.

`downgrade()` re-creates the columns (`String, nullable=True`) and writes the body of the entry titled `'Notes'` (per `parent_id`, position 0) back into them; entries are then dropped. Data created post-upgrade in entries other than `'Notes'` is lost on downgrade; the migration docstring states this explicitly.

PostgreSQL DDL is transactional, per CLAUDE.md note — a failed step rolls back the whole migration.

## 10. Testing

### 10.1 Backend (pytest)

- `test_memo_entry.py`: create / update / delete / reorder; max-length boundaries (200 title, 10000 body); permission matrix by role.
- `test_memo_comment.py`: post / edit own / try-edit-others-fails / soft-delete / resolve / unresolve; permission matrix.
- `test_memo_migration.py`: spin up an ephemeral DB at the previous migration head, seed concourses/studies with non-empty memos and empty memos, run upgrade, assert entries exist with expected content; run downgrade, assert columns repopulated.
- `test_export_service.py`: existing test grows two cases — export without flag (no `memo-discussion.md`), export with flag (file present, deleted comments rendered as `[deleted comment]`, resolved threads tagged `[resolved]`).
- `test_mentions.py`: posting a comment with `mentions=[user_id]` triggers an email send (assert `app.utils.email.send` mocked); non-member mention → 400.

### 10.2 Frontend (Vitest)

- `useMemoSection.test.ts`: ≥5 pure paths — fetch, optimistic add entry, optimistic add comment, mention resolution against project members, unread-count derivation from localStorage timestamp.
- `MemoSection.test.tsx`: integration — render section, expand entry, post comment, edit it, resolve it, toggle "Show resolved".

### 10.3 E2E (Playwright)

One happy-path test: open a study as researcher, add entry from template, add comment, log in as second user, post `@-mention` reply, log back as first user, see the badge, resolve thread, export with flag, assert `memo.md` and `memo-discussion.md` are in the ZIP.

## 11. Strict-typed module candidates

Per CLAUDE.md, leaf utility/service modules opt into the project's strict mypy bar. New modules should land strict on day one:

- `app.services.memo_service` — full strict (no JSON columns, no Pydantic stubs leaking)
- `app.routers.admin.memos` — strict-without-`disallow_any_explicit` (Pydantic models in router)
- `app.schemas.memos` — strict-without-`disallow_any_explicit` (BaseModel)
- `app.models.memo` — relaxed tier (covered by the existing `app.models` package override)

## 12. Out of scope (explicit)

- Per-entry version history (cloning `ConcourseItemVersion` pattern). Future PR if researchers ask.
- Nested comment replies. Flat threads only.
- Full-text search across memos.
- Memos on other parent types (participant, factor, analysis run, project).
- Dashboard-level "What's new for me" aggregator. Indicator stays local.
- Reaction emojis on comments.
- PDF export of the memo.
- Cross-device read-state sync (localStorage suffices given the second-plan posture).

## 13. Risks

- **Polymorphic FK pattern** (`parent_type` + `parent_id`) is conventional in qualis (see e.g. user-id SET-NULL pattern across multiple tables) but loses cascade-on-parent-delete in PostgreSQL. Mitigation: explicit cascade in `concourse_service.delete()` and `study_service.delete()` removes orphan memo_entries before deleting the parent.
- **Email volume** from @-mentions could become noisy. Mitigation: per-user "memo notifications" preference (default on) — but this is out of scope for v1; if it becomes an issue, the toggle is one Pydantic field on the user preferences blob.
- **Migration on production data**: if any concourse/study has a memo > 10 000 chars (theoretically possible for `methodology_memo` which currently has no cap), the new entry would be silently truncated. The migration script should `ASSERT char_length(body) <= 10000` before the INSERT and abort with a clear error if violated. Researchers split the content manually before re-running the deploy.

## 14. Implementation order (sketch)

To be detailed in the implementation plan, but expected as four sequential PRs:

1. **Backend foundation** — models, schemas, service, router, migration, backend tests. No frontend yet; existing memo Accordion still reads/writes the old free-text columns until PR 2.
2. **Frontend MemoSection** — `useMemoSection` hook, `MemoSection` component, integration into both Accordion shells. Old free-text Accordion bodies replaced. i18n keys swapped.
3. **Export** — `_render_memo_md`, ZIP plumbing, modal checkbox, export tests.
4. **Polish** — @-mentions email path, indicator, E2E.
