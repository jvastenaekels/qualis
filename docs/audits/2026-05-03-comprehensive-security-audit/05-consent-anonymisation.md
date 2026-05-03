# Wave 4 — Consent & Anonymisation Pipeline

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `ed4b0488` of `audit/4-consent-anonymisation`

## Scope

Files audited:
- `backend/app/routers/participants.py` (`record_consent`, submit, drafts)
- `backend/app/services/submission_service.py`
- `backend/app/services/storage_service.py`
- `backend/app/services/export_service.py`
- `backend/app/routers/audio.py`
- `backend/app/routers/admin/lifecycle.py` (`is_discarded`, `anonymised_at`)
- `backend/app/models/participant.py`, `backend/app/models/study.py` (consent fields)

No carry-overs. Wave 4 uses `F-05-NNN` ID space.

## Inventory

### 2.1 — End-to-end trace of one participant's data

The reference journey: a participant arrives via a recruitment link, consents, fills the
profile, completes rough+fine sort, leaves a couple of post-sort comments (one with audio),
submits, the researcher later discards / anonymises / erases the row.

Stage labels match section 2.3 (`arrived`, `consented`, `submitting`, …). All file:line
references are against commit `ed4b0488`.

#### Stage 1 — `arrived`

| Aspect | Value |
|---|---|
| HTTP request | `GET /api/study/{slug}` (loads study config) — `routers/submissions.py:73-121` |
| DB writes | None. The Participant row does not yet exist. |
| S3 writes | None. |
| Logs | `uvicorn.access` line. `request.client.host` is rendered raw in the access log (Starlette default; no IP-redacting middleware exists for the access logger — only the F-03-013 token scrubber is attached, which strips `?token=`/`?otp=`/`?code=` query parameters but **leaves the IP intact**). |
| Side-effects | If `link_token` is supplied → `RecruitmentService.record_start(link.id)` increments `start_count`. No PII recorded against the link. |

#### Stage 2 — `consented`

| Aspect | Value |
|---|---|
| HTTP request | `POST /api/study/{slug}/consent` — `routers/participants.py:33-60` |
| DB writes | `INSERT INTO participants` with `study_id`, `session_token`, `language_used`, `random_seed`, `consented_at = now()`, `consent_hash`, `ip_address = sha256(ip‖salt)[:64]`, `user_agent` (raw), `status='started'`, `last_step_reached=1`, `resume_code` (memorable, e.g. `swift-river-42`). See `submission_service.py:38-154`. |
| S3 writes | None. |
| Logs | (resume-code collision retries only) `submission_service.py:107`, `:146` — no PII content. The HTTP access log captures the route + raw client IP (same as stage 1). |
| Side-effects | None: no email, no audit row (`log_admin_action` is reserved for admin actions, not participant actions). The hashed IP **is** persisted; the original IP is hashed inline in `submission_service.py:53` via `hash_ip()` (`utils/crypto.py:11-25`). |

Contradiction with the consent text noted: the consent text promises IP addresses *"are immediately converted into an anonymous code and are never stored in their original format"*. The implementation hashes the IP at the service-layer entry point, which is faithful for the DB column. **However, the raw IP appears in two places before the hash:** (1) `routers/participants.py:44` reads `request.client.host` and passes it as a string into the service; (2) every Uvicorn access log line for every request (consent or otherwise) carries the raw IP. Neither is "stored in original format" persistently in *application* state, but Uvicorn access logs are written to stdout/whatever sink the operator hooks up — for self-hosters with default systemd capture, the raw IP **is** stored. **Flagged for Task 9.**

`user_agent` is stored raw (`participants.ip_address` is hashed; `participants.user_agent` is not). The consent text lists "IP addresses" by example only; UA strings do contain device/version detail (and on rare browsers can be quasi-identifying). **Flagged for Task 4.**

#### Stage 3 — `submitting` (drafts; rough sort, fine sort, post-sort textareas)

| Aspect | Value |
|---|---|
| HTTP requests | `PUT /api/study/{slug}/save-draft` (each card move) — `routers/participants.py:108-149`. `PATCH /api/study/{slug}/progress` (each step boundary) — `:63-105`. `POST /api/audio/upload` (audio recording for a card or post-sort question) — `routers/audio.py:89-231`. |
| DB writes | `UPDATE participants SET draft_responses = …` (each save-draft). `UPDATE participants SET last_step_reached, last_step_reached_at` (each progress). `INSERT INTO audio_recordings (…)` (each upload). |
| S3 writes | `audio/{study_slug}/{participant_token}/{timestamp}_{question_key}{ext}` — `storage_service.py:126`. Object metadata holds `study=study_slug`, `participant=participant_token`, `question=question_key` (`storage_service.py:141-146`). |
| Logs | Audio: `storage_service.py:158-167` warn/error on retry/failure (S3 key may appear). `:228` warns when an object is missing on download. None contain participant text content. |
| Side-effects | `check_storage_quota` (`audio.py:56-86`) recomputes per-study sum from `audio_recordings`; does *not* hit S3. |

Notes:
- `draft_responses` is a JSON blob under `participants.draft_responses` (`models/participant.py:96`). Free-text post-sort answers (e.g. `missing_statement`) are written here as the user types, even if they never finalise. **Flagged for Task 3** — these survive an abandoned session indefinitely (no cleanup cron).
- The S3 key contains `participant_token` (the session UUID). After anonymisation the row's `session_token` is rotated (`study_data_service.py:148`), but the audio is deleted in the same call — so post-anonymisation the *key* never persists. Pre-anonymisation, an operator with bucket-list permission can map `study_slug/participant_token/*` back to the row by joining on `participants.session_token`. **Flagged for Task 5.**

#### Stage 4 — `submitted`

| Aspect | Value |
|---|---|
| HTTP request | `POST /api/submit` — `routers/submissions.py:26-70` |
| DB writes | `UPDATE participants SET status='completed', submitted_at=now(), confirmation_code=token[:8].upper(), presort_answers=…, postsort_answers=…, ip_address=sha256(...), user_agent=…, draft_responses=NULL, last_step_reached=5`. `INSERT INTO qsort_entries` (one row per statement). See `submission_service.py:494-581`. |
| S3 writes | None at submit (audio uploaded earlier). |
| Logs | `routers/submissions.py:63` logs *unexpected* exceptions with `exc_info=True` and the study slug. No PII in normal path. |
| Side-effects | `RecruitmentService.increment_usage(link.id)` if a recruitment link was used (`submission_service.py:378`). On submit, `draft_responses` is **explicitly nulled** (`submission_service.py:447`) — the draft survives only on abandoned/incomplete sessions. |

Note: at submit, `presort_answers` and `postsort_answers` (JSON blobs that may include free-text) are persisted. The recruitment-link token is stored inside `presort_answers["_recruitment_token"]` (`submission_service.py:374-377`) — accessible via the `Participant.recruitment_token` property (`models/participant.py:121-125`). Recruitment links are linked in `recruitment_links.email` (`models/recruitment.py:63`); but participant rows do **not** carry an email field directly. The link is broken at the participant table boundary — to re-identify, an operator must join `presort_answers->>'_recruitment_token'` against `recruitment_links.email`. **This is the "Exception for follow-up" mechanism referenced in the consent text.**

#### Stage 5 — `discarded` (admin action)

| Aspect | Value |
|---|---|
| HTTP request | `PATCH /api/admin/studies/participants/{participant_id}/discard` — `routers/admin/studies_participants.py:113-155` |
| DB writes | `UPDATE participants SET is_discarded=true, discard_reason=<text>` |
| S3 writes | None — audio survives discard. |
| Logs | `:149` errors on unexpected exception. No `log_admin_action` call is emitted for discard. **Flagged: discard is missing from audit log** — pure operator action that affects researcher reporting and downstream stats; arguably should be auditable per the same pattern as `bulk_anonymise` (`lifecycle.py:300-310`). **Flagged for Task 9** (audit-log gap, observation-tier). |
| Side-effects | Default queries in exports (`exports.py:47, :98, :141`) and `study_data_service.get_study_stats` (`:168`) and `get_study_sort_data` (`:381`) filter on `is_discarded.is_(False)`. `get_study_full_dump` (`:213-353`) does **not** filter on `is_discarded` — it includes discarded rows with their `is_discarded` flag preserved in the output (`:311`), which is intentional: the full dump is a research archive that researchers may want to inspect for quality control. |

`is_discarded` is a soft-delete flag; PII still resides on the row (hashed IP, raw UA, draft_responses if any). It is **not** an erasure mechanism. **Flagged for Task 8.**

#### Stage 6 — `anonymised`

| Aspect | Value |
|---|---|
| HTTP requests | (a) admin per-row: `DELETE /api/admin/studies/{slug}/participants/{participant_id}/personal-data` — `studies_participants.py:179-225`. (b) admin bulk: `POST /api/admin/studies/{slug}/anonymise-bulk` body `{submitted_before: ISO}` — `lifecycle.py:253-316`. (c) participant self-erase: `DELETE /api/study/{slug}/personal-data?session_token=…` — `participants.py:216-264`. All three converge on `StudyDataService.anonymise_participant` (`study_data_service.py:73-160`). |
| DB writes | On the participant: `ip_address=NULL`, `user_agent=NULL`, `confirmation_code=NULL`, `resume_code=NULL`, `consent_hash=NULL`, `draft_responses=NULL`, `presort_answers={}`, `postsort_answers={}`, `session_token=uuid4()` (rotated), `anonymised_at=now()` (`study_data_service.py:140-149`). On audio: `DELETE FROM audio_recordings WHERE participant_id=…` (`:133-137`). |
| S3 writes | All of the participant's S3 audio objects are deleted via `storage_service.delete_audio(key)` (`:117-130`). Failures are logged at warning level (`:125`) and the DB anonymisation continues — a deliberate fail-open posture: a transient S3 outage must not block legal erasure. **Operator obligation: orphan-sweep the bucket periodically.** |
| Logs | `study_data_service.py:106-110` (already-anonymised, no-op), `:125-130` (S3 failure with key), `:153-159` (success — participant_id, study_id, S3 key count). Admin-side: `log_admin_action(action='erase_personal_data', resource='participant', …)` — `studies_participants.py:216-224`; `log_admin_action(action='bulk_anonymise', …)` — `lifecycle.py:300-310`. The participant self-erase path emits **no audit entry** (no admin actor to attribute it to). **Flagged for Task 8.** |
| Side-effects | The session_token rotation means the original token can never re-access this row (the resume flow at `participants.py:152-213` will 404 with the old token). `qsort_entries` are preserved as anonymous research data. |

**What `anonymised_at` does not flip:**
- `language_used` — kept (population locale stat, not identifying alone).
- `random_seed` — kept (was deterministic from `session_token`; rotating the token decouples).
- `submitted_at`, `created_at`, `consented_at`, `last_step_reached_at` — kept (research timestamps).
- `is_discarded`, `discard_reason` — kept (researcher-side QC state).
- `qsort_entries.card_comment` — kept (free-text per-card comment). **Flagged for Task 4** — `card_comment` may contain participant-supplied PII the consent text says should be "screened to remove revealing details", but anonymisation does not screen them; it preserves them as research data.
- `audio_recordings` rows after the explicit `DELETE` (`:133-137`) — gone.

#### Stage 7 — `erased` (Article 17 fully)

There is **no hard-delete endpoint** for an individual participant. The only paths that
truly erase a participant row from the DB are:

1. `DELETE /api/admin/studies/{slug}/participants` — `studies_participants.py:158-176` — clears **all** participants. Allowed only when `study.state == draft` (i.e., before the study went live). Calls `StudyDataService.delete_audio_files_for_study` first (`study_data_service.py:41-62`) so S3 is swept.
2. CASCADE: deleting the parent `Study` cascades to `participants` via `ondelete="CASCADE"` (`models/participant.py:42`). Audio S3 objects must be swept first by the caller; `audio_recordings` rows then cascade out.

For the **request-scoped Art. 17** path (an individual participant or a researcher acting
on a participant's request), Qualis treats *anonymisation* (PII nulled, qsort preserved)
as the legal endpoint. This is documented in the docstring at
`participants.py:236-242` and in the rationale at `study_data_service.py:77-101`.
**Flagged for Task 8** — defensible position, but the "right to be forgotten" is broader
than what's currently exposed; document as an operator obligation in the GDPR memo.

### 2.2 — Compare to consent text

Read `services/study_defaults.py:109` (`consent_description` for `en`). Verdicts on each
of the four promises:

#### Promise 1 — "Direct identifiers (such as IP addresses) are immediately converted into an anonymous code and are never stored in their original format."

**Verdict: PARTIAL.** The DB column is hashed at the service-layer entry point
(`submission_service.py:53`, `:503` via `hash_ip()`). The hash uses SHA-256 with a
required env-var salt (`utils/crypto.py:11-25`) — production refuses to start without
`IP_HASH_SALT` set. So far so good.

Two gaps:
1. **Uvicorn access logs render `request.client.host` raw on every request.** The
   `log_scrub` middleware (`middleware/log_scrub.py:1-103`) attaches a filter to
   `uvicorn.access`, but the filter only scrubs query parameters (`token`/`otp`/`code`),
   not the IP that Uvicorn writes at the start of the line. Self-hosters with default
   systemd-journald capture **do** persist the raw IP. **Flagged for Task 9.**
2. **`user_agent` stored raw.** The consent text says "Direct identifiers (such as IP
   addresses)"; the example list is non-exhaustive. UA strings are quasi-identifying.
   `participants.user_agent` is `String, nullable=True` (`models/participant.py:66`)
   and persisted without any transformation. **Flagged for Task 4.**

#### Promise 2 — "Pre-submission: If you withdraw before finalizing your sort, no partial data will be retained."

**Verdict: MISMATCH.** The implementation does *not* clean up partial data on
abandonment.

- **No participant-side withdrawal endpoint exists.** The only `DELETE` route accessible
  via session_token is `/personal-data` (`participants.py:216-264`), which is a full
  Art. 17 erasure (preserves qsort_entries, but those don't exist pre-submission).
  In practice it can serve as a withdrawal channel — but it's documented as Art. 17
  and is rate-limited at 10/minute, not as a UX-friendly "I changed my mind" button.
  No frontend UI exposes this route as "withdraw" today (out of scope to verify, but
  the consent text talks about closing the browser, not clicking a button).
- **Close-browser leaves `draft_responses` populated.** Stage 3's `save-draft` writes
  to `participants.draft_responses` (`participants.py:146`); nothing clears it on
  abandonment. The row persists at `status='started'` forever (until manual admin
  cleanup or until the study is hard-deleted in draft state). The participant's
  `consented_at`, `consent_hash`, hashed IP, raw UA, and free-text `draft_responses`
  remain.
- **No retention sweep for abandoned sessions.** Searched
  `backend/app/`, `backend/scripts/`: only `cleanup_consumed_email_tokens.py` (Wave 2
  artefact for `consumed_email_tokens`) and `MemoService.cleanup_for_parent` (memo
  subsystem) exist. No participant-row sweeper.
- `is_expired` is a *property* (`models/participant.py:106-118`) computed from
  `SESSION_TTL_DAYS = 60` (`models/base.py:32`), but it's only consulted by the
  `resume_session` endpoint (`participants.py:198`) to refuse resumption. Expired rows
  are not deleted; they stay forever.

**Flagged for Task 3** as a major-tier finding: consent text is false today.

#### Promise 3 — "Reporting will aggregate ... Qualitative comments may be quoted to contextualize ... screened to remove revealing details."

**Verdict: PARTIAL.** Qualis's job is to give researchers the data; the *screening*
itself is a researcher obligation (Qualis cannot programmatically know which details
are revealing). Two implementation gaps:

1. **Exports do not filter `anonymised_at IS NOT NULL`.** `exports.py:47, :98, :141`
   and `study_data_service.py:168, :381` all filter on `is_discarded.is_(False)` only.
   An anonymised participant has empty PII fields, so their CSV/JSON row shows blank
   `IP_Hash`, blank `User_Agent`, empty `Pre_*` and `Post_*` columns, and rotated
   session_token — that's harmless, but their `qsort_entries.card_comment` (free text)
   **is preserved** and **does** show up in the export. If anyone wrote PII into a
   per-card comment, that PII rides through the anonymisation barrier and into the
   export. **Flagged for Task 6.**
2. **`generate_csv` exports `IP_Hash` and `User_Agent` columns** unconditionally
   (`export_service.py:107-108`). For a non-anonymised row, the hashed IP is stable
   across the study (same salt, same input) — combined with two CSVs from the same
   site, this is a stable cross-study pseudonym. Fine for fraud detection inside one
   study; defence-in-depth concern for cross-study correlation. **Flagged for Task 9
   as observation.**

#### Promise 4 — "Exception for follow-up: ... the link between your identity (email) and your response will be maintained strictly for the duration of that specific follow-up phase."

**Verdict: MISMATCH (operator-dependent).** The implementation provides a mechanism
that can support this — `recruitment_links.email` (`models/recruitment.py:63`) holds
the email; the link from participant → email is via
`presort_answers["_recruitment_token"]` (`submission_service.py:374-377`); the link is
broken by anonymisation (which clears `presort_answers`). **However:**

- **There is no automatic "follow-up phase ended" trigger.** No cron, no per-study
  setting that flips a switch. The operator must manually run
  `POST /api/admin/studies/{slug}/anonymise-bulk` with a cutoff date once the
  follow-up phase is over.
- **`data_retention_months`** (`models/study.py:112`, `lifecycle.py:78-84`) is *only
  a UI hint* — it surfaces in the data-inventory response so the frontend can suggest
  a default cutoff. It does **not** trigger anything automatically.
- **No `recruitment_links.email` cleanup either.** Once the participant submits, the
  `_recruitment_token` lives on in `presort_answers` until the next anonymisation.
  And the `recruitment_links` row lives forever (no cascade based on study lifecycle).

**Flagged for Task 8** as a major-tier finding: consent text promises "strictly for the
duration of that specific follow-up phase", but enforcement is purely manual; an
operator who forgets to anonymise leaves the link standing indefinitely.

### 2.4 — PII fields table

Every column on every model that materially carries personal data or session-linkable
state. Tables not in scope (e.g. `studies`, `statements`) are excluded.

| Table | Column | PII type | Cleared by anonymisation? | Cleared by erasure? | Retention concern |
|---|---|---|---|---|---|
| `participants` | `id` | (synthetic PK) | No | No (CASCADE only) | None alone. |
| `participants` | `study_id` | (FK) | No | No | None. |
| `participants` | `session_token` | session-linkable UUID | Rotated to fresh UUID | n/a (only via study delete) | Pre-anon, this is the bearer of access. The original token is the participant's main re-identification vector. |
| `participants` | `language_used` | aggregate-only | No | No | Quasi-identifier alone? Negligible. |
| `participants` | `random_seed` | session-linkable string | No (kept; was derived from session_token, which was rotated) | No | Negligible after rotation. |
| `participants` | `created_at` | aggregate-only | No | No | Combined with `submitted_at` and `language_used`, a quasi-identifier in tiny populations. |
| `participants` | `status` | aggregate-only | No | No | None. |
| `participants` | `confirmation_code` | session-linkable token (8 chars) | Yes (NULL) | n/a | Shown to the participant on submit; can be used to look up own row in support cases. |
| `participants` | `resume_code` | session-linkable token (memorable string) | Yes (NULL) | n/a | Shown to the participant after consent; used by `/resume/{code}`. |
| `participants` | `is_discarded` | researcher-side QC flag | No | No | None. |
| `participants` | `discard_reason` | free text written by researcher | No | No | Researcher-supplied; may contain identifiers — reviewer obligation, not Qualis. |
| `participants` | `ip_address` | hashed IP (sha256 + salt, 64 chars) | Yes (NULL) | n/a | Stable pseudonym within a study (same salt). Across studies, same hash unless `IP_HASH_SALT` differs. |
| `participants` | `user_agent` | **raw UA string** | Yes (NULL) | n/a | **Stored raw** — flagged for Task 4. |
| `participants` | `submitted_at` | timestamp | No | No | Quasi-identifier in small populations. |
| `participants` | `consented_at` | timestamp | No | No | Same. |
| `participants` | `consent_hash` | hash of consent text (versioning) | Yes (NULL) | n/a | Not directly identifying. |
| `participants` | `anonymised_at` | erasure marker | No (set) | n/a | Audit trail. |
| `participants` | `last_step_reached`, `last_step_reached_at` | session progress | No | No | None alone. |
| `participants` | `presort_answers` | free-text JSON survey blob (may contain PII the participant wrote) | Yes (`{}`) | n/a | Holds `_recruitment_token` which links to `recruitment_links.email` — the follow-up bridge. |
| `participants` | `postsort_answers` | free-text JSON survey blob | Yes (`{}`) | n/a | Same. |
| `participants` | `draft_responses` | free-text in-flight JSON | Yes (NULL) | n/a | **Survives abandoned sessions indefinitely** — flagged for Task 3. |
| `qsort_entries` | `card_comment` | **free text per-card** | **No (preserved)** | n/a (CASCADE only on study delete) | **Flagged for Task 4 / 6** — qualitative free text that may contain PII rides through anonymisation. |
| `audio_recordings` | `s3_bucket`, `s3_key` | filesystem path containing study_slug + participant_token + question_key | Row deleted; S3 object deleted | Same | If S3 deletion fails, key persists in S3 with no DB pointer (orphan). |
| `audio_recordings` | `file_size_bytes`, `duration_seconds`, `mime_type` | metadata | Row deleted | Same | None. |
| `audio_recordings` | (object body) | **biometric — voice recording** | Deleted from S3 | Same | The strongest PII Qualis stores. |
| `recruitment_links` | `email` | researcher-supplied recipient email | **No** (anonymisation operates on participant, not the link row) | No | **Flagged for Task 8** — once the follow-up phase ends, the email lingers unless the operator deletes the link manually. |
| `recruitment_links` | `token` | (link key) | No | No | Re-usable until expired/full. |

Total **23** participant-side PII columns enumerated; **3** that survive anonymisation
and represent ongoing risk:
1. `qsort_entries.card_comment` (free text — the consent text's "screened to remove
   revealing details" promise lives or dies here).
2. `recruitment_links.email` (the follow-up bridge — promised to be torn down at
   end of follow-up phase, in practice a manual delete).
3. Uvicorn access-log lines (raw IP per request, retained per the operator's log sink
   policy — typically forever).

## Data lifecycle map

State diagram (textual; arrows show legal transitions). The DB / S3 / log columns
describe the *steady state* for that node — what is currently persisted.

```
            ┌──────────┐
            │ arrived  │  DB: nothing                       transitions:
            └────┬─────┘  S3: nothing                       └─ POST /consent → consented
                 │        Logs: access log line w/ raw IP
                 ▼
         ┌────────────┐
         │ consented  │   DB: participants row, hashed IP, raw UA,
         └────┬───────┘        consented_at, resume_code
              │            S3: nothing                       transitions:
              │            Logs: same                        ├─ PUT /save-draft → submitting
              │                                              ├─ Art.17 self-erase → anonymised
              │                                              └─ idle 60d → "expired" property only
              ▼
       ┌──────────────┐
       │ submitting   │  DB: + draft_responses populated     transitions:
       └────┬─────────┘  S3: 0..N audio objects in-flight    ├─ POST /submit → submitted
            │            Logs: audio S3 retry warnings       ├─ DELETE /personal-data → anonymised
            │                                                └─ close-browser-forever → STUCK
            ▼                                                   (no auto-cleanup)
     ┌──────────────┐
     │  submitted   │   DB: status=completed, submitted_at,
     └─┬─────┬──────┘        confirmation_code, qsort_entries,
       │     │               presort_answers, postsort_answers,
       │     │               draft_responses=NULL
       │     │           S3: audio objects retained
       │     │
       │     ├──────────────────────────┐
       │     │ admin: PATCH /discard    │      transitions: re-discard toggles flag
       │     ▼                          │      audio retained, PII retained
       │  ┌──────────────┐              │
       │  │  discarded   │  DB: + is_discarded=true,         filters: excluded from
       │  └──┬───────────┘              │     stats, CSV/PQM/R-kit exports.
       │     │                          │     Included in full_dump (with flag).
       │     │                          │     PII still present.
       │     │                          │
       │     │  admin: erase_personal_data    OR participant: DELETE /personal-data
       │     │  OR admin: anonymise-bulk      OR researcher anonymise-bulk
       │     ▼                                ▼
       │  ┌──────────────────────────────────────────┐
       └─►│             anonymised                   │
          └─────────────┬────────────────────────────┘
                        │  DB: ip_address=NULL, user_agent=NULL,
                        │      confirmation_code=NULL, resume_code=NULL,
                        │      consent_hash=NULL, draft_responses=NULL,
                        │      presort_answers={}, postsort_answers={},
                        │      session_token=uuid4() (rotated),
                        │      anonymised_at=now()
                        │      qsort_entries.card_comment KEPT
                        │  S3: audio objects deleted (best-effort;
                        │      orphans on S3 failure are operator-swept)
                        │  Logs: log_admin_action(erase_personal_data)
                        │       OR log_admin_action(bulk_anonymise)
                        │       OR (none — self-erase has no audit row)
                        │
                        │  transitions:
                        │  └─ "erased" only via study-level CASCADE
                        ▼
                  ┌──────────┐
                  │  erased  │  DB: row deleted (CASCADE from
                  └──────────┘       study delete or DRAFT-state
                                     clear-all-participants)
                                S3: audio swept BEFORE cascade by
                                    StudyDataService.delete_audio_files_for_study
                                Logs: app.audit retained
                                      (operator obligation to scrub)
```

Code references for each transition handler:

| Transition | Handler |
|---|---|
| `arrived → consented` | `routers/participants.py:33-60` → `services/submission_service.py:38-154` |
| `consented → submitting` (each card move) | `routers/participants.py:108-149` |
| `consented → submitting` (audio upload) | `routers/audio.py:89-231` → `services/storage_service.py:94-175` |
| `submitting → submitted` | `routers/submissions.py:26-70` → `services/submission_service.py:494-581` |
| `submitted → discarded` | `routers/admin/studies_participants.py:113-155` |
| `* → anonymised` (admin per-row) | `routers/admin/studies_participants.py:179-225` → `services/study_data_service.py:73-160` |
| `* → anonymised` (admin bulk) | `routers/admin/lifecycle.py:253-316` → same service |
| `* → anonymised` (participant self) | `routers/participants.py:216-264` → same service |
| `* → erased` (study cascade) | `services/study_data_service.py:41-70` (audio sweep) + ORM CASCADE on `participants.study_id` (`models/participant.py:42`) |

## Summary

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 1 |
| minor | 5 |
| observation | 4 |

## Findings

### F-05-001 — No pre-submission withdrawal mechanism (consent text false)

**Severity:** major

**Location:** `backend/app/routers/participants.py`, `backend/app/services/study_defaults.py:109` (consent text), `backend/app/models/participant.py:96` (`draft_responses` column).

**Vulnerability:** the default consent text shipped with every Qualis study
promised "Pre-submission: If you withdraw before finalizing your sort, no
partial data will be retained." The implementation contradicted this in three
ways:

1. **No participant-side withdrawal endpoint existed.** The only
   ``DELETE`` route accessible by ``session_token`` was
   ``/personal-data`` — a full GDPR Art. 17 erasure that nukes the
   row's hashed IP, raw UA, presort/postsort/draft answers, audio
   recordings, etc. Disproportionate for "I want to start over" UX, and
   non-discoverable as a withdrawal channel (rate-limited 10/min,
   documented as Art. 17 only).
2. **Closing the browser left ``draft_responses`` populated.** Every
   ``PUT /save-draft`` wrote the participant's in-flight free-text
   answers into ``participants.draft_responses`` (JSON column). Nothing
   cleared it on abandonment — the row persisted at ``status='started'``
   forever, with consent_hash, hashed IP, raw UA, and free-text draft
   data, until manual admin cleanup or study hard-delete.
3. **No retention sweep for abandoned sessions.** A grep of
   ``backend/scripts/`` and ``backend/app/`` found only the email-token
   cleanup (Wave 2) and the memo cleanup; nothing for participant rows.
   ``Participant.is_expired`` is a property consulted by the resume
   endpoint to refuse old tokens; it does not delete rows.

The severity is **major** because the consent text — the legal artefact
the participant agreed to — was actively misleading. The participant
who closed the browser believing "no partial data will be retained"
had their hashed IP, UA, consent_hash, ``last_step_reached`` and
free-text ``draft_responses`` retained indefinitely. This is not a
data-leakage gap (no extra party gains access), but it is a consent
integrity gap.

**Remediation:**
- Added ``DELETE /api/study/{slug}/draft?session_token=…`` — clears
  ``draft_responses`` to ``None`` and resets ``last_step_reached`` to 1
  for the matching row. Authenticated by ``session_token`` (same bearer
  model as resume / save-draft / Art. 17 erasure). Rate-limited
  ``10/minute``. Idempotent. No-op once the participant has submitted
  (the consent promise applies pre-submission only).
- The frontend "I want to start over" UX (button on the resume screen
  and the post-consent landing) is **deferred to Wave 4b** as an
  out-of-scope front-end change (>30 min UI work).
- An operator-side abandoned-draft sweeper script
  (``scripts/cleanup_abandoned_sessions.py``) is **deferred to Wave 4b**
  so the consent-text promise also covers participants who never come
  back to click withdraw. Recommended cadence: weekly cron, removing
  participants with ``status='started' AND submitted_at IS NULL AND
  last_step_reached_at < now() - SESSION_TTL_DAYS``.

**Test:** ``backend/tests/security/wave_4/test_withdrawal.py`` —
5 cases pin the new endpoint behaviour: clears matching row,
404 on unknown token, 404 on cross-study token reuse, no-op on
already-submitted, idempotent on repeated calls.

**Status:** closed (backend half); Wave 4b backlog tracks the frontend
button and the operator sweeper.

**Source:** Wave 4 inventory §2.2 (Promise 2), §2.3 stage 3 + lifecycle
"close-browser-forever → STUCK" arrow.

### F-05-002 — `user_agent` stored raw at write time (consent-text gap)

**Severity:** minor

**Location:** `backend/app/services/submission_service.py:79, :132, :361, :442`,
`backend/app/utils/crypto.py`, `backend/app/models/participant.py:66`.

**Vulnerability:** the consent text promised "Direct identifiers (such as IP
addresses) are immediately converted into an anonymous code and are never
stored in their original format." The example list ("such as IP addresses")
is non-exhaustive. The implementation hashed `participants.ip_address` at
the service-layer entry point (`hash_ip` at `submission_service.py:53,
:504`) but persisted `participants.user_agent` raw — on every consent and
every submit. UA strings carry browser/OS/version detail and on rare
browsers (or for automation tooling minting unusual strings) can be a
quasi-identifier. Anonymisation did NULL the column, so the gap was
write-time only — but every non-anonymised participant row carried a raw,
re-identifiable UA string for as long as the operator delayed their
retention sweep.

Severity is **minor** because:
- UA strings are quasi-identifiers, not direct PII (IP, email).
- The pre-existing `is_discarded` and `anonymised_at` lifecycle still
  contained the data correctly under operator policy.
- The defence-in-depth fix is straightforward (hash at write, mirroring
  the IP path).

But it is a **consent-integrity gap**: the participant who read the
consent text and saw "such as IP addresses" had a reasonable expectation
that the same treatment applied to the only other direct technical
identifier the platform captures.

**Remediation:**
- Added `hash_user_agent(ua)` in `backend/app/utils/crypto.py`. Format:
  `"<device_class>:<sha256[:56]>"` where `device_class` is `"mobile"` or
  `"desktop"` (substring heuristic on the raw UA, case-insensitive). The
  class prefix preserves the existing per-study device-breakdown stat
  (`StudyDataService.get_study_stats`) which uses the same substring
  heuristic. Reuses `IP_HASH_SALT` (one variable for the whole GDPR config)
  and refuses to start in production without it.
- `record_consent` and `process_submission` both call `hash_user_agent` at
  the entry point; no raw UA reaches the `participants` table from any
  application path.
- Pre-existing rows are unaffected (non-additive backfill would require a
  schema migration; deferred to operator at next anonymisation pass — a
  bulk-anonymise covers all existing rows).
- The CSV export's `User_Agent` column now emits the hashed value; the
  format `"mobile:abc..."` is self-describing.

**Test:** `backend/tests/security/wave_4/test_anonymisation_pipeline.py`
— `TestHashUserAgent` (8 cases pin format, determinism, salt usage, no
leakage of raw UA into the hash); `TestWriteTimeHashing` (2 cases pin
the entry-point hashing in `record_consent`).

**Status:** closed.

**Source:** Wave 4 inventory §2.2 (Promise 1, gap 2), §2.3 stage 2,
§2.4 PII table row `participants.user_agent`.

### F-05-003 — `qsort_entries.card_comment` preserved through anonymisation

**Severity:** observation

**Location:** `backend/app/services/study_data_service.py:73-160` (anonymisation
path); `backend/app/models/participant.py:142` (`card_comment` column).

**Vulnerability:** when `StudyDataService.anonymise_participant` runs, it
clears the participant's `presort_answers` and `postsort_answers` blobs
(set to `{}`) but does not touch `qsort_entries.card_comment`. A
participant who wrote PII into a per-card comment ("My address is 12 Main
St…") has that text preserved verbatim and exposed in CSV / R-kit /
PQMethod exports of the post-anonymisation row.

This is **defensible as a documented operator obligation**, not a code
bug: the consent text itself flags it ("Qualitative comments may be
quoted to contextualize these factors but will be screened to remove
revealing details"). Qualis cannot do the screening programmatically —
it would require NER / PII-redaction models that are out of scope for a
research instrument. The screening is the researcher's job.

**Remediation: documented as operator obligation; NOT fixed in code.**
- The Wave 7 GDPR memo for self-hosters lists card-comment screening as
  operator obligation #4 (already drafted in §"GDPR-memo material" /
  "(c) Operator obligations" of this document).
- A Wave 4b enhancement could ship an admin UI for inline card-comment
  redaction (researcher reviews each comment, marks each as keep / scrub /
  pseudonymise). Filed in Wave 4b backlog.

**Test:** `backend/tests/security/wave_4/test_anonymisation_pipeline.py`
— `TestAnonymisationPipeline.test_card_comment_preserved_as_research_data`
pins the current behaviour so an accidental future wipe surfaces in CI.

**Status:** observation; deferred (operator obligation + Wave 4b UI
enhancement).

**Source:** Wave 4 inventory §2.2 (Promise 3 verdict PARTIAL),
§2.4 PII table row `qsort_entries.card_comment`.

### F-05-004 — Audio S3 keys leak study slug + participant token

**Severity:** minor

**Location:** `backend/app/services/storage_service.py:126` (key construction),
`:141-145` (object metadata block).

**Vulnerability:** the audio key pattern `audio/{study_slug}/{participant_token}/{timestamp}_{question}{ext}`
exposed two pieces of data to anyone with `s3:ListBucket` permission:
- the study slug (existence + per-study object counts)
- the participant_token (a UUID that, pre-anonymisation, mapped 1:1 to a
  `participants.session_token` row in the DB — a re-identification key)

The S3 object metadata block additionally stored `study=study_slug,
participant=str(participant_token), question=question_key`, exposed
through `HeadObject` to any viewer with the key.

This is a **defence-in-depth concern**, not an application-auth leak:
- The application never exposes ListBucket to clients; keys are only
  addressable via `download_object` and `delete_audio` after the auth
  check.
- The threat model is operator IAM mis-configuration, S3-side audit
  log mining, or the operator themselves running list-bucket queries
  for support purposes.
- The hardening cost is low and the privacy upside is real.

Severity is **minor** because the leak surface is operator-side, not
attacker-side via the application; and because anonymisation reliably
deletes the S3 objects (so post-anonymisation the keys are gone too —
verified in F-05-005).

**Remediation:**
- Added `_hashed_audio_prefix(study_slug, participant_token)` in
  `storage_service.py`. Returns a 32-char hex SHA-256 of
  `(study_slug | participant_token | IP_HASH_SALT)`. Reuses
  `IP_HASH_SALT` (one var for the whole GDPR config). Production
  refuses to start without it.
- New uploads use `audio/{hashed_prefix}/{timestamp}_{safe_question}{ext}`.
  A ListBucket viewer sees only opaque hex paths; per-row `s3_key`
  remains deterministic for delete/download flows.
- Stripped `study=…, participant=…` from the S3 object metadata block;
  only `question=safe_question_key` remains (operator debugging
  context, not a participant identifier).
- Pre-existing rows retain their legacy keys on disk; anonymisation
  deletes by the per-row stored `s3_key`, so both formats coexist
  safely. No migration needed.

**Test:** `backend/tests/security/wave_4/test_audio_s3_keys.py` —
`TestHashedAudioPrefix` (6 cases pin format, determinism, salt usage,
study/participant separation), `TestUploadKeyPattern` (2 cases pin
upload-time key + metadata stripping), `TestHashedPrefixIsStableAcrossRuntimes`
(1 case pins the input → output mapping verbatim against `hashlib`).

Existing storage-service tests
(`backend/tests/unit/test_storage_service.py`) updated to assert the
new pattern.

**Status:** closed.

**Source:** Wave 4 inventory §2.3 stage 3 last paragraph, §2.4 PII
table row `audio_recordings.s3_key`.

### F-05-005 — Audio S3 lifecycle (operator obligation)

**Severity:** observation

**Location:** `backend/app/services/study_data_service.py:117-130`
(anonymisation S3 delete loop), bucket-side configuration (operator).

**Concern:** the anonymisation pipeline already deletes every
`audio_recordings` row's S3 object before nulling the participant's
PII. Failures are logged at warning level and DB anonymisation
continues — a **deliberate fail-open posture: a transient S3 outage
must not block legal erasure**. This means an audio object can
**orphan in the bucket** if S3 was unavailable during the anonymisation
call.

A bucket-side **lifecycle policy** (e.g., auto-delete after 365 days)
would be a defence-in-depth net for orphans, plus a privacy floor for
any audio that the operator is slow to anonymise. It cannot be shipped
from application code: it lives in the S3/Cellar bucket configuration
(JSON / Terraform / web console). Documenting this as **operator
obligation #5** in the Wave 7 GDPR memo (already drafted in
§"GDPR-memo material" / "(c) Operator obligations" of this document).

**Remediation: documented; not fixed in code.**

**Test:** `backend/tests/security/wave_4/test_audio_s3_keys.py
::TestAnonymisationDeletesS3Audio` — pins:
- every per-participant `audio_recordings` row triggers
  `storage_service.delete_audio(s3_key)` during anonymisation;
- the DB anonymisation completes even when S3 deletion raises
  (fail-open — fail-closed would block legal erasure on infra
  outage);
- the `audio_recordings` rows are removed regardless of S3 fate.

**Status:** observation; deferred to operator (S3 lifecycle policy)
+ Wave 7 (memo write-up).

**Source:** Wave 4 inventory §2.3 stage 6 (bullet about fail-open
posture), §"(c) Operator obligations" item 5.

### F-05-006 — Per-participant follow-up exports leak `card_comment` from anonymised rows

**Severity:** minor

**Location:** `backend/app/routers/admin/exports.py:175-256` (per-participant
CSV / JSON / audio export endpoints).

**Vulnerability:** every export query in `exports.py` and
`study_data_service.py` filtered on `Participant.is_discarded.is_(False)`
but **not** on `Participant.anonymised_at IS NULL`. After
`StudyDataService.anonymise_participant`, the row's PII columns are
nulled (`ip_address`, `user_agent`, `confirmation_code`,
`resume_code`, `consent_hash`, `presort_answers={}`,
`postsort_answers={}`, `draft_responses=NULL`) and the audio rows
are deleted, but `qsort_entries.card_comment` is preserved as
research data per F-05-003 (operator screening obligation).

The Wave 4 inventory (§2.2 Promise 3 verdict, §2.3 stage 6) flagged
that an anonymised participant's `card_comment` rides through bulk
exports. For **bulk** exports (CSV / PQMethod / R-Kit / dump /
research package) this is the documented contract: bulk exports are
the factor-analysis input, the consent text already promises
operator screening of qualitative comments, and excluding
anonymised rows would lose research data the participant consented
to contribute.

For **per-participant** exports, however, the contract differs:
those endpoints are individual-lookup channels used in support /
follow-up contexts. After anonymisation, the row no longer
represents an identifiable participant — presenting it as a
follow-up target leaks the preserved `card_comment` to a follow-up
consumer, and as a UX trap might invite an operator to treat an
anonymised row as a contactable participant.

Severity is **minor** because:
- The leak surface is admin-only (StudyRole.editor on the study).
- The operator who triggers anonymisation has explicitly chosen to
  break contact with the participant, so the impact is bounded by
  operator process discipline.
- The bulk-export inclusion of anonymised rows (the larger surface)
  is correct under the F-05-003 contract — the per-participant
  endpoints are the precise locus where the gap matters.
- The fix is defence-in-depth; it tightens the API contract without
  changing data semantics.

**Remediation:**
- Added `Participant.anonymised_at.is_(None)` filter to:
  - `GET /admin/studies/{slug}/participants/{participant_id}/export/csv`
  - `GET /admin/studies/{slug}/participants/{participant_id}/export/json`
    (added an explicit scope-check query before falling through to
    `get_study_full_dump`, so the 404 is emitted before the dump
    query runs).
  - `GET /admin/studies/{slug}/participants/{participant_id}/export/audio`
    (anonymisation already deletes the underlying audio rows; the
    explicit filter keeps the contract uniform).
- Bulk exports (CSV, PQMethod, R-Kit, dump, research package) and
  the analysis-input services (`get_study_stats`,
  `get_study_sort_data`) are **unchanged** — they continue to
  include anonymised rows with PII zeroed (per F-05-003).

**Test:** `backend/tests/security/wave_4/test_export_pii_handling.py`
— 7 cases:
- `TestBulkExportsIncludeAnonymisedRows` — pin that bulk CSV / PQM /
  dump still include the anonymised row's qsort entry (with PII
  columns blank but `card_comment` preserved per F-05-003).
- `TestPerParticipantExportsExcludeAnonymised` — pin that the
  per-participant CSV / JSON / audio endpoints 404 for anonymised
  rows; non-anonymised rows still export (regression guard).

**Status:** closed.

**Source:** Wave 4 inventory §2.2 (Promise 3 verdict PARTIAL),
§2.3 stage 6 (anonymised lifecycle node), §2.4 PII table row
`qsort_entries.card_comment`.

### F-05-007 — No participant-facing Article 15 (right of access) self-export

**Severity:** observation

**Location:** `backend/app/routers/participants.py` (no Article 15
endpoint); `backend/app/routers/admin/exports.py:175-256` (admin path
that satisfies Art. 15 today).

**Concern:** GDPR Art. 15 grants the data subject a right of access
to their personal data — typically expected to be served via a
machine-readable self-export. Qualis ships a participant-facing
Art. 17 erasure endpoint
(`DELETE /api/study/{slug}/personal-data?session_token=…`) and a
resume endpoint that returns draft state, but no participant-facing
self-export. The grep for `session_token`, `personal-data`,
`my-data` across `backend/app/routers/` confirms no such route
exists in v0.6.x.

**Disposition: documented as operator obligation; no Qualis-software
change in this wave.** GDPR Art. 15 requests are served today by the
operator (the data controller of record) joining on
`participant.session_token` (the participant supplies their resume
code or session token in the access request) and exporting via the
admin per-participant CSV / JSON endpoints (`exports.py:175-256`).
This satisfies Art. 15 procedurally — the participant submits a
request, the operator (who is the legal data controller) responds
within one month with a machine-readable export.

A participant-facing self-export endpoint would be a UX improvement
but is not an Art. 15 compliance gap: the right is to receive the
data on request, not to receive it via a self-service portal. The
lift to ship a self-export is genuinely > 30 minutes (new endpoint,
schemas, frontend, edge cases for anonymised rows mirroring F-05-006
contract, threading `session_token` rate-limiting, audit-log
attribution for participant-initiated exports — all out of scope for
Wave 4).

**Remediation:**
- Wave 7 GDPR memo (already drafted in §"(c) Operator obligations"
  item 6) documents the operator path: "Operators should answer
  Art. 15 requests by joining on `participant.session_token` (or
  recruitment-link email) and exporting via the admin per-participant
  CSV/JSON endpoints (`exports.py:175-256`)."
- Wave 7 follow-up tracker carries the recommendation to ship a
  participant-facing self-export gated by `session_token`, mirroring
  the existing `/personal-data` Art. 17 route.

**Test:** `backend/tests/security/wave_4/test_subject_rights.py
::test_article_15` — pins the operator path: given a participant
who knows their `session_token`, the admin (acting as data
controller) can resolve that token to a `participant_id` and the
per-participant CSV endpoint delivers their data in machine-readable
form. Defends against accidental regressions of the operator path
that the GDPR memo will rest on.

**Status:** observation; deferred to Wave 7 (memo write-up).

**Source:** Wave 4 inventory §"(c) Operator obligations" item 6;
Wave 7 follow-up tracker bullet "Recommend a participant-facing
Art. 15 self-export".

## GDPR-memo material (load-bearing for Wave 7)

This subsection captures Wave 4's inventory in a form Wave 7's GDPR memo for
self-hosters can ingest verbatim. Three blocks: (a) personal data inventory,
(b) data flows diagram, (c) operator obligations.

### (a) Personal data inventory (for Art. 30 record-of-processing)

**Identifying / quasi-identifying data Qualis stores about participants:**

| Category | Where | Lawful basis (default) | Retention default |
|---|---|---|---|
| Hashed IP (SHA-256 + per-deployment salt) | `participants.ip_address` | Consent (Art. 6(1)(a)); fraud / duplicate detection (Art. 6(1)(f) legitimate interest) | Until anonymisation; operator-driven |
| User-agent string (raw) | `participants.user_agent` | Consent | Until anonymisation; operator-driven |
| Session token (UUID) | `participants.session_token` | Consent (technical session) | Rotated on anonymisation |
| Resume code (memorable, e.g. `swift-river-42`) | `participants.resume_code` | Consent (UX continuity) | Cleared on anonymisation |
| Confirmation code (8 chars from session token) | `participants.confirmation_code` | Consent (post-submission proof) | Cleared on anonymisation |
| Consent hash (versioning marker for the consent text the participant agreed to) | `participants.consent_hash` | Compliance (Art. 7(1) demonstrability) | Cleared on anonymisation; retained in `consented_at` only |
| Free-text presort/postsort answers (study-author-defined survey schema; participant-supplied content) | `participants.presort_answers`, `participants.postsort_answers` | Consent | Cleared on anonymisation (set to `{}`) |
| Free-text per-card comments | `qsort_entries.card_comment` | Consent | **Preserved on anonymisation as research data** — operator obligation to screen before publication |
| Recruitment-link → email mapping (the follow-up bridge) | `recruitment_links.email` joined via `participants.presort_answers->>'_recruitment_token'` | Consent (named in consent text "exception for follow-up") | **Operator-driven** — no automatic teardown |
| Audio recordings (biometric voice data) | S3 objects under `audio/{study_slug}/{participant_token}/{ts}_{question}{ext}`; metadata in `audio_recordings` rows | **Explicit consent (Art. 9 — special category)** required when audio is enabled | Deleted on anonymisation; orphan-swept by operator |
| Anonymisation marker | `participants.anonymised_at` | Compliance (audit trail) | Retained indefinitely |
| Discard flag + reason | `participants.is_discarded`, `participants.discard_reason` | Legitimate interest (research QC) | Retained until study deletion |
| Last-step progress | `participants.last_step_reached`, `participants.last_step_reached_at` | Legitimate interest (UX) | Retained |
| Created/submitted timestamps | `participants.created_at`, `participants.submitted_at`, `participants.consented_at` | Consent (research timeline) | Retained as anonymous research metadata |

**Logs (separate retention regime):**

| Source | Content | Retention |
|---|---|---|
| Uvicorn access log | `request.client.host` (raw IP), method, path, status, response time | Operator log sink (typically systemd-journald default = forever; rotated by operator) |
| `app.audit` logger | Admin actions (anonymise, bulk_anonymise, erase_personal_data, project member changes) — **no PII** | Operator log sink |
| `app.middleware.errors` | 500-class exception detail (URL token-scrubbed by F-03-013 filter); may include study slug | Operator log sink |
| `frontend_error` logger | Frontend-reported error context — `client_ip`, `userAgent`, `url` (token-scrubbed) (`routers/logs.py:36-45`) | Operator log sink |

### (b) Data flows diagram

The lifecycle map in section 2.3 is the verbatim diagram. For Wave 7 narrative use,
the simplified flow is:

```
Participant arrives → consent → drafts in-flight → submission → researcher reporting
                                                              ↘ (researcher option)
                                                                discard / anonymise / erase
```

with these critical edges that operators must understand:

- **Hashed-IP edge:** raw IP → SHA-256(salt+IP) at the service-layer entry point.
  *Caveat:* Uvicorn's access log line precedes the hash and contains the raw IP.
  Self-hosters who care about the consent-text promise must redact the IP at the log
  sink (e.g., journald `LineMax`, fluentd filter, or rsyslog regex).
- **Free-text edge:** `card_comment`, `presort_answers`, `postsort_answers`,
  `draft_responses`, `discard_reason` are participant- or researcher-supplied free
  text. Anonymisation clears the participant-side blobs but **preserves
  `card_comment`** as research data. Researchers must screen before publication.
- **Follow-up edge:** the consent text's "exception for follow-up" is implemented as
  a join through `presort_answers["_recruitment_token"] = recruitment_links.email`.
  *No automatic teardown.* The operator must (a) anonymise the participant and (b)
  delete the recruitment link when the follow-up phase ends.
- **S3 edge:** audio uploads carry the participant's `session_token` in the key.
  Pre-anonymisation, anyone with bucket-list permission can correlate keys to rows.
  Anonymisation deletes the S3 objects, but failures are best-effort (logged at
  warning, not fatal). Operators must run a periodic orphan sweep.

### (c) Operator obligations

The Qualis software covers most of what GDPR demands, but **eight per-deployment
operator actions** are required for legal compliance:

1. **Set `IP_HASH_SALT`.** Production refuses to start without it
   (`utils/crypto.py:19-22`). Use a long random value; do not rotate (would orphan
   existing hashes).
2. **Configure log-sink IP redaction.** Uvicorn access logs contain raw client IPs.
   The Qualis-side `log_scrub` filter only handles query-string tokens, not the IP.
   Operators serious about the consent-text promise must redact at the systemd /
   fluentd / rsyslog layer. (Wave 4 finding to recommend a documented snippet.)
3. **Anonymise after follow-up phase.** Once the follow-up phase ends, run
   `POST /api/admin/studies/{slug}/anonymise-bulk` with a cutoff covering all
   relevant participants; **separately delete the recruitment link** that holds
   the email mapping. `data_retention_months` on the study row is a UI hint, not
   an automatic enforcement — the operator is the policy engine.
4. **Screen `card_comment` and `qsort_entries` free text before publication.**
   Anonymisation does not touch per-card comments (preserved as research data per
   the consent-text "may be quoted to contextualize ... screened to remove revealing
   details" wording). The screening is the operator's job; Qualis cannot do it
   programmatically.
5. **Run an S3 orphan sweep.** When `storage_service.delete_audio` fails (transient
   S3 outage during anonymisation), the audio file remains in the bucket while the
   `audio_recordings` row is deleted. Set up a periodic job that lists `audio/`
   keys and deletes any whose participant_token UUID does not appear in
   `participants.session_token`. Cadence: monthly is reasonable; the bucket is
   small (≤100 MB per study by default, `audio.py:71`).
6. **Handle Article 15 (right of access) requests out-of-band.** Qualis does not
   ship a participant-facing self-export endpoint. The participant's `session_token`
   reaches the row, but the only data-returning route is `/resume/{code}`, which
   gives back draft state, not the full record. Operators should answer Art. 15
   requests by joining on `participant.session_token` (or recruitment-link email)
   and exporting via the admin per-participant CSV/JSON endpoints
   (`exports.py:175-256`). **Wave 4 may recommend a self-serve endpoint as a future
   improvement; defer to Wave 7 to scope.**
7. **Document the discard policy in the study's privacy notice if discard is used.**
   `is_discarded` is a soft flag; the discarded participant's PII still resides on
   the row and survives until anonymisation. If the participant *requested* removal,
   anonymise instead of (or in addition to) discarding.
8. **Operate the audit-log sink.** `app.audit` entries are the legal trail of
   admin actions on personal data (anonymise, erase, role changes). Operators must
   route this logger to a tamper-evident sink (file with rotation + integrity hash,
   or external SIEM). Note: `discard` and **participant self-erase** currently emit
   no audit entry — Wave 4 follow-up.

**Wave 7 follow-up tracker:**

- Recommend a documented systemd / fluentd snippet for IP redaction in access logs.
- Recommend a per-study "follow-up phase ended" UI that auto-runs anonymise-bulk
  and deletes recruitment links in one transaction.
- Recommend a participant-facing Art. 15 self-export (machine-readable JSON) gated
  by session_token, mirroring the existing `/personal-data` Art. 17 route.
- Recommend an abandoned-draft sweeper script (`scripts/cleanup_abandoned_sessions.py`)
  that removes participants with `status='started' AND submitted_at IS NULL AND
  last_step_reached_at < now() - SESSION_TTL_DAYS` — the consent-text promise
  on partial-data retention should not depend on operator memory.

### F-05-008 — Lifecycle mutations on participant data leave no audit trail

**Severity:** minor

**Location:** `backend/app/routers/admin/studies_participants.py:113-155`
(`discard_participant`), `:158-176` (`clear_all_participants`),
`backend/app/routers/participants.py:285-333`
(`participant_self_erase_personal_data`).

**Vulnerability:** `app.audit` is the legal trail for admin actions on
personal data. Two of the lifecycle endpoints
(`bulk_anonymise_old_participants` at `lifecycle.py:300-310` and
`admin_erase_participant_personal_data` at
`studies_participants.py:216-224`) already emit a
``log_admin_action(...)`` row on every mutation. Three did not:

- **`discard_participant`** — flips `is_discarded` / sets
  `discard_reason`; no audit row. Operators investigating "who marked
  this row as discarded and why" had no application-side trail.
- **`clear_all_participants`** — DRAFT-state hard delete of every
  participant row plus their audio. No audit row, even though this
  is the most destructive lifecycle action exposed.
- **`participant_self_erase_personal_data`** — participant-initiated
  Art. 17 erasure. The path converges on the same
  `StudyDataService.anonymise_participant` as the admin paths but
  emitted no audit log entry (no admin actor to attribute, but the
  legal action — erasure of personal data — still warrants a row).

This is **defensive observability**, not a confidentiality leak. The
GDPR-memo "(c) Operator obligations" item 8 already names `app.audit`
as the legal trail for these actions; the gap is that three of the
endpoints failed to write to it.

**Remediation:**
- `discard_participant` now emits `action="discard"` /
  `action="undiscard"` (resource=`participant`, includes
  `study_id`, `previous_is_discarded`).
- `clear_all_participants` now emits
  `action="clear_all_participants"` (resource=`study`, includes
  `slug`, `deleted_participants` count).
- `participant_self_erase_personal_data` now emits
  `action="erase_personal_data"` with `actor_user_id=None` and
  `mode="participant_self"`, mirroring the admin path's
  `mode="admin_mediated"` so an investigator can distinguish the two
  channels in a single grep.

The `actor_user_id=None` convention for system / participant actions
matches the docstring of `log_admin_action` ("None only if the action
is system-initiated"). Operators routing `app.audit` to a SIEM should
filter by `mode=participant_self` to surface participant-initiated
erasures separately from operator actions.

**Test:** `backend/tests/security/wave_4/test_subject_rights.py`:
- `test_article_17_audit_trail` (4 cases — discard / undiscard /
  admin erase / participant self-erase) pins each new line and the
  existing admin erase line as a regression guard.
- `test_clear_all_participants_audit_trail` pins the
  hard-delete trail.

**Status:** closed.

**Source:** Wave 4 inventory §2.3 stage 5 ("discard is missing from
audit log"), stage 6 ("self-erase has no audit row"), §"(c) Operator
obligations" item 8.

### F-05-009 — Anonymisation as the legal Art. 17 endpoint (operator-facing position)

**Severity:** observation

**Location:** `backend/app/routers/participants.py:285-333` docstring;
`backend/app/services/study_data_service.py:73-160`.

**Position:** Qualis treats `StudyDataService.anonymise_participant` —
not a hard `DELETE FROM participants` — as the legal endpoint of an
individual Art. 17 ("right to erasure") request. Anonymisation:

- nulls every direct-PII column (`ip_address`, `user_agent`,
  `confirmation_code`, `resume_code`, `consent_hash`,
  `draft_responses`),
- empties the JSON survey blobs (`presort_answers={}`,
  `postsort_answers={}`),
- rotates `session_token` (the original token can never re-access),
- deletes every `audio_recordings` row and S3 object,
- preserves the participant's Q-sort entries and `card_comment` text
  as anonymous research data per **GDPR Recital 26** ("the principles
  of data protection should not apply to anonymous information,
  namely information which does not relate to an identified or
  identifiable natural person").

This is an operator-facing position, not a code change. Hard-deleting
the row would also lose the research contribution the participant
already consented to (the consent text explicitly says Q-sort
rankings are kept; the participant who wants the rankings gone too
must contact the researcher directly).

**Disposition:** documented in this audit as the rationale for
F-05-008's audit-trail patch, in `participants.py:285-313` docstring,
and in the Wave 7 GDPR memo's "(c) Operator obligations" item 7
(discard policy & anonymisation as Art. 17 endpoint). No code change.

**Test:** `backend/tests/security/wave_4/test_anonymisation_pipeline.py`
already pins the post-anonymisation invariants (PII nulled, qsort
preserved, session_token rotated). F-05-009 is a position note on
those invariants, not a separate code path.

**Status:** observation; no remediation in code.

**Source:** Wave 4 inventory §2.3 stage 7 ("erased — there is no
hard-delete endpoint for an individual participant"), GDPR Recital
26.

### F-05-010 — Raw client IP in `routers/logs.py` frontend-error payload

**Severity:** minor

**Location:** `backend/app/routers/logs.py:34-45`
(pre-fix `client_ip = request.client.host`).

**Vulnerability:** Wave 4 inventory §2.2 (Promise 1, gap 1) flagged
two raw-IP leak paths:

1. **Uvicorn access log** renders `request.client.host` raw at the
   start of every request line. The F-03-013 token-scrubber filter
   (`middleware/log_scrub.py`) only scrubs query parameters
   (`token` / `otp` / `code`); it does not touch the IP, which Uvicorn
   writes before any FastAPI handler runs. **Cannot be fixed cleanly
   in application code** — documented as operator obligation #2 in
   the Wave 7 GDPR memo (systemd-journald `LineMax`, fluentd /
   rsyslog regex at the log-sink layer).

2. **`routers/logs.py`** (the frontend-error report endpoint) built
   `log_payload["ip"] = request.client.host` and passed it as
   `extra=` to `frontend_logger`. The F-03-013 query-string regex
   does **not** match `extra` keys (it only scans the formatted
   message and tuple-form `record.args`), so a real production
   self-hoster routing `frontend_error` to any structured log sink
   (CloudWatch, ELK, Loki) got a raw IP per frontend report.

This is the application-side half of the gap and is fixable.

**Remediation:**
- `routers/logs.py` now hashes the captured IP through
  `app.utils.crypto.hash_ip` (the same SHA-256 + `IP_HASH_SALT`
  truncation that `participants.ip_address` uses) before passing
  it into `log_payload`. The payload key was renamed `ip` →
  `ip_hash` to make the contract self-describing.
- The frontend has no debugging path that needs the raw IP — only
  correlation across reports from the same source, which the hash
  preserves.
- The Uvicorn access-log path is **not fixed in application code**
  (deferred to Wave 7 operator memo as already drafted).

**Test:** `backend/tests/security/wave_4/test_pii_in_logs.py`:
- `test_routers_logs_hashes_client_ip` — fires `POST /api/logs`,
  asserts the rendered `frontend_error` record carries
  `ip_hash=hash_ip("127.0.0.1")` and that the raw IP and the legacy
  `ip` key both vanish.
- `test_routers_logs_handles_missing_client_gracefully` — pins
  graceful behaviour when `request.client` is absent (no crash, no
  spurious salt-only hash).
- `test_application_loggers_do_not_emit_raw_ip_pattern` —
  defence-in-depth source survey: any new file that captures
  `request.client.host` AND emits a logger call referencing the
  captured variable AND does not call `hash_ip` will fail this
  test. Keeps a regression of the pre-fix pattern from sneaking
  back in.

**Status:** closed (application half); Uvicorn access-log raw IP
deferred to Wave 7 operator memo (already drafted in
§"(c) Operator obligations" item 2).

**Source:** Wave 4 inventory §2.2 (Promise 1, gap 1), §"(c) Operator
obligations" item 2.

## Resolved since prior

_Listed by Task 10 if any prior consent-related findings were closed._

## False positives — not filed
