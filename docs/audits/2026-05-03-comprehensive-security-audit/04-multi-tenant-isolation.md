# Wave 3 — Multi-Tenant Isolation

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `a56a95bf` of `audit/3-multi-tenant-isolation`

## Scope

Files audited:
- `backend/app/routers/admin/` (12 modules, ~89 endpoints)
- `backend/app/services/quotas.py`
- `backend/app/dependencies.py` (`require_project_role`, `get_current_user`)
- `backend/db_migrations/versions/cb2c7f6f0cfe_rename_researcher_to_member_and_owner_*.py`
- Adjacent business-logic flows: `app.routers.audio`, `app.routers.participants`,
  `app.services.export_service`, `app.routers.recruitment` (if exists).

No carry-overs from Wave 1 or Wave 2 — fresh ground.

## Inventory

### Admin endpoint inventory

89 endpoints across 12 router modules (counted by `grep -cE '@router\.(get|post|put|patch|delete)' backend/app/routers/admin/*.py`).

**Pattern legend:**

- **A — Project-scoped via path or header.** Project membership is verified by a single dependency (`check_project_permission(slug)`, `check_study_permission(slug)`, `require_project_role(role)`, or `get_current_project`). The dependency joins `ProjectMember` against the URL's project/study slug or the `X-Project-ID` header. Cross-tenant leakage is only possible if the dependency itself is broken.
- **B — Object-scoped via path** (path carries an opaque object id like `{participant_id}`, `{eid}`, `{cid}`, `{tag_id}`, `{link_id}`, `{user_id}` without a co-located project/study slug, or carries `{cid}`/`{sid}` for memos). Handler must look up the object's parent project, then check membership. **Highest-risk pattern.** Each of these warrants per-route harness coverage.
- **C — Top-level enumeration / global** (`/api/admin/projects` list, `/api/admin/users`, invitation accept/verify, `/admin/memo/templates`, `/api/admin/studies/validate-import`, `/api/admin/studies/import`). Filtering or auth must happen in-handler.

`role_dep` notation: `member+` = member-or-higher (member, owner). `editor+` = StudyRole editor or above (mapped from project member/owner). `superuser` = `check_superuser` only. `auth` = only `get_current_user` runs (membership check is inline).

| Method | Path | Source file:line | Pattern | role_dep | Project-scoping mechanism | Notes |
|---|---|---|---|---|---|---|
| GET | /api/admin/projects | projects.py:41 | C | auth | filter `WHERE ProjectMember.user_id = current_user.id` | enumeration scoped to caller's memberships |
| POST | /api/admin/projects | projects.py:85 | C | auth | new project, owner-quota gated via `assert_can_create_owned_project` | |
| GET | /api/admin/projects/{slug} | projects.py:159 | A | auth | inline join `Project.slug + ProjectMember.user_id` (404 if no membership) | role used only for response payload |
| PATCH | /api/admin/projects/{slug} | projects.py:195 | A | owner | `check_project_permission(owner)` | |
| GET | /api/admin/projects/{slug}/members | projects.py:253 | A | viewer+ | `check_project_permission(viewer)` | |
| PATCH | /api/admin/projects/{slug}/members/{user_id} | projects.py:286 | A | owner | `check_project_permission(owner)`; rejects `role=owner` (`OWNER_ROLE_IMMUTABLE`) | |
| DELETE | /api/admin/projects/{slug}/members/{user_id} | projects.py:347 | A | owner | `check_project_permission(owner)` + self-removal guard | |
| DELETE | /api/admin/projects/{slug} | projects.py:399 | A | owner | `check_project_permission(owner)`; refuses if studies remain | |
| POST | /api/admin/projects/{slug}/invitations | projects.py:449 | A | owner | `check_project_permission(owner)`; quota-gated (`assert_can_add_member`); rejects `role=owner` | |
| GET | /api/admin/invitations/verify | invitations.py:18 | C | none | unauthenticated; decodes JWT-ish invitation token | leaks `project_name` if token valid; expected behaviour |
| POST | /api/admin/invitations/accept | invitations.py:53 | C | auth | token email must equal `current_user.email`; quota-gated | adds caller as member |
| GET | /api/admin/recruitment/{slug}/links | recruitment.py:22 | A | viewer+ | `check_study_permission(viewer)` | |
| POST | /api/admin/recruitment/{slug}/links | recruitment.py:31 | A | editor+ | `check_study_permission(editor)` | |
| DELETE | /api/admin/recruitment/links/{link_id} | recruitment.py:58 | B | editor+ (inline) | inline join `RecruitmentLink → Study → ProjectMember` + ROLE_MAP/STUDY hierarchy check | bespoke inline check; review carefully |
| GET | /api/concourses/{cid}/memo | memos.py:118 | B | viewer+ | `db.get(Concourse, cid)` then `_check_member(c.project_id, viewer)` | path is `/api/admin/concourses/{cid}/memo` (memos router carries its own `/admin` prefix and is mounted at `/api`) |
| GET | /api/admin/studies/{sid}/memo | memos.py:136 | B | viewer+ | `db.get(Study, sid)` then `_check_member(s.project_id, viewer)` | sid is **integer id**, not slug — distinct from other studies/{slug} routes |
| GET | /api/admin/concourses/{cid}/memo/unread | memos.py:154 | B | viewer+ | same as above, plus ISO-8601 cutoff | |
| GET | /api/admin/studies/{sid}/memo/unread | memos.py:181 | B | viewer+ | same | sid integer id |
| GET | /api/admin/memo/templates | memos.py:208 | C | auth | none — returns static template list | parent_type query arg only |
| POST | /api/admin/concourses/{cid}/memo/entries | memos.py:219 | B | member+ | `db.get(Concourse, cid)` then `_check_member(c.project_id, member)` | |
| POST | /api/admin/studies/{sid}/memo/entries | memos.py:248 | B | member+ | `db.get(Study, sid)` then `_check_member(s.project_id, member)` | sid integer id |
| PATCH | /api/admin/memo-entries/{eid} | memos.py:277 | B | member+ | `_resolve_entry_parent` walks back to project_id, then `_check_member(member)` | |
| DELETE | /api/admin/memo-entries/{eid} | memos.py:299 | B | member+ | same | |
| POST | /api/admin/memo-entries/{eid}/comments | memos.py:315 | B | viewer+ | resolve parent project; `validate_mentions` guards mentioned ids | |
| PATCH | /api/admin/memo-comments/{cid} | memos.py:352 | B | viewer+ if author else owner | resolve via comment → entry → project | author-vs-moderator branching |
| DELETE | /api/admin/memo-comments/{cid} | memos.py:371 | B | viewer+ if author else owner | same | soft delete |
| POST | /api/admin/memo-comments/{cid}/resolve | memos.py:392 | B | member+ if entry author else owner | author-aware role gate | |
| POST | /api/admin/memo-comments/{cid}/unresolve | memos.py:411 | B | member+ if entry author else owner | same | |
| GET | /api/admin/studies/{slug}/participants | studies_participants.py:33 | A | viewer+ | `check_study_permission(viewer)` | |
| GET | /api/admin/studies/participants/{participant_id} | studies_participants.py:62 | B | member+ (inline) | inline join `Participant → Study → ProjectMember` with `role.in_([owner, member])` | mode=mediated; viewer-role members are excluded |
| PATCH | /api/admin/studies/participants/{participant_id}/discard | studies_participants.py:113 | B | member+ (inline) | inline join, same shape | |
| DELETE | /api/admin/studies/{slug}/participants | studies_participants.py:158 | A | editor+ | `check_study_permission(editor)`; gated to `state=draft` | |
| DELETE | /api/admin/studies/{slug}/participants/{participant_id}/personal-data | studies_participants.py:179 | A | editor+ | `check_study_permission(editor)`; verifies `participant.study_id == study.id` | GDPR Art. 17 admin-mediated |
| GET | /api/admin/studies/{slug}/export/csv | exports.py:34 | A | editor+ | `check_study_permission(editor)` | streams CSV |
| GET | /api/admin/studies/{slug}/export/pqmethod | exports.py:75 | A | editor+ | `check_study_permission(editor)` | streams ZIP |
| GET | /api/admin/studies/{slug}/export/r-kit | exports.py:118 | A | editor+ | `check_study_permission(editor)` | |
| GET | /api/admin/studies/{slug}/dump | exports.py:161 | A | editor+ | `check_study_permission(editor)` | full study JSON dump |
| GET | /api/admin/studies/{slug}/participants/{participant_id}/export/csv | exports.py:175 | A | editor+ | `check_study_permission(editor)` + `participant.study_id == study.id` | |
| GET | /api/admin/studies/{slug}/participants/{participant_id}/export/json | exports.py:224 | A | editor+ | full dump filtered by `participant_id`; 404 if not found | filter is in-Python (memory) — confirm |
| GET | /api/admin/studies/{slug}/participants/{participant_id}/export/audio | exports.py:259 | A | editor+ | `check_study_permission(editor)` + `participant.study_id == study.id`; presigned ZIP | |
| GET | /api/admin/studies/{slug}/export/package | exports.py:350 | A | editor+ | `check_study_permission(editor)` | full research package ZIP |
| GET | /api/admin/studies/{slug}/data-inventory | lifecycle.py:121 | A | viewer+ | `check_study_permission(viewer)` | |
| GET | /api/admin/studies/{slug}/anonymise-preview | lifecycle.py:225 | A | viewer+ | `check_study_permission(viewer)` | |
| POST | /api/admin/studies/{slug}/anonymise-bulk | lifecycle.py:253 | A | editor+ | `check_study_permission(editor)` | mutates participant PII |
| POST | /api/admin/studies | studies.py:46 | A | member+ | `require_project_role(member)` (X-Project-ID header) | creates study in active project |
| GET | /api/admin/studies | studies.py:64 | A | auth (header) | `get_current_project` (X-Project-ID); filter `Study.project_id = project.id` | |
| GET | /api/admin/studies/{slug} | studies.py:97 | A | viewer+ | `check_study_permission(viewer)` | |
| PATCH | /api/admin/studies/{slug} | studies.py:116 | A | editor+ | `check_study_permission(editor)` | |
| POST | /api/admin/studies/{slug}/validate | studies.py:148 | A | editor+ | `check_study_permission(editor)` | |
| POST | /api/admin/studies/{slug}/state | studies.py:163 | A | editor+ | `check_study_permission(editor)` | |
| POST | /api/admin/studies/{slug}/reset | studies.py:218 | A | owner | `check_study_permission(owner)` | wipes participants |
| DELETE | /api/admin/studies/{slug} | studies.py:240 | A | owner + superuser | `check_study_permission(owner)` AND `current_user.is_superuser` | requires archived state |
| POST | /api/admin/studies/{slug}/import-concourse | studies.py:282 | A | editor+ | `check_study_permission(editor)` | |
| GET | /api/admin/studies/{slug}/stale-statements | studies.py:297 | A | editor+ | `check_study_permission(editor)` | |
| POST | /api/admin/studies/{slug}/sync-statement/{statement_id} | studies.py:309 | A | editor+ | `check_study_permission(editor)` | concourse-sourced text sync |
| POST | /api/admin/studies/{slug}/sync-all-stale | studies.py:337 | A | editor+ | `check_study_permission(editor)` | |
| GET | /api/admin/studies/{slug}/analysis/eigenvalues | analysis.py:98 | A | viewer+ | `check_study_permission(viewer)` | |
| POST | /api/admin/studies/{slug}/analysis/run | analysis.py:137 | A | editor+ | `check_study_permission(editor)` | persists AnalysisRun |
| POST | /api/admin/studies/{slug}/analysis/preview-range | analysis.py:403 | A | viewer+ | `check_study_permission(viewer)` | |
| GET | /api/admin/studies/{slug}/analysis/runs | analysis.py:509 | A | viewer+ | `check_study_permission(viewer)`; filter `AnalysisRun.study_id == study.id` | |
| GET | /api/admin/studies/{slug}/analysis/runs/{run_id} | analysis.py:526 | A | viewer+ | `_load_run` filters `AnalysisRun.study_id == study.id` | path carries study slug, not just run_id |
| PATCH | /api/admin/studies/{slug}/analysis/runs/{run_id} | analysis.py:551 | A | editor+ | same | |
| DELETE | /api/admin/studies/{slug}/analysis/runs/{run_id} | analysis.py:597 | A | editor+ | same | |
| GET | /api/admin/studies/{slug}/analysis/audios | analysis.py:622 | A | viewer+ | `check_study_permission(viewer)` + `Participant.study_id == study.id` filter on input ids | participant-id stuffing defended-in-depth |
| GET | /api/admin/studies/{slug}/analysis/comments | analysis.py:723 | A | viewer+ | same | |
| GET | /api/admin/studies/{slug}/stats | studies_import_export.py:52 | A | viewer+ | `check_study_permission(viewer)` | |
| GET | /api/admin/studies/{slug}/export/config | studies_import_export.py:69 | A | viewer+ | `check_study_permission(viewer)` | study JSON config (no participant data) |
| POST | /api/admin/studies/validate-import | studies_import_export.py:388 | C | auth (header) | `get_current_project` (membership only); pure validation, no DB write | |
| POST | /api/admin/studies/import | studies_import_export.py:479 | C | member+ | `require_project_role(member)` (X-Project-ID); creates study in caller's project | new study lands in header-named project |
| GET | /api/admin/studies/{slug}/storage-usage | studies_import_export.py:601 | A | viewer+ | `check_study_permission(viewer)` | |
| GET | /api/admin/concourses/tags | concourses.py:56 | A | auth (header) | `get_current_project` filter by `project.id` | |
| POST | /api/admin/concourses/tags | concourses.py:65 | A | member+ | `require_project_role(member)` | |
| DELETE | /api/admin/concourses/tags/{tag_id} | concourses.py:83 | B | member+ | `require_project_role(member)` + service does `project_id` filter on the tag | tag_id is opaque; service guards |
| POST | /api/admin/concourses | concourses.py:103 | A | member+ | `require_project_role(member)` (creates concourse in header project) | |
| GET | /api/admin/concourses | concourses.py:130 | A | auth (header) | `get_current_project`; filter `Concourse.project_id = project.id` | |
| GET | /api/admin/concourses/{concourse_id} | concourses.py:161 | B | auth (header) | `get_current_project` + explicit `if concourse.project_id != project.id: 404` | guard-after-fetch shape |
| PATCH | /api/admin/concourses/{concourse_id} | concourses.py:183 | B | member+ | `require_project_role(member)` + service `update_concourse(project.id, concourse_id, ...)` | service is responsible for the cross-check |
| DELETE | /api/admin/concourses/{concourse_id} | concourses.py:198 | B | owner | `require_project_role(owner)` + explicit `if concourse.project_id != project.id: 404` | |
| POST | /api/admin/concourses/{concourse_id}/items | concourses.py:223 | B | member+ | `require_project_role(member)` + `_verify_concourse_ownership` | |
| POST | /api/admin/concourses/{concourse_id}/items/bulk | concourses.py:244 | B | member+ | same | |
| POST | /api/admin/concourses/{concourse_id}/items/import | concourses.py:267 | B | member+ | same | |
| PATCH | /api/admin/concourses/{concourse_id}/items/{item_id} | concourses.py:290 | B | member+ | `require_project_role(member)` + `_verify_concourse_ownership` | |
| DELETE | /api/admin/concourses/{concourse_id}/items/{item_id} | concourses.py:313 | B | member+ | same | |
| GET | /api/admin/concourses/{concourse_id}/items/{item_id}/versions | concourses.py:338 | B | auth (header) | `get_current_project` + `_verify_concourse_ownership` + `_verify_item_ownership` | |
| GET | /api/admin/concourses/{concourse_id}/items/{item_id}/comments | concourses.py:357 | B | auth (header) | same | |
| POST | /api/admin/concourses/{concourse_id}/items/{item_id}/comments | concourses.py:376 | B | member+ | `require_project_role(member)` + ownership verifies | |
| GET | /api/admin/users | users.py:21 | C | superuser | `check_superuser` only; lists all users | superuser-gated; no project scope |
| POST | /api/admin/users | users.py:45 | C | superuser | `check_superuser` only | superuser-gated |
| DELETE | /api/admin/users/{user_id} | users.py:82 | C | superuser | `check_superuser` + self-deletion guard | |

**Pattern totals:** 51 type-A, 28 type-B, 10 type-C. Total: 89. No endpoints flagged as unfit.

### Membership machinery

`require_project_role(role)` (`backend/app/dependencies.py:170-193`) is a dependency factory that delegates to `get_current_project` (lines 94-133). `get_current_project` reads the **`X-Project-ID` header**, parses it as an integer, and queries `(Project, ProjectMember)` joined where `Project.id = X-Project-ID AND ProjectMember.user_id = current_user.id`. Missing header → 400; non-integer → 400; no membership row → 403 "Access to this project is denied". The returned `(Project, ProjectMember)` tuple is then handed to `require_project_role`, which compares the member's role against `PROJECT_ROLE_HIERARCHY` and rejects with 403 "Insufficient permissions" if below threshold.

`check_project_permission(role)` (lines 196-239) and `check_study_permission(role)` (lines 242-293) take a different path: they read the **`{slug}`** path parameter directly (project slug or study slug) and run a single inline join against `ProjectMember` keyed on `current_user.id`. Missing row → **404** (not 403) "Project/Study not found or access denied", deliberately collapsing existence-disclosure with permission denial. Role check happens after the row is found, returning 403. `check_study_permission` additionally maps `ProjectRole → StudyRole` via the constant `ROLE_MAP` (`owner→owner, member→editor, viewer→viewer`) and uses `STUDY_ROLE_HIERARCHY` (numeric weights `30/20/10`).

Role hierarchies (`dependencies.py:138-155`):

- `PROJECT_ROLE_HIERARCHY = {owner: 40, member: 20, viewer: 10}`
- `STUDY_ROLE_HIERARCHY = {owner: 30, editor: 20, viewer: 10}`
- `ROLE_MAP = {ProjectRole.owner: StudyRole.owner, ProjectRole.member: StudyRole.editor, ProjectRole.viewer: StudyRole.viewer}`

**Short-circuits.** No global super-admin bypass for project/study membership: `is_superuser` is checked only in `check_superuser` (`/api/admin/users` and `DELETE /api/admin/studies/{slug}` overlay) and in the import-export verifier. A superuser **without** project membership cannot reach project/study admin endpoints — confirmed by reading every dependency.

**`password_changed_at` check (F-03-010 from Wave 2).** Lives in `get_current_user` (`dependencies.py:74-78`): every request decodes the JWT, fetches the user, and compares `int(token_iat) < int(user.password_changed_at.timestamp())`. Tokens minted before the user's last password rotation are rejected with 401. Equality is allowed (false-rejection guard for one-second-resolution clock collisions). This runs for **every** admin endpoint by virtue of being the root dependency of every other dependency in the chain.

**Inline-join routes (Pattern B without a slug).** Five admin endpoints check membership inline rather than via a dependency factory: `GET /participants/{participant_id}`, `PATCH /participants/{participant_id}/discard`, `DELETE /recruitment/links/{link_id}`, the memo endpoints (`/concourses/{cid}/memo*`, `/studies/{sid}/memo*`, `/memo-entries/{eid}*`, `/memo-comments/{cid}*`), and the concourse-id routes that explicitly compare `concourse.project_id != project.id`. Each of these is a Task-3 harness target: harness must verify the bespoke check matches the dependency-factory contract and rejects cross-tenant ids with 403/404.

### Migration cb2c7f6f0cfe

`backend/db_migrations/versions/cb2c7f6f0cfe_rename_researcher_to_member_and_owner_.py` (revision `cb2c7f6f0cfe`, down-revision `fd88287d3f9b`).

What it does:

1. **Pre-flight guard.** Refuses to run if any project has more than one `owner` row in `project_members` — raises `RuntimeError` with the offending `project_id`s. Defence-in-depth in case a bug elsewhere created multiple owners.
2. **Enum rename.** Recreates the `projectrole` Postgres enum as `{owner, member, viewer}` (dropping `researcher`). Recasts both `project_members.role` and `invitations.role` with `CASE WHEN role = 'researcher' THEN 'member' ELSE role END`. Drops the old enum and renames the new one back to `projectrole`.
3. **Owner-uniqueness partial unique index.** `CREATE UNIQUE INDEX project_members_one_owner_per_project ON project_members (project_id) WHERE role = 'owner'`. DB-level guarantee that no project ever has two owners.

Prior bug it patched. The `researcher`/`member` rename is mostly cosmetic — what matters is the **owner-uniqueness invariant**. Before the migration, the API enforced "Owner is set at creation, never reassigned" only at the application layer (`OWNER_ROLE_IMMUTABLE` rejection in PATCH/invite endpoints). There was no DB-level safeguard, so a race condition (two simultaneous PATCH requests, or a manual SQL fix-up) could in principle create a project with two owners — duplicating the highest-privilege role. The partial unique index closes that gap. (The design doc — `docs/superpowers/specs/2026-05-02-project-roles-refactor-design.md` §9 — frames this explicitly as defence-in-depth.)

### Cross-tenant access matrix

**Harness:** `backend/tests/security/wave_3/test_admin_idor_harness.py`
**Run at commit:** `76aa9804`
**Wall-clock:** 210s (3m 30s) for 82 parametrised cases + 1 coverage assertion.
**Result:** 82 passed / 0 failed (out of 89 inventory routes; 7 not applicable, see below).

Each row sends a request as Bob (project-A member) targeting a project-B object id (or
`X-Project-ID` header). The expected response is a 403 (header-based dependency) or
404 (slug-based dependency, existence-disclosure-collapsed). The harness records the
actual status; any value outside the expected set is a finding for Task 4.

| # | Method | Path template | Pattern | Result | Status set |
|---|---|---|---|---|---|
| 1 | GET | /api/admin/projects/{slug} | A_SLUG | passed | 403/404 |
| 2 | PATCH | /api/admin/projects/{slug} | A_SLUG | passed | 403/404 |
| 3 | GET | /api/admin/projects/{slug}/members | A_SLUG | passed | 403/404 |
| 4 | PATCH | /api/admin/projects/{slug}/members/{user_id} | A_SLUG | passed | 403/404 |
| 5 | DELETE | /api/admin/projects/{slug}/members/{user_id} | A_SLUG | passed | 403/404 |
| 6 | DELETE | /api/admin/projects/{slug} | A_SLUG | passed | 403/404 |
| 7 | POST | /api/admin/projects/{slug}/invitations | A_SLUG | passed | 403/404 |
| 8 | GET | /api/admin/recruitment/{slug}/links | A_SLUG | passed | 403/404 |
| 9 | POST | /api/admin/recruitment/{slug}/links | A_SLUG | passed | 403/404 |
| 10 | DELETE | /api/admin/recruitment/links/{link_id} | B | passed | 403/404 |
| 11 | GET | /api/admin/concourses/{cid}/memo | B | passed | 403/404 |
| 12 | GET | /api/admin/studies/{sid}/memo | B | passed | 403/404 |
| 13 | GET | /api/admin/concourses/{cid}/memo/unread | B | passed | 403/404 |
| 14 | GET | /api/admin/studies/{sid}/memo/unread | B | passed | 403/404 |
| 15 | POST | /api/admin/concourses/{cid}/memo/entries | B | passed | 403/404 |
| 16 | POST | /api/admin/studies/{sid}/memo/entries | B | passed | 403/404 |
| 17 | PATCH | /api/admin/memo-entries/{eid} | B | passed | 403/404 |
| 18 | DELETE | /api/admin/memo-entries/{eid} | B | passed | 403/404 |
| 19 | POST | /api/admin/memo-entries/{eid}/comments | B | passed | 403/404 |
| 20 | PATCH | /api/admin/memo-comments/{cid} | B | passed | 403/404 |
| 21 | DELETE | /api/admin/memo-comments/{cid} | B | passed | 403/404 |
| 22 | POST | /api/admin/memo-comments/{cid}/resolve | B | passed | 403/404 |
| 23 | POST | /api/admin/memo-comments/{cid}/unresolve | B | passed | 403/404 |
| 24 | GET | /api/admin/studies/{slug}/participants | A_SLUG | passed | 403/404 |
| 25 | GET | /api/admin/studies/participants/{participant_id} | B | passed | 403/404 |
| 26 | PATCH | /api/admin/studies/participants/{participant_id}/discard | B | passed | 403/404 |
| 27 | DELETE | /api/admin/studies/{slug}/participants | A_SLUG | passed | 403/404 |
| 28 | DELETE | /api/admin/studies/{slug}/participants/{participant_id}/personal-data | A_SLUG | passed | 403/404 |
| 29 | GET | /api/admin/studies/{slug}/export/csv | A_SLUG | passed | 403/404 |
| 30 | GET | /api/admin/studies/{slug}/export/pqmethod | A_SLUG | passed | 403/404 |
| 31 | GET | /api/admin/studies/{slug}/export/r-kit | A_SLUG | passed | 403/404 |
| 32 | GET | /api/admin/studies/{slug}/dump | A_SLUG | passed | 403/404 |
| 33 | GET | /api/admin/studies/{slug}/participants/{participant_id}/export/csv | A_SLUG | passed | 403/404 |
| 34 | GET | /api/admin/studies/{slug}/participants/{participant_id}/export/json | A_SLUG | passed | 403/404 |
| 35 | GET | /api/admin/studies/{slug}/participants/{participant_id}/export/audio | A_SLUG | passed | 403/404 |
| 36 | GET | /api/admin/studies/{slug}/export/package | A_SLUG | passed | 403/404 |
| 37 | GET | /api/admin/studies/{slug}/data-inventory | A_SLUG | passed | 403/404 |
| 38 | GET | /api/admin/studies/{slug}/anonymise-preview | A_SLUG | passed | 403/404 |
| 39 | POST | /api/admin/studies/{slug}/anonymise-bulk | A_SLUG | passed | 403/404 |
| 40 | POST | /api/admin/studies | A_HEADER | passed | 403/404 |
| 41 | GET | /api/admin/studies | A_HEADER | passed | 403/404 |
| 42 | GET | /api/admin/studies/{slug} | A_SLUG | passed | 403/404 |
| 43 | PATCH | /api/admin/studies/{slug} | A_SLUG | passed | 403/404 |
| 44 | POST | /api/admin/studies/{slug}/validate | A_SLUG | passed | 403/404 |
| 45 | POST | /api/admin/studies/{slug}/state | A_SLUG | passed | 403/404 |
| 46 | POST | /api/admin/studies/{slug}/reset | A_SLUG | passed | 403/404 |
| 47 | DELETE | /api/admin/studies/{slug} | A_SLUG | passed | 403/404 |
| 48 | POST | /api/admin/studies/{slug}/import-concourse | A_SLUG | passed | 403/404 |
| 49 | GET | /api/admin/studies/{slug}/stale-statements | A_SLUG | passed | 403/404 |
| 50 | POST | /api/admin/studies/{slug}/sync-statement/{statement_id} | A_SLUG | passed | 403/404 |
| 51 | POST | /api/admin/studies/{slug}/sync-all-stale | A_SLUG | passed | 403/404 |
| 52 | GET | /api/admin/studies/{slug}/analysis/eigenvalues | A_SLUG | passed | 403/404 |
| 53 | POST | /api/admin/studies/{slug}/analysis/run | A_SLUG | passed | 403/404 |
| 54 | POST | /api/admin/studies/{slug}/analysis/preview-range | A_SLUG | passed | 403/404 |
| 55 | GET | /api/admin/studies/{slug}/analysis/runs | A_SLUG | passed | 403/404 |
| 56 | GET | /api/admin/studies/{slug}/analysis/runs/{run_id} | A_SLUG | passed | 403/404 |
| 57 | PATCH | /api/admin/studies/{slug}/analysis/runs/{run_id} | A_SLUG | passed | 403/404 |
| 58 | DELETE | /api/admin/studies/{slug}/analysis/runs/{run_id} | A_SLUG | passed | 403/404 |
| 59 | GET | /api/admin/studies/{slug}/analysis/audios | A_SLUG | passed | 403/404 |
| 60 | GET | /api/admin/studies/{slug}/analysis/comments | A_SLUG | passed | 403/404 |
| 61 | GET | /api/admin/studies/{slug}/stats | A_SLUG | passed | 403/404 |
| 62 | GET | /api/admin/studies/{slug}/export/config | A_SLUG | passed | 403/404 |
| 63 | GET | /api/admin/studies/{slug}/storage-usage | A_SLUG | passed | 403/404 |
| 64 | GET | /api/admin/concourses/tags | A_HEADER | passed | 403/404 |
| 65 | POST | /api/admin/concourses/tags | A_HEADER | passed | 403/404 |
| 66 | DELETE | /api/admin/concourses/tags/{tag_id} | A_HEADER | passed | 403/404 |
| 67 | POST | /api/admin/concourses | A_HEADER | passed | 403/404 |
| 68 | GET | /api/admin/concourses | A_HEADER | passed | 403/404 |
| 69 | GET | /api/admin/concourses/{concourse_id} | A_HEADER | passed | 403/404 |
| 70 | PATCH | /api/admin/concourses/{concourse_id} | A_HEADER | passed | 403/404 |
| 71 | DELETE | /api/admin/concourses/{concourse_id} | A_HEADER | passed | 403/404 |
| 72 | POST | /api/admin/concourses/{concourse_id}/items | A_HEADER | passed | 403/404 |
| 73 | POST | /api/admin/concourses/{concourse_id}/items/bulk | A_HEADER | passed | 403/404 |
| 74 | POST | /api/admin/concourses/{concourse_id}/items/import | A_HEADER | passed | 403/404 |
| 75 | PATCH | /api/admin/concourses/{concourse_id}/items/{item_id} | A_HEADER | passed | 403/404 |
| 76 | DELETE | /api/admin/concourses/{concourse_id}/items/{item_id} | A_HEADER | passed | 403/404 |
| 77 | GET | /api/admin/concourses/{concourse_id}/items/{item_id}/versions | A_HEADER | passed | 403/404 |
| 78 | GET | /api/admin/concourses/{concourse_id}/items/{item_id}/comments | A_HEADER | passed | 403/404 |
| 79 | POST | /api/admin/concourses/{concourse_id}/items/{item_id}/comments | A_HEADER | passed | 403/404 |
| 80 | DELETE | /api/admin/users/{user_id} | A_HEADER | passed | 403/404 |
| 81 | POST | /api/admin/studies/import | A_HEADER | passed | 403/404 |
| 82 | POST | /api/admin/studies/validate-import | A_HEADER | passed | 403/404 |

**Routes excluded from the cross-tenant harness (7 of 89).** No project-B target id
exists for these routes; their isolation is asserted elsewhere (filter-by-membership
clause, superuser gate, or anti-enum semantics).

| Method | Path | Reason |
|---|---|---|
| GET | /api/admin/projects | enumeration scoped to caller's memberships (in-handler filter) |
| POST | /api/admin/projects | creates a new project; no cross-tenant target |
| GET | /api/admin/invitations/verify | unauthenticated; token-tampering coverage lives in Wave 1 |
| POST | /api/admin/invitations/accept | auth-only token consumption; token must match caller's email |
| GET | /api/admin/users | superuser-gated; cross-project N/A |
| POST | /api/admin/users | superuser-gated; cross-project N/A |
| GET | /api/admin/memo/templates | static templates; no project scope |

**Outcome.** No cross-tenant leakage detected. The two membership mechanisms
(`require_project_role` over `X-Project-ID`, and `check_*_permission` over slug) are
behaving symmetrically and the bespoke inline checks (memos, recruitment-link delete,
participant-id routes) match the dependency-factory contract. The harness is retained
as a CI regression guard against future refactors that might silently bypass either
mechanism. Filed as **F-04-001** below.

## Summary

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 0 |
| minor | 0 |
| observation | 4 |

## Findings

### F-04-001 — Cross-tenant IDOR harness clean (observation)

**Severity:** observation
**Status:** passing (regression guard)
**Files:** `backend/tests/security/wave_3/test_admin_idor_harness.py`,
          `backend/tests/security/wave_3/conftest.py`

A parametrised harness over the 89 admin endpoints (82 cross-tenant-applicable + 7
top-level/superuser/unauth excluded) was implemented and run at commit `76aa9804`.
All 82 cases asserted that a project-A member, when targeting a project-B object id
or `X-Project-ID` header, receives a 403 or 404 denial. The harness is now a CI
regression guard: any future change that breaks one of the two membership
mechanisms (header-based `require_project_role` or slug-based `check_*_permission`)
or the bespoke inline checks (memos, recruitment-link delete, participant-id
routes) will surface here before merge.

This is filed as an observation — not a finding — because nothing is broken; the
harness's value is preventing future regressions, not fixing an existing leak.

### F-04-002 — Recruitment-token cross-study replay rejected (observation)

**Severity:** observation
**Status:** safe — explicit study-id check in token validator
**Files:** `backend/app/services/recruitment_service.py:126-146`,
          `backend/app/routers/submissions.py:96-103`,
          `backend/app/services/submission_service.py:514-521`,
          `backend/tests/security/wave_3/test_recruitment_token_replay.py`
**Disposition:** false positive — the token validator already pins
`link.study_id == study_id`.

Concern: a recruitment token issued for Study A could be replayed against
Study B's `/api/study/{slug}` or submission endpoint, granting unauthorised
access to a study the holder shouldn't enter.

Reality: `RecruitmentService.validate_link_token(db, study_id, token)` looks
up the link by token then explicitly returns `None` when
`link.study_id != study_id`. Both call sites
(`GET /api/study/{slug}` in `submissions.py:98` and the participant-submit
flow in `submission_service.py:517`) pass `study.id` derived from the URL
slug. A cross-study replay therefore fails token validation and the handler
raises 403 "Invalid, expired, or full recruitment link". The regression test
exercises both directions (A→B and B→A) and pins the 403 denial, plus a
sanity 200 on the legitimate own-study path.

### F-04-003 — Audio upload ownership claim integrity (observation)

**Severity:** observation
**Status:** safe — participant identity is session-token-derived; no body claim
**Files:** `backend/app/routers/audio.py:89-231`,
          `backend/app/services/storage_service.py:94-175`,
          `backend/tests/security/wave_3/test_audio_upload_ownership.py`
**Disposition:** false positive — the upload endpoint accepts no
`participant_id` parameter; ownership is bound to the form-supplied
`session_token` UUID.

Concern: if `participant_id` were body-derived (or otherwise
attacker-controllable), an upload could be smuggled into another
participant's row.

Reality: `POST /api/audio/upload` accepts `(file, session_token,
question_key, duration_seconds)` only. The `participant` object is
fetched via `Participant.session_token == session_token` join (audio.py:124),
which is itself the participant's authentication credential. The companion
endpoints (`DELETE /api/audio/{id}` and `GET /api/audio/{id}/url`) verify
`participant.session_token == session_token` after a join from the
`recording → participant` row; mismatched tokens get 403. The S3 key format
(`audio/{study_slug}/{participant_token}/...`) leaks no cross-tenant
information because the participant_token is itself a 128-bit UUID and the
key is never exposed without auth (presigned URLs are minted in-handler
after the session-token check). The regression test pins the no-`participant_id`
signature plus the 403 behaviour on cross-participant delete and presigned-URL
fetch.

### F-04-004 — Resume-code lookup is study-scoped (observation)

**Severity:** observation
**Status:** safe — lookup query joins on `Study.slug == slug`
**Files:** `backend/app/routers/participants.py:152-189`,
          `backend/app/resume_codes.py:649-680`,
          `backend/tests/security/wave_3/test_resume_code_scoping.py`
**Disposition:** false positive — even though codes are globally unique
in the DB, the lookup at `GET /api/study/{slug}/resume/{code}` filters
on both code AND study slug.

Concern: resume codes are short (~9M `adjective-noun-NNN` combinations
per language). A globally unguarded lookup
(`WHERE resume_code = :code`) would let an attacker harvest codes
belonging to participants of arbitrary studies — short codes plus a
rate-limited brute-force become realistic over a few thousand requests.

Reality: the resume handler joins `Participant` to `Study` and filters
`Participant.resume_code == code AND Study.slug == slug`. Cross-study
lookups return 404 even when the code is valid in some other study —
the URL contributes the slug, and there is no global enumeration oracle.
The uniqueness probe in `generate_unique_resume_code` is global by
necessity (it has to pick a DB-unique code), but it's not a lookup oracle:
it tells the *caller* whether the code is taken, never the participant.
The regression test exercises both directions plus a static check that the
handler source still contains `Study.slug == slug` — a future refactor that
drops the join would break the test.

## Resolved since prior

_Listed by Task 10 if any prior multi-tenant findings were closed by intervening commits._

## False positives — not filed
