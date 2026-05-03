# Action Backlog — 2026-05-03 Comprehensive Security Audit

Cumulative across all seven waves. Items move through:
`open` → `in-progress (wave N)` → `closed (PR #X)` or `deferred (rationale)`.

## Wave 1

- F-02-001 (severity=minor) — pygments 2.19.2 → 2.20.0 (CVE-2026-4539 ReDoS).
  **closed** in commit `b85e5c89` (bumped lockfile; regression test added in `265ef7b4`).
- F-02-002 (severity=minor) — python-dotenv 1.2.1 → 1.2.2 (CVE-2026-28684 symlink overwrite).
  **closed** in commit `5f9a58fa` (bumped lockfile; regression test added in `265ef7b4`).
- F-02-003 (severity=minor) — requests 2.32.5 → 2.33.1 (CVE-2026-25645 predictable temp file).
  **closed** in commit `5b06f3ea` (bumped lockfile; regression test added in `265ef7b4`).
- F-02-004 (severity=observation) — pip 26.0 (CVE-2026-3219 tar/zip confusion).
  **deferred** — no fix-version available upstream as of 2026-05-03. Revisit at Wave 6 dep audit.
- F-02-005 (severity=minor) — xlsx (Prototype Pollution / ReDoS — no fix available).
  **deferred** — accepted-risk per `SECURITY.md:25-31` (Qualis writes XLSX only, never parses untrusted input).
- F-02-008 (severity=observation) — semgrep `avoid-sqlalchemy-text` in `backend/app/routers/test.py` (env-gated test router).
  **deferred** — false positive; env-gated router uses hardcoded literals only, no untrusted input.
- F-02-009 (severity=observation) — semgrep `avoid-sqlalchemy-text` in operational migration scripts.
  **deferred** — false positive; migration scripts contain no untrusted input.

## Wave 2 — Auth-email flows

- F-01-010 (carry-over from 2026-04-25, severity=minor) — JWT lifetime + revocation.
  **Partially closed**: access-token revocation on password change shipped via F-03-010
  (commit `94d33870`). The refresh-token rotation half is **deferred to Wave 2b**.
  Source: `01-prior-findings-status.md#f-01-010`.
- F-03-001 (severity=observation) — JTI replay race in 2FA-disable confirm.
  **closed** in Wave 2 Task 3: false positive. Inventory + re-read confirmed the
  read-then-insert pattern (`is_jti_consumed`) has no production callers; the live
  gate is the PK-collision pattern in `auth.py:719-722`. Pinned by
  `backend/tests/security/wave_2/test_jti_replay.py`. Source:
  `03-auth-email-flows.md#f-03-001`.
- F-03-002 (severity=observation) — Email-verify and password-reset tokens have no
  JTI denylist (benign-by-gate). Single-use is enforced by adjacent DB state
  (`email_verified_at IS NULL` for verify, `pwa` round-trip for reset).
  **closed** in Wave 2 Task 3: as designed. Pinned by
  `backend/tests/security/wave_2/test_email_verify_replay.py` and
  `backend/tests/security/wave_2/test_password_reset_replay.py`. Source:
  `03-auth-email-flows.md#f-03-002`.
- F-03-003 (severity=minor) — `consumed_email_tokens` cleanup script not
  auto-scheduled. Documented operator action in `docs/guides/deployment.md:217-223`;
  no Procfile or scheduler entry. Volume bound is ~100 KB/year, no security
  boundary. Cleanup contract pinned by
  `backend/tests/security/wave_2/test_consumed_tokens_cleanup.py`. **deferred**
  to Wave 6 supply-chain hardening (Procfile / scheduler wiring). Source:
  `03-auth-email-flows.md#f-03-003`.
- F-03-004 (severity=major) — OTP brute-force exposure: no per-account 24h cap on
  wrong verification attempts. Pre-fix attack ceiling = 14 400 guesses/day/account
  against 6-digit entropy (~1.44 % daily success). **closed** in commit `60c58005`
  (Wave 2 Task 4): `verify_otp` now sums `attempts` over rows in a rolling 24h
  window and raises `OTPLockoutError` (HTTP 429 `twofa_locked`) at cap=30, dropping
  the ceiling to 0.003 %. No migration; reuses the existing `attempts` column.
  Pinned by `backend/tests/security/wave_2/test_otp_brute_force.py` (4 tests).
  Source: `03-auth-email-flows.md#f-03-004`.
- F-03-005 (severity=major) — `/api/token` enumeration via timing differential.
  Pre-fix the unknown-email arm skipped `verify_password`, leaking existence at
  ~339 ms mean delta over N=100. **closed** in commit `f76d0ada` (Wave 2 Task 5):
  added a fixed decoy bcrypt hash (`_LOGIN_DECOY_HASH`) and run `verify_password`
  against it on the no-such-user branch; both 401 arms now spend a bcrypt cycle.
  Pinned by `backend/tests/security/wave_2/test_email_enumeration.py::TestTokenEnumeration`
  (status+body equality, mean delta < 30 ms). Exploit script:
  `.raw/exploits/F-03-005.py`. Source: `03-auth-email-flows.md#f-03-005`.
- F-03-006 (severity=major) — `/api/email/verify/resend` enumeration via timing
  differential. Pre-fix the bcrypt anti-enum pad sat in the `else` branch only,
  leaking known-unverified emails at ~533 ms mean delta. **closed** in commit
  `f76d0ada` (Wave 2 Task 5): moved `get_password_hash` out of `else` so it runs
  unconditionally, mirroring the password-reset-request pattern. Pinned by
  `backend/tests/security/wave_2/test_email_enumeration.py::TestVerifyResendEnumeration`.
  Exploit script: `.raw/exploits/F-03-006.py`.
  Source: `03-auth-email-flows.md#f-03-006`.
- F-03-007 (severity=major) — `/api/2fa/disable/request` enumeration via timing
  differential. Pre-fix same pattern as F-03-006, leaking accounts with email-channel
  2FA enabled at ~595 ms mean delta. **closed** in commit `f76d0ada` (Wave 2
  Task 5): moved the `get_password_hash` pad out of `else`. Pinned by
  `backend/tests/security/wave_2/test_email_enumeration.py::TestTwofaDisableRequestEnumeration`.
  Exploit script: `.raw/exploits/F-03-007.py`.
  Source: `03-auth-email-flows.md#f-03-007`.
- F-03-008 (severity=minor) — `/api/register` enumeration via response body and
  status (400 `"already exists"` vs 201 user record). **closed (backend half)**
  in Wave 5 by F-06-007 (commit `f60e754b`): always-201 contract, identical
  body shape across arms, out-of-band "you already have a Qualis account" email
  to the registered address with a recovery link, constant-time bcrypt before
  the existence SELECT, IntegrityError race-path folded into the same anti-enum
  response. Pinned by `backend/tests/security/wave_5/test_register_enumeration.py`
  (7 tests). UX half (registration page copy) deferred to Wave 5b backlog.
  Source: `03-auth-email-flows.md#f-03-008`, `06-business-logic-abuse.md#f-06-007`.
- F-03-009 (severity=observation) — `/api/password/reset/request` residual
  timing-floor differential. The endpoint is already constant-time at the
  bcrypt level (correct by design pre-Wave-2); the residual ~130 ms minimum-floor
  delta comes from JWT signing + email logging on the success branch. Below
  remediation threshold; the fix would be a refactor moving JWT/email work to
  a background task. **closed (no code change)** — pinned by
  `TestPasswordResetRequestEnumeration` in `test_email_enumeration.py`.
  Source: `03-auth-email-flows.md#f-03-009`.
- F-03-010 (severity=major) — Access tokens not invalidated by password change.
  Pre-fix `create_access_token` minted JWTs without `iat`, and
  `get_current_user` never consulted `password_changed_at`; a leaked bearer
  token survived the full 8h `ACCESS_TOKEN_EXPIRE_MINUTES` window even after
  the user explicitly rotated their password. Closes the access-token half
  of the F-01-010 carry-over. **closed** in commit `94d33870` (Wave 2
  Task 6): `create_access_token` now embeds `iat`; `get_current_user`
  rejects tokens with `iat < int(user.password_changed_at.timestamp())`;
  `change_password` bumps `password_changed_at`. Pinned by
  `backend/tests/security/wave_2/test_session_invalidation.py` (5 tests).
  Exploit script: `.raw/exploits/F-03-010.py`. Source:
  `03-auth-email-flows.md#f-03-010`.
- F-03-011 (severity=major) — No email-change confirmation flow.
  Pre-fix `PATCH /me` wrote `user_update.email` straight to `users.email`
  with no second-factor email loop: no notification to the old address,
  no token issued to either side, no path back for the legitimate owner.
  Any transient authenticated-session compromise (XSS, stolen bearer,
  hijacked browser) converted into permanent account control. **closed**
  in commit `3fb51da8` (Wave 2 Task 7): added `users.pending_email`
  column (migration `a3f1c2e9b4d7`); `PATCH /me` now parks the requested
  address on `pending_email` and dispatches confirm-link to NEW + cancel-link
  to OLD; new endpoints `/api/email-change/confirm` (swap) and
  `/api/email-change/cancel` (clear). Confirm token carries `new_email`
  claim cross-checked against `pending_email` for single-use semantics
  without JTI denylist. PATCH /me responds uniformly whether the target
  is free or taken (anti-enumeration; address-taken case fails at confirm
  time via DB unique constraint, not at PATCH time). Pinned by
  `backend/tests/security/wave_2/test_email_change_confirmation.py`
  (10 tests across 6 classes). Source: `03-auth-email-flows.md#f-03-011`.
- F-03-013 (severity=minor) — Log-scrub regex too narrow + filter
  attached only to `uvicorn.access`. Pre-fix the regex matched
  only `token` / `Token` (missing `TOKEN` and alternate keys
  `otp` / `code`), and only the access logger was filtered —
  `app.middleware.errors` formatted `request.url` directly into
  500 / IntegrityError / ServiceError lines so a 5xx during a
  token-link consume could leak the raw token through the
  application-error pipeline. **closed** in commit `c0064ecf`
  (Wave 2 Task 9): broadened the regex to `(token|otp|code)` with
  `re.IGNORECASE`, preserved the key casing in the redacted
  output, and extended `install_access_log_scrub` to attach the
  same filter to `app.middleware.errors` and `app.routers.logs`
  in addition to `uvicorn.access` (named list documented in the
  module docstring). Pinned by
  `backend/tests/security/wave_2/test_log_scrub.py` (14 tests:
  9-case corpus including `name=token` value-not-key negative
  case, idempotency, application-logger attachment, end-to-end
  redaction through `app.middleware.errors`). Defence-in-depth;
  no exploit filed. Source: `03-auth-email-flows.md#f-03-013`.
- F-03-012 (severity=observation) — JWT clock-skew leeway not configured.
  Every `jwt.decode` call ran with the default `leeway=0`: an `exp` that
  had passed by even one millisecond on the verifier's clock, or an
  access-JWT `iat` lying in the future on the verifier's clock, was
  rejected outright. No exploit — operational hygiene: legitimate
  users on hosts with NTP drift saw false 401s. **closed** in commit
  `d605e770` (Wave 2 Task 8): added `JWT_LEEWAY_SECONDS=30` config; introduced
  `decode_access_token` wrapper so the access-JWT path joins the
  `decode_email_token` / `decode_invitation_token` wrappers; all three
  wrappers pass `leeway=settings.JWT_LEEWAY_SECONDS` to `jwt.decode`.
  Pinned by `backend/tests/security/wave_2/test_clock_skew.py`
  (13 tests across 4 classes: each wrapper gets within-leeway and
  outside-leeway boundaries on both `exp` and `iat`; default value is
  pinned at 30s). Source: `03-auth-email-flows.md#f-03-012`.

### Wave 2b — deferred follow-ups (carry-over from Wave 2)

- F-03-011 follow-up — Wire frontend pending-email UX.
  Status: deferred from Wave 2 (Task 7).
  Scope: `AccountSettingsPage` to display pending_email hint, cancel-pending-change button,
  resend-confirmation button, refresh after confirm/cancel webhook.
  F-03-011 ships the backend dual-confirmation flow but `AccountSettingsPage`
  still renders the email field as `disabled` (the old "contact an admin to
  change" UX). Re-enabling email editing in the UI requires: (a) display a
  "Pending: <new>" hint inline with the email field when `user.pending_email`
  is set; (b) surface a "cancel pending change" affordance that calls
  `/api/email-change/cancel` with a token the user receives by email (not in
  the SPA); (c) surface a "resend confirmation link" affordance (currently
  achievable by re-submitting `PATCH /me` with the same address — the
  duplicate-PATCH idempotence guard means the user must edit-then-revert to
  re-issue, which is awkward); (d) host the `/email-change/confirm` and
  `/email-change/cancel` consume pages in the SPA so the link in the email
  lands on a Qualis page rather than a 404. Out of scope for Wave 2 (~30
  minutes was the threshold; the four-item list above is half a day).
  Source: `03-auth-email-flows.md#f-03-011` (frontend disposition).
- F-01-010 refresh-token rotation (deferred from Wave 2 Task 10).
  Status: deferred to Wave 2b PR.
  Scope: refresh_tokens table + service + /refresh + /logout endpoints + login
  response shape change + frontend auto-refresh integration + multi-device session
  tracking + revocation on password change.
  Source: `01-prior-findings-status.md#f-01-010`, `03-auth-email-flows.md#f-01-010`.

## Wave 3 — Multi-tenant isolation

- F-04-001 (severity=observation) — Cross-tenant IDOR harness over 89 admin routes finds 0 leakage.
  **closed** — harness retained as CI regression guard at `backend/tests/security/wave_3/test_admin_idor_harness.py`.
- F-04-002 (severity=observation) — Recruitment-token cross-study replay rejected by `RecruitmentService.validate_link_token`.
  **closed** — verified in commit `eb01aa93`; regression test pins.
- F-04-003 (severity=observation) — Audio upload ownership session-token-bound; S3 keys carry study_slug + participant_token.
  **closed** — verified in commit `55dbe262`; regression test pins.
- F-04-004 (severity=observation) — Resume-code lookup joins `Study.slug == slug AND resume_code == code`; cross-study returns 404.
  **closed** — verified in commit `ea662c95`; regression test pins.
- F-04-005 (severity=observation) — Bulk-export queries derive `study.id` from path-bound `check_study_permission`; no body/header-trusted tenant claims.
  **closed** — verified in commit `7e9433d4`; regression test pins.
- F-04-006 (severity=minor) — Quota check has TOCTOU race in `quotas.assert_can_add_member` and `assert_can_create_owned_project`.
  **deferred to backlog** — `MAX_MEMBERS_PER_PROJECT` defaults to 0 (unlimited) in OSS; over-fill is recoverable post-hoc and not billing-relevant. Recommended fix when revisited: `SELECT … FOR UPDATE` on the project sentinel row, or DB-level cap constraint. Source: `04-multi-tenant-isolation.md#f-04-006`. Filed in commit `14058c16`.

## Wave 4 — Consent & anonymisation pipeline

- F-05-001 (severity=major) — No pre-submission withdrawal mechanism; consent text
  promised "no partial data will be retained" but `draft_responses` survived
  abandoned sessions indefinitely.
  **closed (backend half)** — added `DELETE /api/study/{slug}/draft?session_token=…`
  in commit `9679e564`. Frontend "I want to start over" button and operator-side
  abandoned-draft sweeper script deferred to Wave 4b. Source:
  `05-consent-anonymisation.md#f-05-001`.
- F-05-002 (severity=minor) — `user_agent` stored raw at write time, contradicting
  the consent text's "such as IP addresses" non-exhaustive direct-identifier
  promise.
  **closed** — added `hash_user_agent` (SHA-256 + IP_HASH_SALT, prefixed with
  `"mobile"`/`"desktop"` device class to preserve the per-study device
  breakdown). Hashing now happens at the `record_consent` and `process_submission`
  entry points; no raw UA reaches the participants table. Source:
  `05-consent-anonymisation.md#f-05-002`.
- F-05-003 (severity=observation) — `qsort_entries.card_comment` preserved through
  anonymisation; participant-supplied free text may contain PII.
  **observation; deferred** — documented as operator screening obligation per
  the consent text; cannot be fixed programmatically (would require
  NER/PII-redaction models out of scope for a research instrument). A Wave 4b
  inline-redaction admin UI is filed below. Source:
  `05-consent-anonymisation.md#f-05-003`.
- F-05-004 (severity=minor) — Audio S3 keys leaked `study_slug` + `participant_token`
  in the path and as object metadata.
  **closed** — added `_hashed_audio_prefix` in storage_service; new uploads use
  `audio/<sha256(slug|token|salt)[:32]>/<timestamp>_<question>.ext`. Stripped
  slug + participant from the S3 Metadata block (only sanitised question kept
  for operator debugging). Pre-existing rows retain their legacy keys; the
  per-row `s3_key` makes both formats addressable for delete/download. Source:
  `05-consent-anonymisation.md#f-05-004`.
- F-05-005 (severity=observation) — Audio S3 anonymisation is fail-open; orphan
  objects survive on S3-side outages. No bucket lifecycle policy.
  **observation; deferred to operator + Wave 7** — fail-open is the right
  posture for legal erasure; the bucket-side lifecycle policy must live in
  S3/Cellar configuration and is documented as operator obligation #5 in the
  GDPR memo. Source: `05-consent-anonymisation.md#f-05-005`.
- F-05-006 (severity=minor) — Per-participant exports (CSV / JSON / audio) included
  anonymised rows; `card_comment` (preserved per F-05-003) rode through to follow-up
  consumers.
  **closed** in commit `6a81a5f8` — added `Participant.anonymised_at IS NULL` filter
  to all three per-participant export endpoints in `routers/admin/exports.py`. Bulk
  exports (CSV/PQMethod/R-Kit/dump/package) intentionally unchanged: analysis exports
  zero out PII columns but anonymised rows still contribute to factor stats. Source:
  `05-consent-anonymisation.md#f-05-006`.
- F-05-007 (severity=observation) — No participant-facing Article 15 self-export
  endpoint.
  **observation; deferred to Wave 7** — operator satisfies Art. 15 today via the
  admin per-participant CSV/JSON endpoints; one-month response window doesn't
  require a self-service portal. A self-serve `GET /api/study/{slug}/personal-data`
  is documented as a Wave 7 follow-up. Source: `05-consent-anonymisation.md#f-05-007`.
- F-05-008 (severity=minor) — Lifecycle mutations (discard / undiscard / per-participant
  erase / clear_all_participants / participant self-erase) emitted no `log_admin_action`
  audit row.
  **closed** in commit `7f736f47` — added audit logging at five sites with mode
  discriminator (`admin_mediated`, `participant_self`, `bulk_anonymise`). Source:
  `05-consent-anonymisation.md#f-05-008`.
- F-05-009 (severity=observation) — Anonymisation-as-Article-17 position.
  **observation; documented** — anonymised data falls outside GDPR scope per
  Recital 26 (no longer personal data); Qualis treats anonymisation as the legal
  Art. 17 endpoint while preserving qsort entries as anonymous research data.
  No code change. Source: `05-consent-anonymisation.md#f-05-009`.
- F-05-010 (severity=minor) — Raw `request.client.host` emitted in `frontend_error`
  logger payload via `routers/logs.py:36-45`.
  **closed** in commit `8a4c8d6c` — IP now hashed via `hash_ip()` before logging;
  payload key renamed `ip` → `ip_hash`. Uvicorn access-log raw IP is operator-side
  fluentd config — documented in Wave 7 GDPR memo §(c) operator obligation #2.
  Source: `05-consent-anonymisation.md#f-05-010`.

### Wave 4b backlog (deferred)

- (Wave 4b, frontend) — Add a "Withdraw / Start over" button on the resume screen
  and the post-consent landing that calls `DELETE /api/study/{slug}/draft`.
  Requires translation keys (`en`, `fr`, `fi`) and a confirm modal.
- (Wave 4b, operator) — Add `backend/scripts/cleanup_abandoned_sessions.py` that
  removes participants with `status='started' AND submitted_at IS NULL AND
  last_step_reached_at < now() - SESSION_TTL_DAYS`. Recommended cadence: weekly cron.
- (Wave 4b, frontend) — Inline card-comment redaction admin UI: researcher
  reviews each comment per-participant before export, marks each as keep /
  scrub / pseudonymise. Out of scope for the backend-only audit PR. Source:
  F-05-003.

## Wave 5 — Business-logic abuse

- F-06-001 (severity=minor) — Resume-code per-code rate-limit lockout
  (distributed brute-force). Per-IP 30/minute alone left the 9M-entropy
  resume-code space enumerable across multiple IPs in days; added a
  layered `10/hour` slowapi limit keyed by `sha256(slug|code)` to bound
  cost to ~100 years per code. **closed** in commit `fdc233da`. Pinned
  by `backend/tests/security/wave_5/test_resume_code_brute_force.py`
  (7 tests, key-function isolation + decorator chain). Source:
  `06-business-logic-abuse.md#f-06-001`.
- F-06-002 (severity=observation) — Draft-responses session-token bearer
  model. Possession of `session_token` = right to read/overwrite/clear
  the draft. Cross-study lookup (Wave 3 F-04-004), per-code rate limit
  (F-06-001), and 122-bit token entropy bound the attacker surface;
  what survives is a shared-device threat already addressed by consent
  text and the explicit "resume on another device" UX promise.
  **closed (no code change)** — pinned by
  `backend/tests/security/wave_5/test_draft_responses_isolation.py`
  (8 tests). Filed in commit `b9c53003`. Source:
  `06-business-logic-abuse.md#f-06-002`.
- F-06-003 (severity=observation) — Recruitment capacity gate uses
  SELECT FOR UPDATE. `increment_usage` runs the read under a row-level
  lock; `validate_link_token` deliberately omits capacity gating. The
  only consumer (`submission_service`) flushes inside the outer
  transaction the router commits, so the lock holds end-to-end.
  **closed (no code change)** — pinned by
  `backend/tests/security/wave_5/test_recruitment_capacity_race.py`
  (5 tests). Filed in commit `5aa21ad5`. Source:
  `06-business-logic-abuse.md#f-06-003`.
- F-06-004 (severity=n/a) — `is_test_run` flag column dropped by
  migration `b3a47d8e9f12`; nothing for a participant to flip on the
  server side. The frontend "preview" button at `StudyDesignPage.tsx:245`
  opens `?mode=test` in a new tab but never reaches the backend.
  **n/a** — the absence is the contract. Filed in commit `d9b89c64`.
  Source: `06-business-logic-abuse.md#f-06-004`.
- F-06-005 (severity=minor) — Audio upload abuse-resistance
  (duration default + sniffed-MIME persistence). Two minor gaps:
  (a) duration cap defaulted to a hard-coded 600s when the study
  config omitted `max_duration_seconds`, twice the configured 300s
  ceiling; (b) S3 `Content-Type` came from `UploadFile.content_type`
  instead of the magic-sniffed value. Both fixed in one commit:
  `validate_audio_file` returns the sniffed MIME, `upload_audio`
  uses it as the storage `content_type`, the duration default reads
  `settings.AUDIO_MAX_DURATION_SECONDS`. **closed** in commit
  `1d8bab2d`. Pinned by
  `backend/tests/security/wave_5/test_audio_upload_abuse.py`
  (6 tests). Pre-existing 14-case `test_audio.py` integration suite
  remains green. Source: `06-business-logic-abuse.md#f-06-005`.
- F-06-006 (severity=observation) — Submission idempotency and
  ownership-claim integrity. `Participant.session_token` unique
  constraint + IntegrityError-rollback path bounds double-submit;
  `SELECT FOR UPDATE` in `_find_or_create_participant` serializes
  concurrent submits; `participant.study_id != study.id` check
  rejects submit-on-behalf; `already_submitted=True` short-circuit
  on completed participants. Doc-cite correction: the Wave 5 plan
  referenced "F-04-003 pinned ownership for submissions" but
  F-04-003 actually pinned audio; submissions use the same
  session_token-bearer model under a different prior ID. **closed
  (no code change)** — pinned by
  `backend/tests/security/wave_5/test_submission_idempotency.py`
  (6 tests). Filed in commit `c468245c`. Source:
  `06-business-logic-abuse.md#f-06-006`.
- F-06-007 (severity=minor) — `/api/register` body+status email
  enumeration (closes Wave 2 carry-over F-03-008). Always-201
  contract, identical body across known/unknown arms, out-of-band
  "you already have a Qualis account" email with recovery link,
  constant-time bcrypt before existence SELECT,
  IntegrityError-race fallback folded into the same anti-enum
  response. **closed (backend half)** in commit `f60e754b`.
  Pinned by `backend/tests/security/wave_5/test_register_enumeration.py`
  (7 tests). Source: `06-business-logic-abuse.md#f-06-007`.

### Wave 5b backlog (deferred)

- (Wave 5b, frontend) — Registration page UX copy after the F-06-007
  always-201 redesign. Today the page renders the legacy "account
  created — check your email" success message regardless of which
  arm the backend took. Honest copy ("if this email is unregistered,
  check your inbox to verify; if it's registered, check your inbox
  to recover") needs (i) a translation-key reformulation across
  en/fr/fi, (ii) a confirm-modal review with stakeholders, (iii)
  removal of any frontend-side body parsing that distinguishes the
  two arms (none today, but pinned). Source:
  `06-business-logic-abuse.md#f-06-007`.
- (Wave 5b, backend) — Optional per-email registration cap. Today
  the limit is `5/minute` per IP; a per-email cap of e.g.
  `50/hour` would slow per-address harassment via the
  always-registered-account email pipeline. Defence-in-depth, not
  load-bearing — the existing rate limits already make per-address
  campaigns unattractive. Source:
  `06-business-logic-abuse.md#f-06-007`.
- (Wave 5b, ops) — If telemetry shows persistent campaigns hitting
  the per-resume-code 10/hour cap, escalate to a DB-backed hard
  lockout with admin-side reset. Today the slowapi limit is
  sufficient; the schema migration is unjustified pending real
  data. Source: `06-business-logic-abuse.md#f-06-001`.

## Wave 6 — Supply chain

- F-01-013 (carry-over from 2026-04-25, severity=minor) — CSP `style-src 'unsafe-inline'` reduces XSS protection.
  **deferred to Wave 6b** in Wave 6 (commit `<wave-doc>`). Rationale: 73 inline-style sites in
  `frontend/src/` including ~6 framer-motion `MotionValue` props (`style={{ x, y, rotate }}`) that
  cannot move to Tailwind classes — they're imperative animation values. Proper fix is a nonce-based
  CSP requiring per-render nonce wiring through React (Vite plugin + ASGI middleware + React context),
  exceeding Wave 6 budget. See `07-supply-chain.md#wave-6b-backlog` for scope.
- F-01-002 partial-fix gap (carry-over from 2026-04-25, severity=observation) — gitleaks pre-commit hook /
  CI check was recommended but never implemented.
  **closed in commit `76763853`** via `.github/workflows/security-scans.yml` `gitleaks` job
  (CLI install + `gitleaks detect --source . --redact`). Source: `01-prior-findings-status.md#f-01-002`.
- F-02-006 (severity=minor) — Dockerfile missing `USER` directive (`backend/Dockerfile:16`).
  **closed in commit `f4c4dd65`**. Backend Dockerfile now creates `app` user (`groupadd` + `useradd`)
  and switches via `USER app` before `CMD`; frontend `nginx:alpine` already drops to UID 101 for
  workers (master must remain root to bind :80, documented in the Dockerfile). Source:
  `02-scanner-pass.md#f-02-006`.
- F-02-007 (severity=minor) — nginx forwards unvalidated `$host` header (`frontend/nginx.conf:10`).
  **closed in commit `f4c4dd65`**. nginx.conf now has `if ($host !~ ^(qualis\.example\.org|localhost|
  127\.0\.0\.1)$) { return 444; }` — operator-editable allowlist; 444 is the documented
  host-header-probe response. Source: `02-scanner-pass.md#f-02-007`.
- NEW (severity=observation) — Add CI gate: `pip-audit` on every PR.
  **closed in commit `76763853`** via `security-scans.yml` `pip-audit` job (mirrors the existing
  ci.yml backend-lint ignore list). Source: Wave 1 review note.
- NEW (severity=observation) — Promote transitive CVE-fixed deps (pygments, python-dotenv, requests)
  to direct entries in `backend/pyproject.toml`.
  **closed in commit `a264d740`**. `pygments>=2.20.0`, `python-dotenv>=1.2.2`, `requests>=2.33.0`
  added as direct deps; regression `test_supply_chain_pinning.py::test_pyproject_pins_wave1_cve_floors`.
  Source: Wave 1 review note.
- NEW (severity=observation) — Add a CI lint rule that flags new `request.url` /
  `request.query_string` formatting in loggers not listed in
  `app.middleware.log_scrub._TARGET_LOGGER_NAMES`.
  **closed in commit `76763853`**. `backend/scripts/lint_logger_urls.py` (pure-stdlib AST walker)
  flags any `logger.<level>(... .url ...)` outside `middleware/errors.py` and `routers/logs.py`;
  wired into `security-scans.yml`. 9 unit tests in `test_lint_logger_urls.py` cover f-string,
  positional, %-format, kwarg, and `self.logger` variants. Source: `03-auth-email-flows.md#f-03-013`.
- F-03-003 (severity=minor) — `consumed_email_tokens` cleanup script not auto-scheduled.
  **closed in commit `b6f20c84`** (documentation). `docs/guides/deployment.md` upgraded to mark
  cleanup as operator-side with concrete Scalingo Scheduler addon + `cron.json` snippet (daily
  04:00 UTC). On platforms other than Scalingo, operators substitute their own scheduler. Source:
  `03-auth-email-flows.md#f-03-003`.
- NEW (severity=observation) — Pin third-party GHA actions by SHA.
  **closed in commit `bb5ac9ac`**. `astral-sh/setup-uv@v5` -> `@d4b2f3b6...86` (v5.4.2),
  `lycheeverse/lychee-action@v1.9.0` -> `@22134d37...9c`,
  `googleapis/release-please-action@v4` -> `@5c625bfb...71`. Pinning policy commented at the
  top of both workflow files. Regression: `test_supply_chain_pinning.py::test_third_party_actions_are_sha_pinned`.
- NEW (severity=observation) — Dependabot config presence.
  **closed in commit `2ba66121`**. `.github/dependabot.yml` covers pip (/backend), npm
  (/frontend), and github-actions (/), all weekly cadence.

## Wave 6b — CSP nonce-based style-src
_Deferred from Wave 6._

- F-01-013 (severity=minor) — CSP `style-src 'unsafe-inline'`. Wave 6
  deferred this with documented rationale (see Wave 6 entry above and
  `07-supply-chain.md#wave-6b-backlog`). Scope: per-request nonce
  attached to every inline style site (`<style nonce="…">`,
  `style={…}`), Vite plugin to inject the nonce build-side, ASGI
  middleware to emit the nonce header, React context to thread the
  nonce through component tree, e2e regression for animated UIs
  (CardStack, SortingAnimation, framer-motion-driven UI). No fixed
  schedule; plan a dedicated wave doc when scoped.

## Wave 7 — Deliverables
_pending Wave 7 plan._

## Deferred items

Items deferred indefinitely (no target wave scheduled yet, or no upstream fix available):

- F-02-004 (pip 26.0, CVE-2026-3219) — no upstream fix available as of 2026-05-03; see Wave 1 entry.
- F-02-005 (xlsx Prototype Pollution/ReDoS) — accepted-risk per `SECURITY.md:25-31`; see Wave 1 entry.
- F-02-008 (semgrep test-router false positive) — false positive, env-gated; see Wave 1 entry.
- F-02-009 (semgrep migration-script false positive) — false positive, no untrusted input; see Wave 1 entry.
- F-04-006 (quota TOCTOU race) — deferred until billing/licensing activates the cap; see Wave 3 entry.
