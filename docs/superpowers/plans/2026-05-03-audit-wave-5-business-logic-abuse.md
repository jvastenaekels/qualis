# Audit Wave 5 — Business-Logic Abuse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the participant-facing and admin business-logic surface for abuse vectors that don't fall under prior waves: resume-code brute-force, draft-responses shared-device leakage, recruitment-link capacity bypass, test-run flag tampering, audio upload abuse (MIME / size / filename), submission idempotency, and the carry-over `/api/register` enumeration redesign (F-03-008). No mandatory code-reviewer gate (Wave 5 is not in waves 2/3/4).

**Architecture:** Per-flow targeted audits, similar shape to Wave 3's per-flow tasks. Each task: static read + black-box test + finding (or observation) in `06-business-logic-abuse.md` + regression test under `backend/tests/security/wave_5/`. F-06-NNN ID space.

**Tech Stack:** Existing Qualis stack; httpx for in-process abuse simulation.

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-05-03-comprehensive-security-audit-design.md` (Wave 5 section).
- **Carry-over:** **F-03-008** (`/api/register` body+status email enumeration). Source `03-auth-email-flows.md#f-03-008`. Wave 5 closes or formally defers it.
- **Prior waves:** F-01/F-02 (Wave 1), F-03 (Wave 2), F-04 (Wave 3), F-05 (Wave 4). Wave 5 uses **F-06-NNN**.

## Wave 5 scope (from spec)

1. Resume-codes brute-force / cross-study replay / TOFU.
2. Draft-responses isolation under shared-device scenarios.
3. Recruitment-quota bypass via concurrent requests (race on `quotas` row, OR capacity field on RecruitmentLink).
4. `is_test_run` impersonation (verify the field exists; check participant-controllability).
5. Audio-upload size/MIME/filename traversal/ownership.
6. Submission idempotency (double-submit, submit-on-behalf).
7. Export quotas where any.
8. F-03-008 registration enumeration redesign (carry-over).

Out of scope: auth-email (Wave 2), multi-tenant (Wave 3), consent (Wave 4), supply chain (Wave 6), threat model (Wave 7).

## File Structure

**Created:**
- `docs/audits/2026-05-03-comprehensive-security-audit/06-business-logic-abuse.md`
- `docs/audits/2026-05-03-comprehensive-security-audit/.raw/exploits/F-06-NNN.py` per blocker/major
- `backend/tests/security/wave_5/__init__.py`
- `backend/tests/security/wave_5/test_resume_code_brute_force.py`
- `backend/tests/security/wave_5/test_draft_responses_isolation.py`
- `backend/tests/security/wave_5/test_recruitment_capacity.py`
- `backend/tests/security/wave_5/test_test_run_flag.py`
- `backend/tests/security/wave_5/test_audio_upload_abuse.py`
- `backend/tests/security/wave_5/test_submission_idempotency.py`
- `backend/tests/security/wave_5/test_register_enumeration.py` (F-03-008)

**Modified (depending on findings):**
- `backend/app/resume_codes.py` if entropy/lookup needs hardening.
- `backend/app/routers/participants.py` (drafts) if shared-device leakage exists.
- `backend/app/services/recruitment_service.py` if capacity race exists.
- `backend/app/routers/audio.py` if MIME/size/filename validation has gaps.
- `backend/app/services/submission_service.py` if idempotency gaps exist.
- `backend/app/routers/auth.py` if F-03-008 redesign lands here.

**Branch:** `audit/5-business-logic-abuse` off `main`.

---

## Task 1: Scaffold

Same shape as prior waves. Wave doc skeleton at `06-business-logic-abuse.md`; tests dir; one commit.

---

## Task 2: Inventory the business-logic surface

**Files:**
- Modify: `06-business-logic-abuse.md` Inventory section.

For each in-scope flow, capture:
- Endpoint(s) involved.
- Inputs (path params, body, query, headers).
- DB writes / S3 writes.
- Auth model (JWT? session_token? unauthenticated?).
- Existing rate limits.

Specifically:
- **Resume-code:** entropy (digits/chars/length), lookup endpoint, brute-force protection (rate limit per code? per IP?). Read `backend/app/resume_codes.py` + the consume route at `participants.py`.
- **Draft-responses:** where stored, who can read, what `session_token` proves. Read `backend/app/routers/participants.py` `save_draft` + the resume flow.
- **Recruitment capacity:** `RecruitmentLink.capacity` field; how the consume endpoint enforces it. Race window? Read `backend/app/services/recruitment_service.py`.
- **Test-run flag:** does the field exist? Where? Who can set it? Search `grep -rn 'test_run\|is_test_run' backend/app/`. If absent, file as **n/a** (the migration may have been reverted or renamed).
- **Audio upload:** size limit, MIME allowlist, filename sanitisation. Read `backend/app/routers/audio.py` + storage_service.
- **Submission:** idempotency mechanism (unique constraint on participant+study? `session_token` check?). Read `backend/app/services/submission_service.py`.

Aim for 200-350 lines.

---

## Tasks 3-9: per-flow audits

Each task: static + dynamic + decide severity + fix-or-defer + regression test + finding section + commit.

### Task 3 — Resume-code brute-force / cross-study replay (F-06-001)

- **Verify entropy:** read the `generate_unique_resume_code` function. Code length? charset? collision probability?
- **Brute-force protection:** is the consume endpoint rate-limited? Per-IP? Per-code?
- **Cross-study replay:** Wave 3 F-04-004 already pinned that lookup is `Study.slug == slug AND resume_code == code`. Verify still true. If a code collision across studies exists, what happens?
- **TOFU (trust-on-first-use):** if I submit a resume_code I don't own (e.g., guessed), can I take over a session?
- **Severity:** likely **minor** if rate-limited + reasonable entropy; **major** if either is weak.
- **Test:** `backend/tests/security/wave_5/test_resume_code_brute_force.py`.

### Task 4 — Draft-responses isolation (F-06-002)

- **Threat model:** shared device (e.g., kiosk, family tablet). Participant A starts a Q-sort, walks away; Participant B opens the URL. Can B see A's draft_responses?
- **Static:** the resume URL likely embeds `session_token` or `resume_code`. Without one of those, what's the default state on `/study/{slug}/start`?
- **If the URL is bookmark-able and contains the session_token:** B clicking the URL gets A's draft. Filed as **observation** (it's a UX/operator-warning, not a Qualis bug).
- **If the URL doesn't carry the token but a cookie does:** check cookie scope (HttpOnly, SameSite, secure).
- **Severity:** usually **observation** (consent text already warns about completing the study in one session).
- **Test:** pin the cookie/URL contract.

### Task 5 — Recruitment capacity bypass (F-06-003)

- **Static:** read `recruitment_service.py`. The `RecruitmentLink.capacity` field caps participants per link. Is the consume flow check-then-insert or atomic?
- **TOCTOU race:** N concurrent participant joins on a link at capacity-1. Does the count slip past capacity?
- **Same shape as Wave 3 F-04-006 quota TOCTOU.** May share fix (SELECT FOR UPDATE on recruitment_links row).
- **Severity:** **minor** (operational; not a security boundary breach unless capacity is licensing-relevant — same logic as F-04-006).
- **Test:** static-pin the unguarded SQL pattern (in-process httpx can't simulate true concurrency on shared session).

### Task 6 — Test-run flag tampering (F-06-004)

- **First:** verify the field exists. `grep -rn 'test_run\|is_test_run' backend/app/`.
- **If absent:** file as **n/a** with rationale (migration may have been reverted or the feature is in a future PR).
- **If present:** identify how it's set. If a participant can flip it via request body / query param, this is a real finding (allows bypassing study quotas, recruitment caps, etc.).
- **Severity:** **major** if participant-controllable; **observation** if admin-only.
- **Test:** participant attempts to set `is_test_run=true`; assert ignored.

### Task 7 — Audio upload abuse (F-06-005)

- **Static:** `backend/app/routers/audio.py` validation. Allowlist MIME types? Size cap? Filename sanitisation?
- **The endpoint already validates content_type and file_size_bytes per Inventory.** Verify defensible:
  - MIME spoof: client lies about Content-Type. Server should sniff actual bytes (look for magic numbers).
  - Filename: does the server use the client's filename in any path? If so, traversal risk via `../`.
  - Size cap: hard cap from config? What's the value?
- **Black-box tests:**
  - Upload with `Content-Type: audio/webm` but bytes that are actually a PNG. Should be rejected (or accepted if the server only cares about the Content-Type for storage, and the bytes are fine on S3).
  - Upload a file at exactly the size cap; +1 byte. Verify rejection.
  - Upload with filename `../../../etc/passwd`. Verify the resulting S3 key has no `../`.
- **Severity:** **minor** unless any check is missing entirely.
- **Test:** `test_audio_upload_abuse.py`.

### Task 8 — Submission idempotency (F-06-006)

- **Static:** `submission_service.py`. Is there a unique constraint on `(participant_id, study_id)` or similar? What happens on a second submit attempt?
- **Threat:** participant submits twice → does the second submission overwrite the first? Both stored? An error returned?
- **Submit-on-behalf:** Wave 3 F-04-003 pinned that ownership is session_token-bound. So a participant can't submit on behalf of another. Verify still true.
- **Double-submit race:** N concurrent submit requests with the same session_token. Does the count match expected?
- **Severity:** likely **observation** (Wave 3 already pinned the ownership; idempotency is operational).
- **Test:** pin the existing behaviour.

### Task 9 — F-03-008 registration enumeration redesign (carry-over)

- **The original finding:** `POST /api/register` returns 400 "user already exists" for known emails vs 201 for new — leaks existence.
- **Fix shape:** return 200 always with a generic body, send distinct emails to existing-vs-new users (e.g., "you already have an account" vs verification link).
- **Stop criteria:** if the redesign requires changing the registration UX (waiting for email confirmation, etc.), defer to Wave 5b backlog. The backend-only half (always-200 response) can ship in this PR.
- **Recommendation:** do the backend half (uniform response), document the UX change as Wave 5b.
- **Severity:** stays **minor** (the original classification).
- **Test:** `test_register_enumeration.py` — assert response equality across known / unknown email arms.

---

## Task 10: Update action backlog

Mark all F-06-NNN entries closed/deferred. Mark F-03-008 closed with the Wave 5 SHA.

---

## Task 11: Final CI + push + PR

- `make ci` green.
- Push branch.
- Open PR titled `audit(wave-5): business-logic abuse`.
- **No code-reviewer gate required** (Wave 5 not in spec's gate list).

---

## Per-task discipline

Each finding-task ships: static analysis writeup → exploit script (blocker/major only) → fix (or defer) → regression test → wave doc finding → backlog entry → commit.

## Stop criteria

- Any finding requires a non-additive schema migration → defer to backlog.
- F-03-008 redesign frontend half → defer to Wave 5b.
- Test-run flag absent entirely → file as n/a, move on.

## Out of scope

- Wave 2-4 axes.
- Wave 6 (supply chain) — operational hygiene findings even if surfaced should be deferred to Wave 6.
- Wave 7 deliverables.

---

## Self-Review

Spec coverage check:
- ✅ Resume-codes brute-force / cross-study / TOFU → Task 3.
- ✅ Draft-responses shared-device → Task 4.
- ✅ Recruitment-quota bypass → Task 5.
- ✅ `is_test_run` impersonation → Task 6.
- ✅ Audio-upload size/MIME/filename → Task 7.
- ✅ Submission idempotency → Task 8.
- ✅ Export quotas → noted under Task 5 (recruitment capacity is the only quota-shaped concept) — if a separate export-quota mechanism exists it's probably out of scope (no evidence it's implemented).
- ✅ F-03-008 carry-over → Task 9.

ID-space consistency: F-06-NNN. No collisions.

## Execution Handoff

**Plan complete.** Subagent-driven recommended. No mandatory code-reviewer gate per spec (Wave 5 not in gate list).
