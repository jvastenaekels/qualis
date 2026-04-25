# Axis 05 — Data & Migrations

**Date:** 2026-04-25
**Pass:** standard
**Auditor:** Claude (sub-agent)

---

## Scope

Schema coherence between `backend/app/models.py` and the Alembic migration chain
(`backend/db_migrations/versions/`), data-loss risk in migrations, unique constraints,
indexes on FK columns, cascade behaviour, soft-delete patterns, and seed/init_db
correctness.

---

## Automated checks

| Tool / command | Result |
|----------------|--------|
| `alembic check` | FAILED — "Target database is not up to date" (dev DB at revision `2bf0f513` = step 6/15; **not** real schema drift — see verdict below) |
| `backend/scripts/check_relationships.py` | FAILED on the raw-output run (wrong working dir: `backend/app/models.py not found`). Re-run from project root: **PASSED** — all relationships use async-safe loading strategies (`selectin`, `raise`, or similar) |

### Alembic drift verdict

The `alembic check` failure is a **dev-DB-state artifact**, not real model/migration drift.
The migration chain is fully linear with 15 revisions and no branches (verified by
reconstructing the `down_revision` pointer chain):

```
1.  8e32439881ce  initial_schema
2.  8e4ef63c6c7a  rename_randomize_statements
3.  bf798fcf46a6  remove_consent_buttons
4.  d3221972445d  add_pre_instruction
5.  a64b4724fcb8  add_is_test_run
6.  2bf0f513c6c8  add_audio_recordings_table       ← dev DB head
7.  c4a1e7f23b91  add_statement_display_order
8.  f7a3b2c19d45  add_last_step_reached
9.  2347cad310fd  fix_last_step_reached_backfill
10. e1a9c3d47f82  add_draft_responses
11. a7b3c9d12e45  add_resume_code
12. b1c2d3e4f5a6  add_concourse_tables
13. c8d9e0f1a2b3  add_statement_concourse_traceability
14. c3d4e5f6a7b8  add_item_versions_and_comments
15. d4e5f6a7b8c9  rename_workspace_to_project       ← actual head
```

Note: CLAUDE.md listed only 6 migrations; this is stale (cross-reference F-09-005).

---

## Findings

### F-05-001 : Stale index names after workspace→project rename

- **Severity:** minor
- **Audience:** [Maintenance]
- **Location:** `backend/db_migrations/versions/d4e5f6a7b8c9_rename_workspace_to_project.py`
- **Observation:** Migration `d4e5f6a7b8c9` renames tables and columns
  (`workspaces` → `projects`, `workspace_id` → `project_id` in multiple tables,
  `workspace_members` → `project_members`) but leaves three indexes with stale names in
  the live database:
  - `ix_invitations_workspace_id` — index on `invitations.project_id` (renamed column in
    `8e32439881ce`, not renamed in `d4e5`)
  - `ix_concourses_workspace_id` — index on `concourses.project_id` (created in
    `b1c2d3e4f5a6` with the old name)
  - `ix_concourse_tags_workspace_id` — index on `concourse_tags.project_id` (same)

  The migration correctly renames `ix_workspaces_id → ix_projects_id`,
  `ix_workspaces_slug → ix_projects_slug`, and `uq_workspace_tag_name → uq_project_tag_name`,
  but does not rename the three FK indexes listed above.

  PostgreSQL indexes are named independently of the columns they cover; the indexes
  still function correctly. This is a naming-only issue.
- **Impact:** Schema inspection (e.g., `\di` in psql, `alembic inspect`) returns
  misleading index names. Future migration authors who grep for `workspace_id` or
  `project_id` may miss these indexes, leading to duplicate indexes or failed drops.
  Low probability of causing a production bug; high probability of causing confusion
  during schema maintenance.
- **Recommendation:** Add a follow-up migration that executes:
  ```sql
  ALTER INDEX ix_invitations_workspace_id RENAME TO ix_invitations_project_id;
  ALTER INDEX ix_concourses_workspace_id RENAME TO ix_concourses_project_id;
  ALTER INDEX ix_concourse_tags_workspace_id RENAME TO ix_concourse_tags_project_id;
  ```
- **Effort:** S

---

### F-05-002 : `Invitation.study_id` is an unresolved legacy field

- **Severity:** minor
- **Audience:** [Maintenance]
- **Location:** `backend/app/models.py:535`
- **Observation:** The `Invitation` model carries a `study_id` FK with a code comment
  that reads: *"study_id removed or made nullable if keeping for legacy ref? Replacing
  study_id with project_id entirely for now."* The field is present, nullable, with
  `ondelete="SET NULL"`, and no index. No migration adds or removes it after
  `initial_schema`. The field is not used in any service or router (confirmed by grep).
  The initial schema creates this column as part of `invitations` without an index on it.
- **Impact:** Dead schema weight: rows contain a nullable FK column that carries no
  semantic meaning and is never queried. No index means any future accidental query on it
  would be a sequential scan. The unresolved comment signals unfinished refactoring —
  a maintenance smell.
- **Recommendation:** Create a migration that drops `invitations.study_id` (it is
  nullable and unused; no data loss risk). Remove the field from the model. If the
  intent is to keep the field for future per-study invitation granularity, resolve the
  comment with a decision and add an index.
- **Effort:** S

---

### F-05-003 : `Participant.is_discarded` filter column has no index

- **Severity:** minor
- **Audience:** [Prod] [Maintenance]
- **Location:** `backend/app/models.py:359`
- **Observation:** `Participant.is_discarded` (Boolean, default=False) is used in
  `WHERE` clauses in at least 4 distinct query sites:
  `Study.participant_count` (column_property), `study_data_service.py:67`,
  `study_data_service.py:279`, and `exports.py:46,97,140`. No index is declared on this
  column in the model or in any migration.
- **Impact:** Every participant query that filters out discarded records performs a
  sequential scan on the `participants` table (filtered by `study_id` first via that
  index, then by `is_discarded`). At modest scale (hundreds of participants per study)
  this is acceptable; at larger scale it degrades. Not an emergency but worth addressing
  before the platform scales beyond demo use.
- **Recommendation:** Add a partial index in a migration:
  ```sql
  CREATE INDEX ix_participants_is_discarded_false
    ON participants (study_id, is_discarded)
    WHERE is_discarded = false;
  ```
  Or at minimum, a plain index on `(study_id, is_discarded)` via a new migration.
- **Effort:** S

---

### F-05-004 : Data model gap underlying RGPD Art. 17 individual erasure (cross-reference)

- **Severity:** major
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/models.py:332–414` (Participant model)
- **Observation:** The `Participant` model holds PII columns (`ip_address`,
  `user_agent`, `presort_answers`, `postsort_answers`, `draft_responses`,
  `consent_hash`, `confirmation_code`, `session_token`, `resume_code`) and stores
  audio recording metadata (`audio_recordings` relationship). The only erasure paths
  at the DB level are:
  - Bulk delete of all participants in a draft study
    (`DELETE /{slug}/participants` — draft-only)
  - Bulk delete of test runs (`DELETE /{slug}/test-runs`)
  - Logical discard (`PATCH /{slug}/participants/{participant_id}/discard`) which flags
    `is_discarded=True` but retains all PII columns

  No migration or model provides a per-participant anonymisation path (e.g., nulling PII
  columns while retaining the Q-sort record for analysis). The model columns that carry
  PII are all nullable (`ip_address`, `user_agent`, `consent_hash`) or could be
  nulled/replaced (`session_token` is a UUID that could be rotated, `confirmation_code`
  is nullable). The data model is thus **capable** of supporting anonymisation without
  full deletion, but no migration formalises this as a schema-level concern.

  Primary finding is F-01-012 (security axis). This entry surfaces the schema-level
  gap: the absence of a dedicated anonymisation state column (e.g., `anonymised_at
  TIMESTAMPTZ`) that would allow auditing and preventing re-attachment of PII.
- **Impact:** Without a schema-level anonymisation marker, individual erasure requests
  (RGPD Art. 17) cannot be audited and could be silently reversed by a re-insert or
  application-layer bug. For production use with real participants, this is a compliance
  gap. For SoftwareX, a RGPD claim without an erasure path is contestable. See F-01-012
  for the endpoint-level finding.
- **Recommendation:** (1) Add `anonymised_at TIMESTAMPTZ NULL` to `participants` (new
  migration). (2) On erasure: set `anonymised_at`, null out all PII columns, delete
  `qsort_entries` if required by the data subject, delete S3 audio. (3) Exclude
  `anonymised_at IS NOT NULL` rows from exports. This preserves the statistical record
  (Q-sort slot count) while erasing PII. Coordinate implementation with F-01-012.
- **Effort:** M

---

### F-05-005 : `remove_consent_buttons` migration drops columns without backup

- **Severity:** observation
- **Audience:** [Maintenance]
- **Location:** `backend/db_migrations/versions/bf798fcf46a6_remove_consent_buttons.py`
- **Observation:** Migration `bf798fcf46a6` drops `study_translations.consent_accept`
  and `study_translations.consent_decline` via `op.drop_column()` with no data
  preservation step. Both columns were nullable VARCHAR. The downgrade re-adds them as
  nullable without content restoration. Any customised consent button text in a live
  database would be permanently lost on upgrade.
- **Impact:** No current production deployments are known, and these were display-only
  fields. Risk is low in practice. However, this migration pattern (drop without backup)
  is a template anti-pattern: future migrations that drop non-trivial columns may
  silently destroy research data.
- **Recommendation:** Document in the contributing guidelines: migrations that drop
  columns should (a) confirm the column is unused or contains only default values, or
  (b) include a `COPY`-out step. No code change required for this specific migration
  given its current state.
- **Effort:** S

---

### F-05-006 : `check_relationships.py` path is hardcoded relative to CWD

- **Severity:** minor
- **Audience:** [Maintenance]
- **Location:** `backend/scripts/check_relationships.py:87`
- **Observation:** The script hardcodes `models_path = Path("backend/app/models.py")`
  (relative path). When invoked from a directory other than the project root (e.g.,
  inside `backend/`), it fails with `Error: backend/app/models.py not found.` This is
  exactly what happened in Wave 1 tooling (the raw log shows this error). The CI
  integration must invoke this script from the project root to succeed.
- **Impact:** The `make check` pipeline that runs this script currently assumes
  project-root invocation. If a developer runs it manually from `backend/`, they get a
  silent false pass (exit 1 but no relationship errors). This is a tooling robustness
  issue, not a schema issue.
- **Recommendation:** Replace the hardcoded path with one relative to `__file__`:
  ```python
  models_path = Path(__file__).resolve().parents[2] / "app" / "models.py"
  ```
- **Effort:** S

---

### F-05-007 : `QSortEntry` has dual CASCADE FKs to both `participants` and `statements`

- **Severity:** observation
- **Audience:** [Maintenance]
- **Location:** `backend/app/models.py:423–428`
- **Observation:** `QSortEntry.participant_id` is FK to `participants` with
  `ondelete="CASCADE"`, and `QSortEntry.statement_id` is FK to `statements` with
  `ondelete="CASCADE"`. When a study is deleted, the ORM cascade fires:
  `Study → participants (delete-orphan) → qsort_entries (delete-orphan)` simultaneously
  with the DB-level cascade: `Study → statements (CASCADE) → qsort_entries (CASCADE via
  statement_id)`. Both paths attempt to delete the same `qsort_entries` rows.
  PostgreSQL handles this correctly (the second delete finds no rows), but SQLAlchemy's
  ORM unit-of-work may raise `StaleDataError` if it tries to delete an already-deleted
  object that was tracked in the session.
- **Impact:** No confirmed production bug; the risk only manifests when deleting a
  study while both the ORM cascade and the DB cascade are active in the same transaction
  (e.g., if ORM-level study deletion is used rather than a raw `DELETE`). The current
  code uses `db.delete(study)` in at least one path, which triggers ORM cascade. Risk
  is low but non-zero under concurrent load.
- **Recommendation:** Remove `ondelete="CASCADE"` from `QSortEntry.statement_id` and
  rely solely on the participant → qsort_entries cascade for cleanup. Statements being
  deleted do not semantically require qsort_entries to disappear — the participant
  record is the owner. Alternatively, set `passive_deletes=True` on the relationship
  to let the DB handle it without ORM interference.
- **Effort:** S

---

### F-05-008 : `init_db.py --reset` path is irreversible and undocumented

- **Severity:** observation
- **Audience:** [Prod] [Maintenance]
- **Location:** `backend/init_db.py:20–33`
- **Observation:** `reset_schema()` executes `DROP SCHEMA public CASCADE` followed by
  `CREATE SCHEMA public`. This drops **all tables, indexes, sequences, and data** in the
  public schema with no confirmation prompt and no dry-run mode. The only guard is the
  `if reset_flag:` check on `"--reset" in sys.argv`. A `Procfile` release-phase
  invocation without `--reset` is safe (migrations only). The seed guard (`if
  existing_user: return`) makes the init idempotent on re-run without `--reset`.
- **Impact:** Accidental invocation with `--reset` in a production environment (e.g.,
  mistyped Heroku release command) causes total data loss. The script prints
  `⚠️ WARNING: This will drop all existing data!` but does not require confirmation.
- **Recommendation:** Add a `--yes` confirmation flag: only proceed with reset if both
  `--reset` and `--yes` are present, or prompt interactively if `--yes` is absent and
  stdout is a TTY.
- **Effort:** S

---

### F-05-009 : `Concourse` has no uniqueness constraint on `(project_id, title)`

- **Severity:** observation
- **Audience:** [Maintenance]
- **Location:** `backend/app/models.py:556–582`
- **Observation:** The `Concourse` model declares no `UniqueConstraint` on `(project_id,
  title)`. Two concourses with identical titles can coexist within the same project. By
  contrast, `ConcourseItem` enforces `uq_concourse_item_code`, `ConcourseTag` enforces
  `uq_project_tag_name`, and `Study` enforces a global unique slug. Concourse titles are
  the primary human-readable identifier shown in the UI and referenced in study setup.
- **Impact:** Duplicate concourse titles within a project would confuse researchers and
  could cause import errors if concourse selection is done by title rather than ID. This
  is a schema evolution opportunity; the current code may or may not enforce uniqueness
  at the service layer (not audited here).
- **Recommendation:** Add `UniqueConstraint("project_id", "title",
  name="uq_project_concourse_title")` to `Concourse.__table_args__` and a corresponding
  migration. Evaluate whether existing data (if any) has duplicates before applying.
- **Effort:** S

---

## Summary table

| ID | Title | Severity | Effort |
|----|-------|----------|--------|
| F-05-001 | Stale index names after workspace→project rename | minor | S |
| F-05-002 | `Invitation.study_id` unresolved legacy field | minor | S |
| F-05-003 | `Participant.is_discarded` missing index | minor | S |
| F-05-004 | Data model gap for RGPD Art. 17 individual erasure | major | M |
| F-05-005 | `remove_consent_buttons` drops columns without backup | observation | S |
| F-05-006 | `check_relationships.py` hardcoded path breaks non-root invocation | minor | S |
| F-05-007 | Dual CASCADE on `QSortEntry` (ORM + DB) | observation | S |
| F-05-008 | `init_db.py --reset` is irreversible without confirmation | observation | S |
| F-05-009 | `Concourse` missing uniqueness on `(project_id, title)` | observation | S |

**Totals:** 0 blockers · 1 major · 4 minors · 4 observations

---

## Cross-references

- **F-01-012** (security axis) — RGPD Art. 17 endpoint missing. F-05-004 surfaces the
  schema-level gap that makes F-01-012 harder to implement without a migration.
- **F-09-004** (reproducibility axis) — `data/example-study.json` missing from repo.
  `init_db.py` line 115 prints instructions pointing to this file; the missing data
  directory is the root cause.
- **F-09-005** (reproducibility axis) — CLAUDE.md migration chain stale (lists 6
  migrations; actual chain has 15).
