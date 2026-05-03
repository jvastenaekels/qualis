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

- F-01-010 (carry-over from 2026-04-25, severity=minor) — JWT access token lifetime is 8h with no refresh / no revocation on password change.
  Scheduled for Wave 2. Access-token revocation half closed by F-03-010
  (Wave 2 Task 6, commit `94d33870`); refresh-token half pending Wave 2
  Task 10. Source: `01-prior-findings-status.md#f-01-010`.
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
  status (400 `"already exists"` vs 201 user record). **deferred** to Wave 5
  (business-logic abuse): closing this requires a registration redesign
  (return 200 always, send distinct emails to existing-vs-new users) which
  trades enumeration resistance for signup UX — a product decision, not a
  one-line patch. Bounded today by the `5/minute` per-IP rate limit. Source:
  `03-auth-email-flows.md#f-03-008`.
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

## Wave 3 — Multi-tenant isolation
_pending Wave 3 plan._

## Wave 4 — Consent & anonymisation pipeline
_pending Wave 4 plan._

## Wave 5 — Business-logic abuse

- F-03-008 (carry-over from Wave 2, severity=minor) — `/api/register` body+status
  email enumeration. Closing this requires a registration redesign (return 200
  always, send distinct "you already have an account" vs verification emails)
  which trades enumeration resistance for signup UX. Source:
  `03-auth-email-flows.md#f-03-008`.

## Wave 6 — Supply chain

- F-01-013 (carry-over from 2026-04-25, severity=minor) — CSP `style-src 'unsafe-inline'` reduces XSS protection.
  Scheduled for Wave 6 (browser-side hardening fits the build/deploy hygiene cluster; Wave 3 is an alternative home).
  Source: `01-prior-findings-status.md#f-01-013`.
- F-01-002 partial-fix gap (carry-over from 2026-04-25, severity=observation) — gitleaks pre-commit hook /
  CI check was recommended but never implemented. Immediate credential-exposure threat is mitigated
  (`.env.example` shipped, history verified clean), but a defence-in-depth gate against future `.env`
  commits is missing. Scheduled for Wave 6. Source: `01-prior-findings-status.md#f-01-002`.
- F-02-006 (severity=minor) — Dockerfile missing `USER` directive (`backend/Dockerfile:16`).
  **deferred** to Wave 6 supply-chain hardening (operational hygiene). Source: `02-scanner-pass.md#f-02-006`.
- F-02-007 (severity=minor) — nginx forwards unvalidated `$host` header (`frontend/nginx.conf:10`).
  **deferred** to Wave 6 (host-header injection mitigation). Source: `02-scanner-pass.md#f-02-007`.
- NEW (severity=observation) — Add CI gate: `pip-audit` on every PR. Rationale: Wave 1 closed
  F-02-001/002/003 via lockfile-only bumps (pygments, python-dotenv, requests are transitive deps);
  without a CI gate a future `uv lock` could downgrade them if a transitive constraint loosens. Pairs
  naturally with the gitleaks pre-commit gate (F-01-002 partial-fix). Source: Wave 1 review note.
- NEW (severity=observation) — Consider promoting transitive CVE-fixed deps (pygments, python-dotenv,
  requests) to direct entries in `backend/pyproject.toml` with a `>=<fix-version>` floor. Defence-in-depth
  against transitive-constraint drift. Source: Wave 1 review note.

## Wave 7 — Deliverables
_pending Wave 7 plan._

## Deferred items

Items deferred indefinitely (no target wave scheduled yet, or no upstream fix available):

- F-02-004 (pip 26.0, CVE-2026-3219) — no upstream fix available as of 2026-05-03; see Wave 1 entry.
- F-02-005 (xlsx Prototype Pollution/ReDoS) — accepted-risk per `SECURITY.md:25-31`; see Wave 1 entry.
- F-02-008 (semgrep test-router false positive) — false positive, env-gated; see Wave 1 entry.
- F-02-009 (semgrep migration-script false positive) — false positive, no untrusted input; see Wave 1 entry.
