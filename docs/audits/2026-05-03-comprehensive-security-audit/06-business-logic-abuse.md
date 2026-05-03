# Wave 5 — Business-Logic Abuse

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `bde2496a` of `audit/5-business-logic-abuse`

## Scope

Per-flow audits across:
- Resume-code brute-force / cross-study replay / TOFU
- Draft-responses isolation under shared-device scenarios
- Recruitment capacity race
- `is_test_run` flag tampering
- Audio upload abuse (size / MIME / filename traversal)
- Submission idempotency (double-submit, submit-on-behalf)
- F-03-008 carry-over (`/api/register` body+status enumeration redesign)

Wave 5 uses **F-06-NNN** ID space.

No mandatory code-reviewer gate per spec.

## Inventory

Static read of every flow named in the Wave 5 scope. File:line refs anchor each
claim against the auditor's commit (`bde2496a`). All routers below are mounted
in `backend/app/main.py:164-200`; the participant-facing routes carry the
`/api/study/{slug}` prefix unless noted. Default rate-limit key is per-IP
(`backend/app/limiter.py:100-106`, `key_func=_get_real_ip`); none of the routes
listed here use a per-user / per-token key. Wave 5 does not introduce changes
on its own — Tasks 3-9 will propose them.

### Resume-code (F-06-001 surface)

**Endpoint.** `GET /api/study/{slug}/resume/{code}` →
`participants.resume_session` (`backend/app/routers/participants.py:221-282`).

**Inputs.**
- Path: `slug` (study slug), `code` (max length 60, regex `^[a-zA-Z0-9-]+$`,
  lower-cased server-side at line 240).
- No body, no query, no auth header — fully public.

**Code generation.** `_generate_code` in `backend/app/resume_codes.py:640-646`
returns `<adj>-<noun>-<NNN>` where NNN ∈ [100, 999]. Word lists at
lines 19-637: ~100 adjectives × ~100 nouns per locale (en, fr, fi). Search
space per locale ≈ 100 × 100 × 900 = **9 × 10⁶** codes — the docstring at line
659 calls this "~9M combinations". Charset: ASCII lowercase letters + dashes
+ digits, never accented (deliberate so URLs need no percent-encoding,
line 4-6). On collision after `max_attempts=5` random draws,
`generate_unique_resume_code` (lines 649-680) appends a 4-digit suffix
(`brave-tiger-427-3812`); persistence is bound by a unique constraint on
`participants.resume_code` (`backend/app/models/participant.py:60-62`,
`String(50), unique=True, nullable=True`).

**Lookup query.** When `code` does not match the legacy UUID regex, the
handler runs `WHERE Participant.resume_code == code AND Study.slug == slug`
(line 250-254). Cross-study replay therefore returns 404 — Wave 3 F-04-004
already pinned this and is **still true** at this commit. The legacy-UUID
branch (line 243-248) accepts a session-token UUID as a code; same
study-slug filter applies.

**Brute-force protection.** `@limiter.limit("30/minute")` (line 222) keyed
per-IP; the limiter is wired through slowapi's `_get_real_ip`. **There is no
per-code lockout, no exponential back-off, and no global cap.** A distributed
brute-forcer paying out across IPs is unbounded by this layer. Combined with
9 × 10⁶ entropy per locale, the cost to enumerate is non-trivial but not
cryptographic; Task 3 will quantify.

**TOFU.** A correct guess returns `session_token`, `last_step_reached`,
`draft_responses`, and `resume_code` itself (`ResumeResponse`, line 276-282).
The `session_token` is then sufficient to act as the participant for all
write routes below. There is no "first-use binds device" check.

**State gates.** Completed sessions return 410 "Session already completed"
(line 262-265). The handler comment at line 264 acknowledges the minor
enumeration oracle (a 410 vs 404 disclosure that the code corresponds to a
finished participant) and accepts it because codes are rate-limited.

### Draft-responses (F-06-002 surface)

**Endpoint.** `PUT /api/study/{slug}/save-draft` →
`participants.save_draft` (`backend/app/routers/participants.py:108-149`),
plus the resume endpoint above (which returns `draft_responses`) and
`DELETE /api/study/{slug}/draft` →
`participants.withdraw_draft` (lines 152-218).

**Inputs.**
- Path: `slug`.
- Body (`DraftSaveInput`): `session_token` UUID, `draft_responses` JSON dict.
- Query (`withdraw_draft`): `session_token` UUID.

**Auth model.** Pure session-token bearer. The lookup at line 119-123 is
`WHERE Participant.session_token == data.session_token AND Study.slug == slug`
under `with_for_update()`. Whoever holds the token writes the draft. There
is no cookie-, JWT-, or device-binding layer; the token is conveyed in the
JSON body for save and in the query string for withdraw.

**Where stored.** `Participant.draft_responses` is a nullable JSON column
(`backend/app/models/participant.py:96`). One row per participant. The save
handler overwrites the column wholesale (line 146); a defensive pop strips
`rough` slices when `study.rough_sort_enabled` is False (line 142-144).

**State gates.** Save rejects with 410 if `participant.status !=
ParticipantStatus.started` (line 132-133) and with 403 if `study.state !=
StudyState.active` (line 135-138).

**What the session_token proves.** Possession of the token = the right to
read the draft (via `/resume/{code}` returning a UUID code, or via the
session_token route in the legacy UUID-code branch) and to overwrite it.
The token itself is generated as `default=uuid4` (`participant.py:44`,
`session_token: Mapped[UUID] = mapped_column(unique=True, index=True,
default=uuid4)`) — 122 bits of entropy, indexed and unique. **Shared-device
threat:** if a participant leaves the resume URL on screen / in browser
history, the next user can both read the draft (via resume) and
overwrite/delete it. This is the surface Task 4 will pin as observation
(consent text already warns about "complete in one session").

**Rate limits.** `save_draft` 120/minute, `withdraw_draft` 10/minute,
`resume_session` 30/minute — all per-IP.

### Recruitment capacity (F-06-003 surface)

**Files.** `backend/app/services/recruitment_service.py:14-146` (service);
`backend/app/services/submission_service.py:312-400` (consume call site);
`backend/app/routers/submissions.py:73-121` (`get_study` records start;
no capacity check there).

**Schema.** `RecruitmentLink.capacity` is nullable; populated on `create_links`
only when `type != public` (`recruitment_service.py:43`). `usage_count` and
`start_count` are companion counters.

**Validation flow.** `validate_link_token`
(`recruitment_service.py:126-146`) checks study match, `is_active`, expiry —
**but explicitly does not check capacity** (comment at line 143-144: "Capacity
is enforced atomically in `increment_usage()` under a row-level lock, so we
don't check it here (avoids TOCTOU race)").

**Atomic capacity gate.** `increment_usage`
(`recruitment_service.py:84-108`) runs `SELECT ... WHERE id = link_id FOR
UPDATE`, then `if link.capacity is not None and link.usage_count >=
link.capacity: return False`, then `link.usage_count += 1` and `flush()`.
This is the canonical SELECT-FOR-UPDATE pattern; under PostgreSQL's row-level
lock, a concurrent caller blocks until the first commits, so the capacity
guard cannot slip. **However, the SELECT-FOR-UPDATE is only effective if the
caller commits the surrounding transaction.** Inspection of the only consumer
(`submission_service.py:374-380`, inside `_find_or_create_participant`) shows
it does flush within the outer submission transaction; the router commits at
`backend/app/routers/submissions.py:48`. No raw check-then-insert variant
exists. Task 5 will pin this finding likely as **clean / observation**.

**Note re: `record_start`** (`recruitment_service.py:111-123`) — increments
`start_count` without a capacity gate. Intentional: a "start" tracks landing
on the study page and should not consume capacity until the participant
actually submits. Not an abuse vector.

### Test-run flag (F-06-004 surface) — **n/a**

`grep -rn 'test_run\|is_test_run' backend/app/` returns **zero hits**. The
column was added by migration `a64b4724fcb8` and dropped by migration
`b3a47d8e9f12` (`backend/db_migrations/versions/b3a47d8e9f12_drop_participants_is_test_run.py`),
which deletes legacy `is_test_run=TRUE` rows then drops the column. The
remaining hits are:
- `backend/vulture_whitelist.py:99` — `clear_test_runs` whitelist entry
  (vestigial, no live code path).
- `frontend/src/pages/admin/StudyDesignPage.tsx:245-257` and the matching
  hook at `frontend/src/hooks/admin/useStudyDesignPage.ts:560-573` — a
  frontend-only "preview" button that opens `/study/{slug}?mode=test` in a
  new tab and dumps draft + config to `localStorage`. **Never touches the
  backend.** The participant flow has no `?mode=test` branch on the
  server-side, and there is no `is_test_run` field anywhere on the
  Participant model (`backend/app/models/participant.py:35-119`).

Task 6 disposition: **n/a** (no backend column, no participant-controllable
flag). Will be filed as the n/a case the plan anticipates.

### Audio upload (F-06-005 surface)

**Endpoint.** `POST /api/audio/upload` →
`audio.upload_audio` (`backend/app/routers/audio.py:89-231`).
Companion routes: `DELETE /api/audio/{recording_id}` (lines 234-286),
`GET /api/audio/{recording_id}/url` (lines 289-334).

**Inputs.** Multipart form: `file` (UploadFile), `session_token` UUID,
`question_key` str, `duration_seconds` float | None. `question_key` is
restricted at the router with `re.match(r"^[a-zA-Z0-9_-]+$", ...)`
(line 115-116) and re-sanitised by `_sanitise_question_key` in the storage
layer (`backend/app/services/storage_service.py:39-51`, regex
`[^A-Za-z0-9._-]+` collapsed to `_`, truncated to 80 chars).

**Auth model.** Session-token bearer (no JWT). Ownership is fetched via
`Participant.session_token == session_token` join (line 122-126); Wave 3
F-04-003 already pinned the no-`participant_id`-claim shape.

**Size cap.** `validate_audio_file` (line 25-53) reads the entire content
into memory and rejects with 413 if `len(content) > AUDIO_MAX_FILE_SIZE_MB
× 1024 × 1024`. Default value is **10 MB**
(`backend/app/core/config.py:108`). Read-then-check pattern: a 1 GB upload
will be fully buffered in memory before rejection — operational concern
more than a security one (slowapi caps to 10/minute and the OS will OOM-kill
before disk fills, but not graceful).

**MIME allowlist.** `audio/webm`, `video/webm`, `audio/mp4`, `audio/mpeg`
(`config.py:110-112`). The check at `audio.py:45-50` uses
`magic.from_buffer(content, mime=True)` — **bytes-vs-content-type sniff is
done.** A client-supplied `Content-Type: audio/webm` with PNG bytes will
fail the magic check and be rejected with 400. Later, the upload itself
uses `file.content_type or "audio/webm"` for the S3 ContentType
(line 175) — this mirrors the client header but doesn't re-validate against
sniffed MIME, so the stored `mime_type` may differ from the on-disk magic
result. Task 7 will note: the gate is at validation; what's saved to S3 is
the client claim. Whether that matters depends on how playback handles
mismatch; the magic-sniffed value is dropped after validation.

**Filename sanitisation.** **The original UploadFile.filename is never
incorporated into the S3 key.** The S3 key (`storage_service.py:162-166`)
is constructed from `audio/{prefix}/{timestamp}_{safe_question_key}{ext}`
where `prefix` is the 32-char hex hash of `(study_slug, participant_token,
salt)` (`_hashed_audio_prefix`, lines 54-82) and the extension is mapped
from MIME (`_get_extension`, lines 298-315, with a `.webm` default). Path
traversal via `../` in the original filename is structurally impossible
because the filename is dropped.

**Bytes-vs-MIME spoof.** Covered by `magic.from_buffer` above; this is the
bytes sniff Task 7 wants verified.

**Other gates** (likely fine, listed for completeness): study state ==
active (line 134-138), `participant.submitted_at` is None (line 141-142),
audio enabled either globally for the study or per-text-audio-question
(line 144-159), duration ≤ `max_duration_seconds` (default 600s,
config 300s — note discrepancy at line 162 vs config default at
`config.py:109`), storage quota check (`check_storage_quota`, lines 56-86,
default 100 MB per study via `study.postsort_config["audio"]
["max_storage_mb"]`).

**Rate limit.** `@limiter.limit("10/minute")` (line 90), per-IP.

### Submission idempotency (F-06-006 surface)

**Endpoint.** `POST /api/submit` → `submissions.submit_study`
(`backend/app/routers/submissions.py:26-70`) → delegates to
`StudyService.process_submission` →
`SubmissionService.process_submission`
(`backend/app/services/submission_service.py:495-583`).

**Inputs.** Body (`SubmissionInput`): `study_slug`, `session_token`,
`language_used`, `qsort` list, `presort_answers`, `postsort_answers`,
`status`, optional `link_token`. No path or query args; no auth header.

**Auth / ownership.** Session-token bearer. Lookup at
`_find_or_create_participant` (lines 333-339) is `SELECT * FROM participants
WHERE session_token = data.session_token FOR UPDATE`. The integrity check
at line 341-342 raises `ValidationError` if the token belongs to a
different study — i.e. you cannot submit-on-behalf via a token issued for
another study, and you cannot reassign a token across studies. The Wave 3
plan text refers to F-04-003 for this guarantee; that finding actually
covers the **audio** ownership shape (session_token-bound, no
participant_id body claim). The submission shape uses the same
session_token-only bearer model — ownership claim integrity holds for
Wave 5's purposes, just under a different prior-finding ID.

**Idempotency mechanism.**
1. **Unique constraint:** `participants.session_token` is `unique=True`
   (`backend/app/models/participant.py:44`). A double-insert on the same
   token raises `IntegrityError` and is handled at lines 383-393: rollback,
   re-fetch existing row, return it (no duplicate row).
2. **Already-completed short-circuit:** `_update_existing_participant`
   (lines 402-458) returns `{"already_submitted": True, ...}` (line
   425-431) without touching `qsort_entries` if the participant is already
   `ParticipantStatus.completed`. **The router surfaces this via
   `already_submitted=True` in the response** (`submissions.py:53`).
3. **Re-submit before complete:** if a participant has saved a partial
   sort and submits again before completing, the existing Q-sort entries
   are deleted and replaced (`_update_existing_participant`, lines
   454-457: `DELETE FROM qsort_entries WHERE participant_id = …`, then
   `_persist_qsort_entries` re-inserts).
4. **Concurrent double-submit:** the `SELECT ... FOR UPDATE` at line
   336-337 plus the unique constraint plus the rollback-and-refetch path
   serialize concurrent inserts. No window where two `qsort_entries` sets
   coexist for the same participant.

There is **no `(participant_id, study_id)` composite unique constraint** —
not needed because `session_token` is globally unique and each token
belongs to exactly one participant row.

**Rate limit.** `@limiter.limit("60/minute")` per-IP at
`submissions.py:31`.

### F-03-008 register enumeration (carry-over)

**Endpoint.** `POST /api/register` → `auth.register_user`
(`backend/app/routers/auth.py:227-354`).

**Inputs.** Body (`UserCreate`): `email`, `full_name`, `password`,
optional `invitation_token`.

**Current response shape on duplicate-email.**
- Line 256-260: pre-check `SELECT * FROM users WHERE email = …`. If a row
  exists, `raise HTTPException(status_code=400, detail="A user with this
  email already exists.")`. **This 400 + body string distinguishes
  registered emails from new ones.** The status alone is the enumeration
  oracle; the detail string is corroborating.
- Line 323-331: race-condition fallback after `IntegrityError` raises 409
  with detail "A user with this email likely already exists" — also leaks,
  but only if two simultaneous registrations collide.
- Line 332-338: catch-all 500 for unexpected errors.
- Success (201): returns `{user, requires_email_verification}`.

The rate limit is `5/minute` per-IP (line 230), which slows enumeration
but does not stop a determined campaign. The original Wave 2 finding
(`docs/audits/.../03-auth-email-flows.md:623`) classified this as
**minor**.

**Required redesign for uniform response.**
- Always return 200 (or 201) with a generic body `{requires_email_verification:
  true}` and no leaks of `already_registered`.
- For known emails, send a "you already have an account on Qualis" email
  to the address (with a password-reset link), instead of creating a row.
- For new emails, the existing verification-link flow continues.
- Drop the 400 pre-check entirely; rely on the unique-index `IntegrityError`
  path, but also collapse it to a 200 with the same generic body
  (background-task the dispatch of the "already registered" email).
- The 5/minute per-IP cap stays; consider a 50/hour per-email cap to slow
  per-email harassment. Out of scope for Wave 5's backend half (the spec
  says ship the always-200 response; defer email-template + UX
  reformulation to Wave 5b backlog).

Task 9 ships the always-200 body shape and the regression test. The
distinct-email flow is a minimal addition (one new template + one helper);
the spec leaves whether it ships in this PR or in Wave 5b to the
implementer — preference is "do the backend half" (plan line 154).


## Summary

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 0 |
| minor | 1 |
| observation | 2 |
| n/a | 0 |

## Findings

### F-06-001 — Resume-code per-code rate-limit lockout (distributed brute-force)

**Severity:** minor

**Category:** business-logic abuse / rate limiting.

**Location:** `backend/app/routers/participants.py:222-223` (decorators on
`resume_session`), `backend/app/limiter.py:42-72` (new
`resume_code_key_func_sync`), `backend/app/resume_codes.py:640-680`
(code generator).

**Vulnerability:** `GET /api/study/{slug}/resume/{code}` carried only a
per-IP rate limit of `30/minute`. Resume codes are
`adjective-noun-NNN` triples drawn from ~100 adjectives × ~100 nouns ×
900 numeric suffixes ≈ **9 × 10⁶** combinations per locale. A
distributed brute-forcer paying out across many source IPs is unbounded
by a per-IP limiter — the per-IP cap only forces the attacker to use
more sources, not to slow down attempts against one specific
participant's code. At a sustained 30/minute per IP × 100 IPs =
3 000/minute = 4.32 M/day, the full 9M space is enumerable in ~2 days.
Hitting one specific code requires the same campaign with no payoff
shrinkage from per-IP keying alone.

A correct guess returns the participant's `session_token`,
`draft_responses`, `last_step_reached`, and `resume_code` itself
(`ResumeResponse`, `participants.py:276-282`). The `session_token` is
then sufficient to act as the participant for all write routes
(`/save-draft`, `/submit`, `/audio/upload`, etc.), so a brute-forced
code is a full participant takeover.

The cross-study lookup gate from Wave 3 F-04-004 is **still in place**
(`participants.py:250-254` joins on `Study.slug == slug`); this finding
addresses a different surface, the per-code rate budget.

**Remediation:** added a second slowapi limit keyed by
`sha256(slug|code)` at `10/hour` per code, layered on top of the
existing per-IP `30/minute`. The new key function
(`limiter.resume_code_key_func_sync`) extracts the path params,
lowercases the code (mirroring the handler's normalisation), prefixes
the digest with `resume:` to namespace it on shared limiter storage,
and falls back to the per-IP key when path params are absent. With
10 attempts/hour per code, the cost of guessing one specific code in
the 9M space rises to ~9M / 10 / hour ≈ 100 years — well below the
threshold of practical concern. The per-IP limit stays so a single
abusive client can't burn every IP-key budget on the entire user base.

The lockout is **soft** (window-based slowapi limit) rather than a
DB-backed hard lockout; rationale: a hard lockout against a single
code creates a denial-of-service amplification (an attacker can force
a legitimate participant out of their own session by burning their
code's budget). The 10/hour cap is well above legitimate usage (a
participant typing their own code with 1-2 typos on resume) but well
below brute-force throughput.

**Suggested follow-up (deferred):** if telemetry ever shows persistent
campaigns hitting the per-code cap, escalate to a full DB-backed
lockout with admin-side reset. Today the slowapi limit is sufficient
and avoids the schema migration.

**Test:** `backend/tests/security/wave_5/test_resume_code_brute_force.py`
— 7 cases pin the key-function behaviour (per-(slug,code) isolation,
case-normalisation, IP-independence, namespace prefix, fallback) and a
static assertion that the decorator chain on `resume_session`
includes `key_func=resume_code_key_func_sync`. We don't drive the
runtime limiter inside the test process — slowapi is disabled in the
test harness — but the static gate prevents a future refactor from
silently dropping the per-code limit.

**Status:** closed.

**Source:** Wave 5 inventory §"Resume-code (F-06-001 surface)".

### F-06-002 — Draft-responses session-token bearer model (shared-device threat)

**Severity:** observation

**Category:** business-logic abuse / authentication model.

**Location:** `backend/app/routers/participants.py:108-218` (save_draft,
withdraw_draft, resume_session — all three touch
`Participant.draft_responses`).

**Observation:** the participant's draft answers are pinned to one
column (`Participant.draft_responses`) and gated by the
`session_token` UUID across three routes:

| Route | Auth | Purpose |
|-------|------|---------|
| `PUT /save-draft` | `session_token` in body | overwrite draft |
| `GET /resume/{code}` | resume code in path (returns `session_token`) | read draft |
| `DELETE /draft?session_token=…` | `session_token` in query | clear draft |

The auth model is purely bearer-by-token: possession of the token =
the right to read and write the draft. There is no cookie-, JWT-, or
device-binding layer.

**Threat model.** The brute-force surface is bounded by:

- Wave 3 F-04-004: cross-study lookup is rejected
  (`participants.py:250-254`, joins on `Study.slug == slug`).
- Wave 5 F-06-001: per-code rate limit (10/hour layered on the
  per-IP 30/minute) makes the 9M-entropy resume-code space
  practically un-enumerable.
- The `session_token` itself is a `uuid4` (122 bits) with a unique
  index — directly guessing a token is computationally infeasible.

**What survives is a shared-device threat:** if a participant leaves
the resume URL on a shared computer (kiosk, library terminal, family
laptop), the next user who visits `/resume/<code>` receives the
`session_token` and can read, overwrite, or clear the prior
participant's draft. The default consent text already addresses this
by asking participants to complete in one session and to use a
private device; a Q-methodology study is not a high-value target for
hijacking (the data is research opinion, not credentials), and
binding to a device would break the explicit "resume on another
device" UX promise.

**No code change.** The model is intentional and the consent text
already covers the residual scenario. Filed as observation so the
audit trail records the deliberate trade-off.

**Test:** `backend/tests/security/wave_5/test_draft_responses_isolation.py`
— 8 cases pin (i) the bearer model works for legitimate token
holders on save/withdraw, (ii) a token from study A on study B's
slug is rejected (cross-study lookup), (iii) a random/unknown
token returns 404 on both write paths, (iv) `study.state == active`
gate fires on save-draft, and (v) a static guard on the participants
router asserting that no JWT-bearer admin auth (`get_current_user`)
has been added to the participant flow.

**Status:** closed (observation; pinned by regression test).

**Source:** Wave 5 inventory §"Draft-responses (F-06-002 surface)".

### F-06-003 — Recruitment capacity gate uses SELECT FOR UPDATE (clean)

**Severity:** observation

**Category:** business-logic abuse / concurrency.

**Location:**
`backend/app/services/recruitment_service.py:84-108` (`increment_usage`),
`backend/app/services/recruitment_service.py:126-146` (`validate_link_token`),
`backend/app/services/submission_service.py:374-380` (only consumer).

**Observation:** capacity-bound recruitment links are gated correctly
under concurrency. `increment_usage` runs the read under
`SELECT … FOR UPDATE` (PostgreSQL row-level lock); a concurrent
caller blocks until the first commits, so the canonical TOCTOU
window between "check usage_count vs capacity" and "increment
usage_count" is closed. `validate_link_token` deliberately omits the
capacity check (comment: "Capacity is enforced atomically in
`increment_usage()` under a row-level lock, so we don't check it
here (avoids TOCTOU race)") so the atomic increment is the single
gate.

The only consumer at `submission_service.py:374-380` flushes within
the outer submission transaction, and the router commits at
`submissions.py:48`; the lock therefore holds end-to-end across the
participant insert and the link increment. There is no raw
check-then-insert variant.

**No code change.**

**Test:**
`backend/tests/security/wave_5/test_recruitment_capacity_race.py` —
5 cases pin (i) the first N=capacity calls succeed and the
(N+1)-th refuses, (ii) refusals are idempotent (usage_count does
not advance past capacity), (iii) `validate_link_token` returns the
link even at capacity (capacity is the increment's job), (iv)
`increment_usage` source contains `with_for_update` (static guard),
(v) `validate_link_token` source contains no capacity comparison
(static guard against re-introducing the TOCTOU window).

**Status:** closed (observation; pinned by regression test).

**Source:** Wave 5 inventory §"Recruitment capacity (F-06-003 surface)".

## Resolved since prior

_Listed by Task 10 if any prior business-logic findings closed since Wave 2/3/4._

## False positives — not filed
