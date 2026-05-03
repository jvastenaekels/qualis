# Audit Wave 3 — Multi-Tenant Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify that no admin endpoint, no business-logic flow (recruitment tokens, audio uploads, resume codes, bulk export, quotas), and no migration leaves a path by which a member of Project A can read or write Project B's data. Highest-blast-radius wave; mandatory code-reviewer gate.

**Architecture:** A parametrised cross-tenant IDOR harness is the central deliverable: for every endpoint under `/api/admin/**`, it constructs a "Project A member tries to act on Project B's resource" request and asserts denial. The harness is shipped to `backend/tests/security/wave_3/test_admin_idor_harness.py` and produces a coverage matrix (route × isolation-class). Findings are filed for any endpoint where the harness PRE-FIX detects access leakage. Business-logic flows that don't fit the admin-route harness shape (recruitment, audio, resume codes, exports, quotas) get focused per-flow tasks.

**Tech Stack:** FastAPI + SQLAlchemy async; pytest + httpx ASGITransport for in-process exploit harness; existing `seed_user_with_2fa`-style fixtures (Wave 2 conventions).

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-05-03-comprehensive-security-audit-design.md` (Wave 3 section).
- **Prior waves:** Wave 1 (`docs/audits/2026-05-03-comprehensive-security-audit/01-prior-findings-status.md`, `02-scanner-pass.md`); Wave 2 (`03-auth-email-flows.md`).
- **No carry-overs scheduled for Wave 3** in `99-action-backlog.md` — this wave is fresh ground.

## Wave 3 scope (from spec)

Files in scope:

- `backend/app/routers/admin/` — 12 modules, ~89 endpoints by initial count.
- `backend/app/services/quotas.py` (104 LOC).
- `backend/app/dependencies.py` (305 LOC) — `require_project_role`, `get_current_user`, project membership lookup.
- `backend/db_migrations/versions/cb2c7f6f0cfe_rename_researcher_to_member_and_owner_*.py` (understand the prior bug it patched).
- Adjacent business-logic flows: `app.routers.audio`, `app.routers.participants`, `app.services.export_service`, `app.routers.recruitment` if it exists.

Out of scope: auth-email flows (Wave 2), consent/anonymisation pipeline (Wave 4), supply chain (Wave 6).

## Finding ID space

This wave's findings use `F-04-NNN` (Wave 1 used F-01/F-02; Wave 2 used F-03; Wave 3 = F-04). Tasks 5-9 may produce findings in the F-04-NNN space; the harness in Tasks 3-4 produces a single `F-04-001` covering all per-route IDOR results, OR per-route findings if leakage spans multiple endpoints with different fix shapes.

## File Structure

**Created:**

- `docs/audits/2026-05-03-comprehensive-security-audit/04-multi-tenant-isolation.md` (wave doc).
- `docs/audits/2026-05-03-comprehensive-security-audit/.raw/exploits/F-04-NNN.py` (one per blocker/major).
- `backend/tests/security/wave_3/__init__.py`
- `backend/tests/security/wave_3/conftest.py` — fixtures for two seeded projects (A, B) with members in each.
- `backend/tests/security/wave_3/test_admin_idor_harness.py` — parametrised harness.
- `backend/tests/security/wave_3/test_recruitment_token_replay.py`
- `backend/tests/security/wave_3/test_audio_upload_ownership.py`
- `backend/tests/security/wave_3/test_resume_code_scoping.py`
- `backend/tests/security/wave_3/test_export_filter.py`
- `backend/tests/security/wave_3/test_quota_concurrency.py`

**Modified (depending on findings):**

- Any admin router that fails the harness (likely candidates: any endpoint that takes a study_id / participant_id / concourse_id without scoping the lookup by project).
- `backend/app/services/quotas.py` if the concurrency race is real.
- `backend/app/dependencies.py` if a missing membership check is found.

**Branch:** `audit/3-multi-tenant-isolation` off `main`.

---

## Task 1: Scaffold Wave 3

**Files:**
- Create: `docs/audits/2026-05-03-comprehensive-security-audit/04-multi-tenant-isolation.md` (skeleton).
- Create: `backend/tests/security/wave_3/__init__.py`.

- [ ] **Step 1.1: Confirm branch.** `git rev-parse --abbrev-ref HEAD` → `audit/3-multi-tenant-isolation`. Worktree set up by controller.
- [ ] **Step 1.2: Wave doc skeleton** with the same shape as `03-auth-email-flows.md`: header (with HEAD short SHA), Scope, Inventory placeholder, Summary count table, Findings placeholder, Resolved-since-prior placeholder, False-positives placeholder. Use the wave-2 doc as the structural template.
- [ ] **Step 1.3: Create test dir.** `mkdir -p backend/tests/security/wave_3 && touch backend/tests/security/wave_3/__init__.py`.
- [ ] **Step 1.4: Commit.**

```bash
git add docs/audits/2026-05-03-comprehensive-security-audit/04-multi-tenant-isolation.md \
        backend/tests/security/wave_3/__init__.py
git commit -m "$(cat <<'EOF'
audit(wave-3): scaffold multi-tenant isolation wave

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Inventory the admin surface

**Files:**
- Modify: `04-multi-tenant-isolation.md` Inventory section.

This is orientation, not findings. Output: a comprehensive table mapping every `/api/admin/**` endpoint to its membership/role requirement and project-scoping mechanism.

- [ ] **Step 2.1: Enumerate every admin endpoint.**

```bash
grep -nE '@router\.(get|post|put|patch|delete)' backend/app/routers/admin/*.py
```

For each endpoint, capture:
- HTTP method + path.
- Path parameters (`{project_id}`, `{study_id}`, `{participant_id}`, etc.).
- The `Depends(...)` chain (especially `require_project_role(role)` calls).
- The DB query in the handler (does it filter by `project_id`? By the path's project_id specifically?).

- [ ] **Step 2.2: Categorise endpoints by isolation pattern.**

Three patterns:
- **A. Project-scoped via path** — `/api/admin/projects/{project_id}/...`. `require_project_role` runs against the path's `project_id`. Cross-tenant access only possible if `require_project_role` itself is broken.
- **B. Object-scoped via path** — `/api/admin/studies/{study_id}/...`. Handler must look up the study's project, then check membership. **Highest-risk pattern** because the project-id is implicit.
- **C. Top-level enumeration** — `/api/admin/projects` (list), `/api/admin/users` (list). Must filter by membership.

Place every endpoint into one of these buckets. Endpoints that don't fit any of the three are red flags — file as observations during inventory if you see them.

- [ ] **Step 2.3: Read `dependencies.py:170` (`require_project_role`).**

Capture the implementation in the wave doc: how does it find the project, look up membership, decide ALLOW/DENY? Note the role hierarchy (owner > member > viewer? Some other ordering?). Note any short-circuits (super-admin? service token?).

- [ ] **Step 2.4: Read the prior migration `cb2c7f6f0cfe_rename_researcher_to_member_and_owner_*.py`.**

It renames `researcher` → `member` and adds an owner-uniqueness constraint. Capture: what was the prior bug? (Probably duplicate owners or a role-name confusion.) Note in the wave doc.

- [ ] **Step 2.5: Inventory section.**

Write a table with columns: `Method | Path | Pattern (A/B/C) | role_dep | Project-scoping mechanism | Notes`. Aim for ~89 rows. Group by source file for readability.

- [ ] **Step 2.6: Commit.**

```bash
git commit -am "$(cat <<'EOF'
audit(wave-3): inventory admin endpoint surface (89 routes)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Build the parametrised cross-tenant IDOR harness

**Files:**
- Create: `backend/tests/security/wave_3/conftest.py` — fixtures for two-project tenancy.
- Create: `backend/tests/security/wave_3/test_admin_idor_harness.py`.

The harness is the central deliverable. It parametrises over every admin endpoint and asserts cross-tenant denial. Pre-fix, it produces a list of leaks. Post-fix, it's the regression test.

- [ ] **Step 3.1: Conftest fixtures.**

Two project tenancies:

```python
# fixtures provide:
#   project_a_owner    - User who owns project_a
#   project_a_member   - User who is a `member` (formerly `researcher`) in project_a
#   project_a_viewer   - User who is a `viewer` in project_a
#   project_b_owner    - similar for project_b
#   project_b_member
#   project_b_viewer
#   token_a_owner / token_a_member / token_a_viewer / token_b_*  (JWT strings)
#   project_a, project_b  (model instances with .id attributes)
#   study_in_a, study_in_b
#   participant_in_a, participant_in_b
#   concourse_in_a, concourse_in_b
#   memo_in_a, memo_in_b  (if applicable)
```

Each project has at least one of each domain object so the harness has cross-project IDs to swap.

- [ ] **Step 3.2: Endpoint inventory data.**

In a Python list at the top of `test_admin_idor_harness.py`, encode each admin endpoint as a tuple:

```python
ROUTES = [
    # (method, path_template, isolation_pattern, expected_status_for_cross_project_call)
    # Path templates use {project_b_id}, {study_in_b_id}, etc. — fixtures fill them in.
    ("GET", "/api/admin/projects/{project_b_id}", "A", 403),
    ("GET", "/api/admin/projects/{project_b_id}/studies", "A", 403),
    ("GET", "/api/admin/studies/{study_in_b_id}", "B", 403),
    # ... ~89 rows
]
```

The list is mechanical to populate from Task 2's inventory. Generate it programmatically if helpful (regex over router files).

For mutating endpoints (POST/PUT/PATCH/DELETE), include a minimal valid body. If the body itself requires cross-project IDs, the test asserts on the response status before the body's content is even validated.

- [ ] **Step 3.3: The parametrised test.**

```python
@pytest.mark.asyncio
@pytest.mark.parametrize("method,path_template,pattern,expected_status", ROUTES)
async def test_project_a_member_cannot_access_project_b_resource(
    method, path_template, pattern, expected_status,
    fixtures, ...
):
    # Format the path template using project B's IDs
    path = path_template.format(
        project_b_id=fixtures.project_b.id,
        study_in_b_id=fixtures.study_in_b.id,
        # etc.
    )
    headers = {"Authorization": f"Bearer {fixtures.token_a_member}"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.request(method, path, headers=headers, json=DUMMY_BODY)
    assert response.status_code in (403, 404), (
        f"Cross-tenant access leak: {method} {path} returned {response.status_code} "
        f"(pattern {pattern})"
    )
```

(403 OR 404 are both acceptable denial-shapes — endpoints that 404 don't leak existence either.)

- [ ] **Step 3.4: Run the harness.**

```bash
cd backend && .venv/bin/pytest tests/security/wave_3/test_admin_idor_harness.py -v 2>&1 | tee /tmp/wave3-harness.log
```

Read the log. Tests that **fail** (return 200, 201, 204) are leakage findings.

- [ ] **Step 3.5: Capture the results table.**

Add to `04-multi-tenant-isolation.md` an Inventory subsection "## Cross-tenant access matrix" with a table: `Endpoint | Pattern | Result (passed/failed) | If failed: returned status | Severity`.

- [ ] **Step 3.6: Commit (harness only — no fixes yet).**

```bash
git commit -am "$(cat <<'EOF'
test(security): parametrised cross-tenant IDOR harness over admin routes

Tests pre-fix; failures filed as findings in Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Triage and remediate harness findings

**Files (depending on findings):**
- Modify: any admin router with leakage; `dependencies.py` if `require_project_role` itself has gaps.
- Modify: `04-multi-tenant-isolation.md` Findings section.
- Create: `.raw/exploits/F-04-NNN.py` per blocker/major.

For each FAIL in the harness, decide:

- **Single-route leak** → file F-04-NNN, fix in the handler.
- **Pattern-wide leak** (e.g., every Pattern-B endpoint that looks up by `study_id` without re-checking project) → file ONE finding F-04-NNN with a list of affected routes; fix at the dependency or service layer.
- **Dependency-layer leak** (`require_project_role` itself broken) → BLOCKER. Single finding, single fix, all routes covered automatically.

Severity guide:
- Read access leak (GET → 200 with project B data): **major**.
- Write/delete access leak (POST/PUT/DELETE → 200/204 modifying project B): **blocker**.
- Existence-disclosure-only (404 vs 403 differentiation that lets attacker enumerate): **minor**.

For each filed finding:
1. Exploit script (.py under `.raw/exploits/`) demonstrating the leak — for blocker/major.
2. Fix in code.
3. Re-run harness; the previously-failing parametrised case now passes.
4. Commit.

- [ ] **Step 4.1: Triage failures.** Group failures by fix shape (single-route vs pattern-wide vs dep-layer).
- [ ] **Step 4.2: Per finding: write exploit, fix, regression test, wave-doc section.**
- [ ] **Step 4.3: Re-run harness end-to-end; expect all passing.**
- [ ] **Step 4.4: Update wave doc Summary table and backlog.**

If the harness reveals zero failures, that's a strong signal the existing `require_project_role` machinery is doing its job. File **F-04-001** as **observation** with disposition `false positive — every admin endpoint passes harness; no leakage detected`. Still ship the harness as a regression test (high value as a CI guard against future regressions).

---

## Task 5: Recruitment-token replay across studies

**Files:**
- Modify: `04-multi-tenant-isolation.md`.
- Modify (if finding): recruitment-token issuance / consumption code.
- Create: `backend/tests/security/wave_3/test_recruitment_token_replay.py`.

Recruitment tokens are short-lived links to participate in a study. Concern: can a token issued for Study X (in Project A) be replayed against Study Y (in Project B or even the same project)?

- [ ] **Step 5.1: Locate the recruitment token issue and consume code.** Likely `backend/app/routers/recruitment.py` (3 endpoints) and `backend/app/services/recruitment_service.py`.
- [ ] **Step 5.2: Static analysis.** Does the consume endpoint check that the token's claimed study_id matches the URL's study_id? Or does it accept any token regardless of study?
- [ ] **Step 5.3: Black-box test.** Issue a token for Study A; submit it to Study B's consume endpoint; assert rejection.
- [ ] **Step 5.4: If the token is project-scoped or study-scoped already, file as observation.** If not, file as **major** (cross-study participation leak; can pollute Study B's participant pool with Study A's intended participants).
- [ ] **Step 5.5: Fix + regression test + commit.**

---

## Task 6: Audio-upload ownership-claim tampering

**Files:**
- Modify: `04-multi-tenant-isolation.md`.
- Modify (if finding): `backend/app/routers/audio.py`, possibly `backend/app/services/storage_service.py`.
- Create: `backend/tests/security/wave_3/test_audio_upload_ownership.py`.

Concern: a participant uploads audio claiming to belong to Participant X (in Study Y). Is the participant_id taken from the request body (untrusted) or derived from the authenticated session (trusted)?

- [ ] **Step 6.1: Read `audio.py` upload routes.** Identify how participant_id is determined.
- [ ] **Step 6.2: If body-derived, build exploit:** authenticate as Participant A in Study A, upload audio claiming Participant B (different study, possibly different project). Assert rejection.
- [ ] **Step 6.3: If session-derived, file as observation:** the threat model excludes this attack by construction.
- [ ] **Step 6.4: Also check the S3 key naming.** Does the key include the project_id, study_id, participant_id? If only participant_id, an attacker who knows another participant's UUID across projects could potentially read/overwrite. File as **minor** if so.
- [ ] **Step 6.5: Fix + regression test + commit.**

---

## Task 7: Resume-code lookup scoping

**Files:**
- Modify: `04-multi-tenant-isolation.md`.
- Modify (if finding): `backend/app/resume_codes.py` and the route that consumes resume codes.
- Create: `backend/tests/security/wave_3/test_resume_code_scoping.py`.

Resume codes let a participant return to an in-progress Q-sort. Concern: does the code lookup return any participant globally, or is it scoped by study/project?

- [ ] **Step 7.1: Read `resume_codes.py`.** Inspect the lookup function: does it `WHERE code = ?` only, or `WHERE code = ? AND study_id = ?`?
- [ ] **Step 7.2: If global lookup, file as major.** Resume codes are typically 6-8 characters; collision across studies is realistic. A participant who wandered into Study B's URL with Study A's resume code could end up resuming Study A's session in Study B's UI.
- [ ] **Step 7.3: Fix:** scope lookup by `study_id` (which the URL provides). Add an index on `(study_id, code)` if not present.
- [ ] **Step 7.4: Regression test + commit.**

---

## Task 8: Bulk-export filter correctness

**Files:**
- Modify: `04-multi-tenant-isolation.md`.
- Modify (if finding): `backend/app/services/export_service.py`, `backend/app/routers/admin/exports.py`.
- Create: `backend/tests/security/wave_3/test_export_filter.py`.

Export endpoints stream large datasets (CSV, XLSX, ZIP). Concern: does the export's data filter actually scope to the project the requestor has access to?

- [ ] **Step 8.1: Read `export_service.py`.** For each export type, identify the SQL query: does it `WHERE project_id IN (<member's projects>)` or `WHERE project_id = <path's project_id>`?
- [ ] **Step 8.2: If the filter is path-derived, the harness in Task 3 already covered it.** If it's based on a header / query param / request body field instead of the path, manual test: an Owner of Project A submits an export request with a body claiming `project_id = <project_b_id>`. Assert rejection.
- [ ] **Step 8.3: File finding if leakage found.** Severity: **blocker** (data exfil at scale) if export contains participant PII.
- [ ] **Step 8.4: Fix + regression test + commit.**

---

## Task 9: Quota state consistency under concurrent member-add

**Files:**
- Modify: `04-multi-tenant-isolation.md`.
- Modify (if finding): `backend/app/services/quotas.py`.
- Create: `backend/tests/security/wave_3/test_quota_concurrency.py`.

`MAX_MEMBERS_PER_PROJECT` is enforced via `quotas.py`. Concern: under N concurrent invitation-accepts, does the quota slip past the cap (e.g., 3 simultaneous accepts on a project at 4/5 members → 7/5)?

- [ ] **Step 9.1: Read `quotas.py`.** Is the count check inside a serialized transaction? Or is it `SELECT count → if < cap then INSERT`?
- [ ] **Step 9.2: If TOCTOU race exists, write exploit script** that fires N=20 concurrent invitation-accepts on a project at quota-1; asserts post-state count == quota (not quota+19).
- [ ] **Step 9.3: Fix:** wrap in `SELECT ... FOR UPDATE` on the project row, OR add a unique-constraint trigger that enforces the cap at INSERT time (DB-side).
- [ ] **Step 9.4: Severity:** **minor** (operational concern; not a security boundary breach) unless the cap is quota-related to billing or licensing in which case **major**.
- [ ] **Step 9.5: Regression test + commit.**

---

## Task 10: Update action backlog

- [ ] **Step 10.1:** Mark all F-04-NNN entries closed/deferred under `## Wave 3` of `99-action-backlog.md`.
- [ ] **Step 10.2:** Add any deferred items (e.g., observations that should be tracked in Wave 6 or backlog).
- [ ] **Step 10.3: Commit.**

---

## Task 11: Final CI + push + PR + code-reviewer gate

- [ ] **Step 11.1:** `make ci` green.
- [ ] **Step 11.2:** Push branch `audit/3-multi-tenant-isolation`.
- [ ] **Step 11.3:** `gh pr create --title "audit(wave-3): multi-tenant isolation deep dive"` with body summarising findings + harness coverage + closed/deferred counts.
- [ ] **Step 11.4: Dispatch `superpowers:code-reviewer` (Opus)** with brief: the wave doc, the diff, all exploit scripts, the harness file, and an explicit ask: *"This wave audits 89 admin endpoints. Is the harness's coverage complete? Are there routes the inventory missed? Is the cross-tenant fixture realistic enough?"*. The reviewer is the gate before merge.

---

## Per-task discipline (applies to Tasks 4-9)

Each finding-task ships:
1. Static analysis writeup in the wave doc.
2. Exploit script (blocker/major) under `.raw/exploits/`.
3. Fix in code.
4. Regression test under `backend/tests/security/wave_3/`.
5. Wave doc finding section (eight-field schema).
6. Backlog entry (closed in commit `<sha>` or deferred).
7. Commit per finding (or per fix-shape if multiple findings share a fix).

## Stop criteria

- The harness in Task 3 reveals >10 leakage findings → **escalate before fixing**. The shape of the fix is likely at the dep-layer; we shouldn't patch 10 routes individually.
- A finding requires a schema migration beyond simple index addition → defer to Wave 6 backlog with rationale.
- The `require_project_role` itself is broken in a way that requires architectural redesign → **escalate**, propose a Wave 3b PR.

## Out of scope

- Auth-email flows (Wave 2, done).
- Consent / anonymisation pipeline (Wave 4).
- Dependency CVEs (Wave 6).
- Threat model / SECURITY.md / GDPR memo (Wave 7).
- The recruitment routes' OWN auth flow if recruitment uses a separate JWT (Wave 5 territory if it surfaces).

---

## Self-Review

Spec coverage check (against `2026-05-03-comprehensive-security-audit-design.md`, Wave 3 section):

- ✅ For every admin endpoint: IDOR via path-param swap → Task 3 (harness) + Task 4 (triage).
- ✅ Cross-project enumeration via list endpoints → Task 3 (covered by harness for list endpoints).
- ✅ Recruitment-token replay across studies → Task 5.
- ✅ Audio-upload ownership-claim tampering → Task 6.
- ✅ Resume-code lookup scoping (global vs study-scoped) → Task 7.
- ✅ Bulk-export filter correctness → Task 8.
- ✅ Quota state consistency under concurrent member-add → Task 9.
- ✅ Code-reviewer (Opus) gate before merge → Task 11.

ID-space consistency: F-04-NNN starts at 001. No collisions with prior waves' F-01/F-02/F-03 spaces.

Placeholder scan: `<HEAD short SHA>`, `<sha>`, `<NN-NN>`, `<one-line evidence>` are designed-in slots filled by implementer at runtime, not unfilled plan content.

## Execution Handoff

**Plan complete.** Two execution options as before — recommended **subagent-driven** with full 3-agent gate on findings that change auth-layer code.
