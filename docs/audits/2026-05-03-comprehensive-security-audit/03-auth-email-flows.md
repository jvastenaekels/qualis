# Wave 2 — Auth-Email Flows

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `71ea5073` of `audit/2-auth-email-flows`

## Scope

Files audited:
- `backend/app/services/email_token_consume_service.py`
- `backend/app/services/email_otp_service.py`
- `backend/app/middleware/log_scrub.py`
- `backend/app/routers/auth.py`
- migrations `cb8732294475_add_auth_email_flows.py`, `fd88287d3f9b_fix_password_changed_at_default.py`

Carry-over: F-01-010 (JWT lifetime + revocation).

## Inventory

This section is orientation, not findings. It traces tokens, codes, denylists and
loggers through the six in-scope files and their immediate dependencies, so the rest
of the audit (Tasks 3-10) can be read without going back to source.

### Token lifecycles

Five token-shaped artefacts cross the auth-email perimeter. Four are JWTs minted
through `create_email_token` / `create_access_token` in
`backend/app/utils/security.py`; the fifth is a numeric OTP managed end-to-end by
`email_otp_service.py`. The `iss` / `aud` pair (`qualis` / `auth-email`) is shared by
the three email-link JWTs and is verified by `decode_email_token` (`security.py:144-154`).

1. **Signup-confirmation token (`purpose="email_verify"`).**
   - Issued in `auth.py:298-304` (registration path) and `auth.py:565-571`
     (`/email/verify/resend`).
   - Claims (per `create_email_token`, `security.py:106-136`):
     `iss="qualis"`, `aud="auth-email"`, `sub=<email>`, `purpose="email_verify"`,
     `iat`, `exp` (`now + 24h` from registration; from the resend route the lifetime
     comes from `settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS`, default 24h),
     `jti=secrets.token_urlsafe(16)`. No `pwa`.
   - Email body: `send_email_verification` (`utils/email.py:131-150`); subject
     "Verify your Qualis account"; URL is `{FRONTEND_URL}/verify-email?token={token}`.
   - Consumed in `auth.py:514-544` (`POST /email/verify`). Side-effects on first
     use: sets `user.email_verified_at = now()`, sets `user.is_active = True`,
     emits `email_verify` audit row. Idempotent: if `email_verified_at` is already
     set the route still returns 200 without DB writes (`auth.py:534-544`).
   - **JTI-tracked? No.** The token relies on the `email_verified_at IS NULL`
     branch alone for single-use semantics. Replay after consume is harmless
     because the gate short-circuits, but the token remains accepted until `exp`.
     (Flagged for Tasks 3 / 8.)

2. **Password-reset token (`purpose="password_reset"`).**
   - Issued in `auth.py:606-614` (`POST /password/reset/request`).
   - Claims: same envelope as above plus mandatory `pwa` claim — the user's
     `password_changed_at` encoded as **microsecond** epoch
     (`int(password_changed_at.timestamp() * 1_000_000)`, `security.py:134`).
     Lifetime = `settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS` (default 1h).
   - Email body: `send_password_reset` (`utils/email.py:153-172`); URL is
     `{FRONTEND_URL}/reset-password?token={token}`.
   - Consumed in `auth.py:619-656` (`POST /password/reset/confirm`).
     `decode_email_token` validates signature, `iss`, `aud`, `exp`, and `purpose`.
     The router additionally re-derives `pwa_now` from
     `user.password_changed_at` and rejects the token with
     `400 token_already_consumed` if the two values disagree (`auth.py:639-643`).
   - Side-effects on success: rotate `hashed_password`, set
     `password_changed_at = now()`, call `invalidate_active_otps(db, user)`
     (kills any in-flight 2FA-email OTPs), emit `password_reset_confirm`
     audit row.
   - **JTI-tracked? No.** Single-use enforced by the `pwa` round-trip: rotating
     the password updates `password_changed_at` and any stale token's `pwa`
     no longer matches. (Flagged for Task 6 — the rotation does not invalidate
     the **access JWT** issued from `/token`, which has `subject=email` and
     no `pwa`.)

3. **Email-change confirmation token.** **Does not exist.** `PATCH /me`
   (`auth.py:312-353`) accepts `user_update.email`, checks uniqueness, and
   writes the new value directly. There is no second-factor email loop:
   no token issued to either the old or the new address. (Flagged for Task 7.)

4. **2FA-disable token (`purpose="twofa_disable"`).**
   - Issued in `auth.py:677-685` (`POST /2fa/disable/request`). Lifetime =
     `settings.TWOFA_DISABLE_TOKEN_EXPIRE_MINUTES` (default 15 min).
   - Claims: same envelope as `email_verify` (no `pwa`).
   - Email body: `send_twofa_disable_link` (`utils/email.py:175-196`);
     URL is `{FRONTEND_URL}/2fa/disable?token={token}`.
   - Consumed in `auth.py:693-747` (`POST /2fa/disable/confirm`).
     `mark_jti_consumed` runs **before** the user lookup (`auth.py:719`), so
     the row is inserted (and the JTI burned) regardless of whether the
     subject email maps to a real user — anti-enumeration.
     `IntegrityError` on duplicate JTI maps to `409 token_already_consumed`.
   - Side-effects on first valid use: set `is_totp_enabled=False`, null
     `totp_secret` and `totp_channel`, send `send_twofa_disabled_notification`
     to the user (with ISO-8601 timestamp and best-effort client IP from
     `request.client.host`), emit `twofa_disable_confirm` audit row.
   - **JTI-tracked? Yes** — only flow that writes to `consumed_email_tokens`.

5. **2FA email-OTP code (numeric, not a JWT).**
   - Issued in `email_otp_service.issue_otp` (`email_otp_service.py:40-63`),
     called from `auth.py:131` during the email-channel branch of `/token`.
   - Format: 6-digit string `f"{secrets.randbelow(1_000_000):06d}"`
     (`email_otp_service.py:55`). Storage: row in `twofa_email_otp_codes`
     with bcrypt-hashed code (`get_password_hash`, `email_otp_service.py:58`),
     `expires_at = now + TWOFA_EMAIL_OTP_EXPIRE_MINUTES`,
     `attempts=0`, `used_at=NULL`.
   - Email body: `send_twofa_login_otp` (`utils/email.py:224-244`); subject
     "Your Qualis login code"; the plaintext code is rendered inline in HTML.
   - Verified in `email_otp_service.verify_otp` (`email_otp_service.py:66-76`),
     called from `auth.py:139`. Failure increments `row.attempts`; success
     sets `row.used_at = now`. The row is rejected outright if
     `expires_at <= now` or `attempts >= 5`.
   - Resend cooldown: `issue_otp` raises `OTPRateLimitError` if a non-used
     code from the same user was created within
     `TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS` (default 30s). `auth.py:131-134`
     maps the exception to `HTTP 429`.
   - **JTI-tracked? N/A** (not a JWT). Single-use is the `used_at IS NULL`
     filter on `_get_active_code` (`email_otp_service.py:27-37`).

### JTI denylist

Schema (`consumed_email_tokens`, migration
`backend/db_migrations/versions/cb8732294475_add_auth_email_flows.py:24-29`,
ORM `app/models/email_token.py:16-23`):

| Column        | Type                       | Constraints                       |
|---------------|----------------------------|-----------------------------------|
| `jti`         | `String`                   | `PRIMARY KEY` (uniqueness on JTI) |
| `purpose`     | `String`                   | `NOT NULL`                        |
| `consumed_at` | `DateTime(timezone=True)`  | `NOT NULL`, `server_default=NOW()`|

The PK on `jti` is the race-defense mechanism: concurrent attempts to consume
the same token race on `INSERT`; exactly one wins, the other raises
`IntegrityError`. `auth.py:719-722` traps that error and returns
`409 token_already_consumed`. (Flagged for Task 3 — the read-then-insert
pattern in `is_jti_consumed` is unused; the actual gate is the PK collision.)

**Cleanup:**
- `cleanup_consumed(db, older_than)` (`email_token_consume_service.py:31-36`)
  bulk-deletes rows older than the cutoff.
- The only caller is `backend/scripts/cleanup_consumed_email_tokens.py`
  (`older_than=timedelta(days=7)`).
- The script is **not scheduled** by `Procfile` (only `postdeploy` and `web`
  process types are declared). No cron, no Scalingo scheduler entry checked
  in. So the table grows monotonically at ~one row per 2FA-disable
  confirmation in production. (Flagged for Task 3 — capacity-only concern,
  not a security finding.)

**Usage sites of the JTI helpers** (whole repo):
- `mark_jti_consumed` — exactly one production call site:
  `auth.py:719` (twofa_disable_confirm). Tests:
  `tests/unit/test_email_token_consume_service.py:23, 28, 31`.
- `is_jti_consumed` — **no production callers.** Defined and tested only
  (`tests/unit/test_email_token_consume_service.py:20, 25, 51-52`,
  `vulture_whitelist.py:374`). The 2FA-disable flow uses the PK-collision
  pattern instead.
- `cleanup_consumed` — script + tests, as above
  (`vulture_whitelist.py:375`).

### OTP entropy + rate limits

Source: `backend/app/services/email_otp_service.py`,
`backend/app/routers/auth.py:78-179`,
`backend/app/core/config.py:77-78`.

- **Entropy.** Code length 6 decimal digits, character set `[0-9]`, drawn from
  `secrets.randbelow(1_000_000)` (`email_otp_service.py:55`). Range
  0–999_999 → ~19.93 bits of entropy per code.
- **Hashing at rest.** Codes stored bcrypt-hashed in `twofa_email_otp_codes.code_hash`
  via `get_password_hash` (default bcrypt cost). Plaintext lives only in the
  `issue_otp` return value and the email body; never persisted.
- **Per-row attempt cap.** `verify_otp` rejects rows with `attempts >= 5`
  (`email_otp_service.py:70`). Failed attempts increment `row.attempts`
  (`email_otp_service.py:73`) but the increment is only flushed if the
  surrounding request commits — `auth.py:140` always commits regardless of
  outcome, so the counter persists. After 5 failures the row is dead, but a
  new `issue_otp` call (subject to the 30 s resend cooldown) creates a fresh
  row with `attempts=0`. (Flagged for Task 4 — there is no per-user lifetime
  cap on issuance, only the 30 s gap between issuances.)
- **Resend cooldown.** `TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS` default 30
  (`config.py:78`). Enforced in `issue_otp` (`email_otp_service.py:46-51`).
- **Expiry.** `TWOFA_EMAIL_OTP_EXPIRE_MINUTES` default 5 (`config.py:77`).
  Enforced both at issue time (`expires_at = now + delta`,
  `email_otp_service.py:59`) and verify time (`row.expires_at <= now`,
  `email_otp_service.py:70`).
- **Issue endpoint rate limits.** OTP issuance is **not a standalone endpoint**.
  It piggybacks on `POST /token` (`auth.py:78-179`) when the user has 2FA
  enabled with `totp_channel='email'`. The route carries
  `@limiter.limit("5/minute")` (`auth.py:79`) keyed by `_get_real_ip`
  (`limiter.py:15-39`). There is **no email-hash key** on `/token`, only on
  `/email/verify/resend`, `/password/reset/request`, and `/2fa/disable/request`
  (`auth.py:548-549, 580-581, 660-661`, all 3/hour per IP + 3/hour per
  email-hash). (Flagged for Task 4 — 5/minute per IP allows ~7200 issuances
  per day per attacker IP; combined with 6-digit entropy and a 30 s cooldown
  per *user*, the dominating cost is the OTP cooldown, not the route limit.)

### Log scrubbing

Source: `backend/app/middleware/log_scrub.py`.

- **Regex.** `re.compile(r"([?&])([Tt]oken)=[^&]*")` (line 17). Replaces
  `?token=…` and `&token=…` (also `?Token=…`) with `?token=REDACTED`. Anchors
  on a `?` or `&` separator and a literal `token=` key. Stops at the next `&`
  or end-of-string.
- **Loggers it attaches to.** Only `uvicorn.access`
  (`log_scrub.py:42`, called from `app/main.py:53`). The filter mutates
  `record.args` in place so the rendered access-log line never carries the
  raw token. The companion defense is `Referrer-Policy: no-referrer` on the
  consume pages (mentioned in the module docstring; verified in
  `app/middleware/security.py` is out-of-scope here, flagged for Task 9).
- **Loggers it does NOT attach to.** Every application logger created via
  `logging.getLogger(__name__)` is unfiltered. Inventory of those (from
  `grep -rE 'logger = logging.getLogger' backend/app/`):
  `app.middleware.errors`, `app.utils.email`, `app.routers.auth`,
  `app.routers.admin.exports`, `app.routers.admin.studies_import_export`,
  `app.utils.audit` (`app.audit`), `app.main`, `app.routers.admin.memos`,
  `app.routers.admin.concourses`, `app.services.study_service`,
  `app.services.concourse_service`, `app.routers.submissions`,
  `app.routers.admin.analysis`, `app.schema_validation`,
  `app.routers.admin.studies`, `app.routers.logs` (`frontend_error`),
  `app.routers.admin.studies_participants`, `app.routers.admin.projects`,
  `app.routers.admin.lifecycle`, `app.services.storage_service`,
  `app.services.analysis_service`, `app.services.study_data_service`,
  `app.services.submission_service`, `app.services.export_service`. The
  routes most likely to receive a tokenised path in their own log lines
  are `app.routers.auth` (200/400/409/422 rendering) and
  `app.middleware.errors` (500 traceback handler — would log the request URL
  if `exc_info` includes the request). (Flagged for Task 9.)

### Session/JWT lifetime

Source: `backend/app/core/config.py:15-19`,
`backend/app/utils/security.py:46-61`,
`backend/app/dependencies.py:32-60`,
`backend/db_migrations/versions/fd88287d3f9b_fix_password_changed_at_default.py`.

- **Algorithm + secret.** `settings.ALGORITHM = "HS256"` (`config.py:17`);
  `settings.SECRET_KEY` is HS256-symmetric, default
  `"CHANGEME-insecure-dev-only"` (`config.py:16`), env-overridable. Same key
  signs the `/token` access JWT, the email-link JWTs, and the invitation JWT.
- **Lifetime.** `settings.ACCESS_TOKEN_EXPIRE_MINUTES = 480` (8h,
  `config.py:18`). The default is hard-coded in
  `create_access_token` (`security.py:46-61`); the route at `auth.py:173-176`
  passes the configured value explicitly.
- **Claims on the access JWT.** Only `sub=<email>` and `exp`
  (`security.py:57`). No `iat`, `iss`, `aud`, `jti`, **no `pwa`**, no role,
  no scope. `decode` happens in `dependencies.get_current_user`
  (`dependencies.py:42-44`), which validates only signature + algorithm + `exp`
  (default `jwt.decode` behaviour) and looks up the user by `email`.
- **`password_changed_at` on JWT decode.** `grep` for `password_changed_at`
  in `app/utils/security.py` and `app/dependencies.py`: **zero matches**
  on any decode path. The field is read by `auth.py:611, 640` (issue and
  consume password-reset tokens) and by `models/user.py:42-47`. The
  `get_current_user` flow does not consult it, so an access JWT minted before
  a password rotation remains valid until its `exp` (up to 8h later).
- **`fix_password_changed_at_default` migration
  (`fd88287d3f9b_fix_password_changed_at_default.py`).** The previous
  migration (`cb8732294475`) added `password_changed_at` as nullable, backfilled
  existing rows with `NOW()`, then `alter_column` to NOT NULL — without ever
  setting a DDL-level `server_default`. Any subsequent INSERT that omitted
  the column failed the NOT NULL constraint. `fd88287d3f9b` re-asserts
  `server_default=NOW()` so future INSERTs (raw SQL or any path bypassing
  the ORM-side `default=lambda: datetime.now(timezone.utc)`) succeed.
  Functional fix; no security implication beyond not breaking the password-
  rotation flow.
- Whether the lifetime/revocation gap (carry-over F-01-010) holds in current
  code is verified in Tasks 6 + 10.

### Configuration table

Every `settings.<NAME>` consulted by the six in-scope files (or by their
direct dependencies that are reached from those files). Defaults and env-var
mappings come from `backend/app/core/config.py`.

| Name                                       | Default                           | Env var                                  | Purpose                                                                                                  |
|--------------------------------------------|-----------------------------------|------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `SECRET_KEY`                               | `"CHANGEME-insecure-dev-only"`    | `SECRET_KEY`                             | HS256 signing key shared by access JWT, email-link JWTs, and invitation JWTs.                             |
| `ALGORITHM`                                | `"HS256"`                         | `ALGORITHM`                              | JWT signing algorithm (`security.py:59, 100, 147`; `dependencies.py:43`).                                 |
| `ACCESS_TOKEN_EXPIRE_MINUTES`              | `480` (8h)                        | `ACCESS_TOKEN_EXPIRE_MINUTES`            | `/token` access-JWT lifetime (`auth.py:173`).                                                             |
| `FRONTEND_URL`                             | `"http://localhost:5173"`         | `FRONTEND_URL`                           | Base URL embedded into every email-link token URL (`auth.py:303, 570, 613, 684`).                         |
| `EMAIL_VERIFICATION_REQUIRED`              | `True`                            | `EMAIL_VERIFICATION_REQUIRED`            | Operator opt-in for the verification gate. Combined with SMTP config to derive `email_verification_active`.|
| `EMAIL_VERIFY_TOKEN_EXPIRE_HOURS`          | `24`                              | `EMAIL_VERIFY_TOKEN_EXPIRE_HOURS`        | Lifetime of the email-verify JWT issued by the resend route (`auth.py:568`).                              |
| `PASSWORD_RESET_TOKEN_EXPIRE_HOURS`        | `1`                               | `PASSWORD_RESET_TOKEN_EXPIRE_HOURS`      | Lifetime of the password-reset JWT (`auth.py:610`).                                                       |
| `TWOFA_DISABLE_TOKEN_EXPIRE_MINUTES`       | `15`                              | `TWOFA_DISABLE_TOKEN_EXPIRE_MINUTES`     | Lifetime of the 2FA-disable JWT (`auth.py:681`).                                                          |
| `TWOFA_EMAIL_OTP_EXPIRE_MINUTES`           | `5`                               | `TWOFA_EMAIL_OTP_EXPIRE_MINUTES`         | Lifetime of an email-OTP code row (`email_otp_service.py:59`).                                            |
| `TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS`  | `30`                              | `TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS`| Per-user issue cooldown (`email_otp_service.py:46-51`).                                                   |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD`| `None`                            | (matching env var per name)              | Drives `is_smtp_configured`; if any is empty, `_send_or_log` writes the email body to stdout.             |
| `EMAILS_FROM_EMAIL` / `EMAILS_FROM_NAME`   | `None`                            | (matching env var per name)              | From address / display name for outbound mail. `effective_emails_from_name` falls back to `PROJECT_NAME`. |
| `TRUSTED_PROXIES`                          | `""` (empty list)                 | `TRUSTED_PROXIES`                        | Trust gate for `X-Forwarded-For` in `_get_real_ip` (`limiter.py:30-39`).                                  |
| `IP_HASH_SALT`                             | `"CHANGEME-insecure-dev-only"`    | `IP_HASH_SALT`                           | Salt for IP-hashing in audit logs (consumed by `app.utils.audit` reached from `auth.py`).                 |
| `ENVIRONMENT`                              | `"production"`                    | `ENVIRONMENT`                            | Tags Sentry events; toggles dev-only behaviours elsewhere.                                                |

Derived properties consulted from in-scope files:

- `settings.email_verification_active` (`config.py:146-151`) — true iff
  `EMAIL_VERIFICATION_REQUIRED` is set **and** `is_smtp_configured`.
  Read in `auth.py:117, 242` to gate the post-password verification check on
  `/token` and to choose between the active-from-creation and
  pending-verification paths in `/register`.
- `settings.is_smtp_configured` (`config.py:135-143`) — feeds the above and
  controls `_send_or_log`'s send-vs-log fallback.
- `settings.trusted_proxies_list` (`config.py:42-43`) — consumed by
  `_get_real_ip` for the `X-Forwarded-For` trust gate, which keys all the
  rate limiters declared on `auth.py`.

## Summary

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 6 |
| minor | 2 |
| observation | 2 |

## Findings

### F-03-001 — JTI replay race in 2FA-disable confirm (false positive)

- **Severity:** observation
- **Audience:** internal-audit
- **Location:** `backend/app/services/email_token_consume_service.py:18-28`,
  `backend/app/routers/auth.py:710-722`
- **Tool:** static review
- **Observation:** The plan-stage worry was a TOCTOU race between
  `is_jti_consumed` (read) and `mark_jti_consumed` (write) — a pattern where
  two concurrent confirm requests both pass the read check, then both insert,
  both commit, and both run the side-effect. Re-reading the code confirms this
  pattern does **not** exist in production:
  - `is_jti_consumed` has zero production callers (kept alive only by
    `vulture_whitelist.py:374` and the unit-test file
    `tests/unit/test_email_token_consume_service.py:20, 25, 51-52`).
  - The single production gate, `twofa_disable_confirm`, calls
    `mark_jti_consumed` **first** (`auth.py:719`) and traps the
    `IntegrityError` from the PK collision on duplicate JTI
    (`auth.py:720-722`). The PK on `consumed_email_tokens.jti`
    (`db_migrations/versions/cb8732294475_add_auth_email_flows.py:24-29`)
    serialises concurrent inserts at the database layer.
  - The user-mutating side-effects (`is_totp_enabled=False`, `totp_secret=None`,
    notification email, audit row) all run **after** the successful insert. A
    concurrent attempt that loses the PK race exits at line 722 before any of
    them runs.
- **Impact:** none. The finding is a false positive.
- **Recommendation:** retain the PK-collision pattern. Pin it with a
  regression test so a future refactor cannot silently re-introduce
  `is_jti_consumed` as a guard.
- **Effort:** done (regression test).
- **Disposition:** false positive — PK-collision pattern handles concurrent
  consume; closed inline.
- **Exploit script:** none (observation severity).
- **Regression test:** `backend/tests/security/wave_2/test_jti_replay.py`
  (3 tests: PK collision at the service layer, sequential 200 → 409 at the
  router layer, anti-enum jti-burn-before-user-lookup).

### F-03-002 — Email-verify and password-reset tokens have no JTI denylist (benign-by-gate)

- **Severity:** observation
- **Audience:** internal-audit
- **Location:**
  - email-verify: `backend/app/routers/auth.py:514-544`
  - password-reset: `backend/app/routers/auth.py:619-656`
  - token shape: `backend/app/utils/security.py:106-136`
- **Tool:** static review
- **Observation:** Three of the four email-link JWTs (signup verify, password
  reset, 2FA-disable) carry a `jti` claim, but only the 2FA-disable flow writes
  to `consumed_email_tokens`. The other two rely on adjacent DB state for
  single-use semantics:
  - **Email-verify.** `verify_email` (auth.py:534) gates the side-effect on
    `if user.email_verified_at is None`. On replay after first consume, the
    branch is skipped, no row is mutated, no audit row is emitted, and the
    response is a no-op `200 ok`. The token remains accepted by
    `decode_email_token` until `exp` (24h default) but produces zero
    observable side-effects.
  - **Password-reset.** `password_reset_confirm` (auth.py:639-643) re-derives
    `pwa_now = int(user.password_changed_at.timestamp() * 1_000_000)` and 400s
    if it disagrees with the token's `pwa` claim. A successful consume sets
    `password_changed_at = now()` (auth.py:646), so any further replay's `pwa`
    no longer matches. Single-use enforced.
- **Impact:** none in the post-consume window. The pre-consume window between
  issue and first use is the standard email-channel attack model: an attacker
  with read access to the mailbox can use the token once before the legitimate
  owner. This is "as designed" for email-link auth flows; mitigation is the
  short `PASSWORD_RESET_TOKEN_EXPIRE_HOURS=1` (and `Referrer-Policy: no-referrer`
  on the consume page, out-of-scope here, flagged for Task 9).
- **Recommendation:** no code change. Pin both invariants with regression
  tests so a future refactor cannot silently remove the gates (e.g. by
  switching to an unconditional UPSERT on email-verify, or by emitting an
  audit row outside the `if` block).
- **Effort:** done (regression tests).
- **Disposition:** observation — gate-based single-use is correct as designed;
  closed inline.
- **Exploit script:** none (observation severity).
- **Regression test:**
  - `backend/tests/security/wave_2/test_email_verify_replay.py` (3 tests:
    idempotent replay, anti-enum 200 for unknown user, expired token rejected).
  - `backend/tests/security/wave_2/test_password_reset_replay.py` (3 tests:
    post-consume replay → 400, stale-pwa rejection, tampered token → 400).

### F-03-003 — `consumed_email_tokens` cleanup script not auto-scheduled

- **Severity:** minor
- **Audience:** operator
- **Location:** `backend/scripts/cleanup_consumed_email_tokens.py`,
  `Procfile`, `docs/guides/deployment.md:217-223`
- **Tool:** static review
- **Observation:** `cleanup_consumed(db, older_than=timedelta(days=7))`
  (`email_token_consume_service.py:31-36`) is the only path that prunes the
  denylist, and its sole caller is the `cleanup_consumed_email_tokens.py`
  script. The repo's `Procfile` declares `postdeploy` (one-shot migration
  runner) and `web` (gunicorn) process types only — no `worker` or
  `scheduler` line. No Scalingo scheduler config, no cron config, no GitHub
  Actions schedule are checked in. The cron line is documented in
  `docs/guides/deployment.md:217-223` as an operator action.
- **Impact:** capacity hygiene only, no security boundary. Each row is
  ~100 bytes; at an upper bound of 1000 2FA-disable confirmations per year,
  that is ~100 KB/year of growth. Stale rows do not affect correctness —
  the JTI is the PK, lookups are O(log n), and the denylist's purpose
  (prevent replay within `exp`, max 15 minutes for 2FA-disable) is unaffected
  by retaining old rows.
- **Recommendation:** defer infrastructure wiring to Wave 6 (supply-chain
  hardening) where `Procfile` and operator runbook changes belong. This wave
  ships only a regression test pinning the cleanup contract (so a future
  refactor that flips the comparator does not silently delete the live
  denylist).
- **Effort:** S — one Procfile line plus a note in `deployment.md` to remove
  the manual cron entry, in Wave 6.
- **Disposition:** defer to Wave 6 supply-chain hardening; documentation is
  already in place.
- **Exploit script:** none (minor severity, no security boundary).
- **Regression test:**
  `backend/tests/security/wave_2/test_consumed_tokens_cleanup.py` (2 tests:
  cleanup deletes only rows older than the cutoff; cleanup against a fresh
  denylist is a no-op).

### F-03-004 — OTP brute-force exposure (no per-account 24h cap)

- **Severity:** major
- **Audience:** internal-audit
- **Location:**
  - `backend/app/services/email_otp_service.py:66-76` (pre-fix `verify_otp`)
  - `backend/app/routers/auth.py:128-152` (pre-fix `/token` email-channel branch)
  - `backend/app/core/config.py:77-78` (`TWOFA_EMAIL_OTP_EXPIRE_MINUTES`,
    `TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS`)
- **Tool:** static review + exploit script
  (`.raw/exploits/F-03-004.py`)
- **Observation:** The 6-digit OTP carries ~19.93 bits of entropy
  (10⁶ codes). Three rate-limit layers operate on the verify path
  pre-fix: the per-row `attempts >= 5` cap (`email_otp_service.py:70`),
  the 30 s `TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS` resend cooldown
  (`email_otp_service.py:46-51`), and the IP-keyed `5/minute` slowapi
  limit on `/token` (`auth.py:79`). None of them caps wrong attempts
  *per account over a long window*. Once an attacker holds the
  email/password pair (e.g. via prior breach or password reuse), they
  can spin a fresh code every 30 s — 2 codes/min × 60 × 24 = 2 880
  codes/day × 5 attempts/code = **14 400 wrong guesses/day per
  account**. Against 6-digit entropy that is a ~1.44 % daily success
  probability and ~9.6 % over a week. The IP limit is irrelevant
  beyond the first request: the attacker can rotate IPs, and the
  attack is bound by the per-user cooldown, not the per-IP route limit.
  Severity is **major** rather than blocker because the attack still
  requires an authenticated identity (correct email + password); but
  it punches through 2FA, which is exactly the case 2FA is meant to
  defend against. The exploit script demonstrates the gap by patching
  the cooldown to 0 s and running 100 wrong attempts without a single
  lockout response.
- **Impact:** an attacker who has a victim's password (post-breach,
  credential-stuffing, phishing) defeats email-channel 2FA in roughly
  one week of unattended brute-forcing per account, with no signal to
  the victim other than 2 880/day login-OTP emails. The login-OTP
  email contains the plaintext code, so any concurrent mailbox-read
  attack also lands the code; but the brute-force path bypasses the
  mailbox channel entirely.
- **Recommendation:** add a per-account 24h ceiling on wrong
  verification attempts. Implementation: in `verify_otp`, sum
  `TwoFAEmailOTPCode.attempts` over rows with `created_at` in the last
  24h; if the running sum has reached `TWOFA_OTP_WRONG_ATTEMPT_CAP_24H`
  (default 30), raise `OTPLockoutError` before the per-row
  branch. The router maps the exception to HTTP 429 with detail
  `twofa_locked` and emits a `twofa_login_locked` audit row. The cap
  is a **rolling** window — older rows age out as their `created_at`
  passes 24h, so legitimate users recover without admin intervention
  even after a sustained attack. No migration is required: the
  existing `attempts` column is already a per-row counter.
  At cap=30 the daily attack ceiling collapses from 14 400 → 30
  guesses/day, i.e. a 0.003 % daily probability per account.
  Per-IP rate limits on the OTP-issue path are deliberately **not**
  added: `/token` is the OTP-issue endpoint, and the existing
  `5/minute` per-IP limit is already calibrated for legitimate login
  traffic. Tightening it further would degrade UX for real users
  while adding no defense the per-account cap doesn't already
  provide (the per-account cap is account-scoped, so attacker IP
  rotation does not help). The per-account cap also bounds the
  pre-fix log-flooding attack (an attacker spinning codes to send
  thousands of legit-looking 2FA emails to the victim).
- **Effort:** S — one new helper (`_count_wrong_attempts_24h`),
  one new exception (`OTPLockoutError`), one new constant
  (`TWOFA_OTP_WRONG_ATTEMPT_CAP_24H`), one router try/except branch
  with audit logging; no migration, no schema change.
- **Disposition:** fixed in this PR.
- **Exploit script:** `.raw/exploits/F-03-004.py`. PRE-FIX (without
  the cap) the script runs 100 wrong attempts across 20 issue/verify
  cycles unimpeded and exits 1. POST-FIX it observes
  `OTPLockoutError` at attempt 30 and exits 0. The 30 s resend
  cooldown is patched to 0 s so the script runs in <10 s of
  wall-clock instead of ~50 minutes.
- **Regression test:** `backend/tests/security/wave_2/test_otp_brute_force.py`
  (4 tests: service-layer raise at cap+1; below-cap returns False
  without raising; router maps to HTTP 429 `twofa_locked`; rolling
  window — rows older than 24h drop out of the cap and verification
  resumes).

### F-03-005 — `/api/token` email enumeration via timing differential

- **Severity:** major
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/routers/auth.py:97-119` (pre-fix login flow)
- **Tool:** static review + black-box timing probe + exploit script
  (`.raw/exploits/F-03-005.py`)
- **Observation:** The pre-fix `/api/token` handler short-circuited on
  `if not user or not verify_password(...)`. When the email did not
  match a user row, `verify_password` was skipped entirely — the
  unknown arm returned a 401 in ~5 ms (DB SELECT only), while the
  known arm spent ~340 ms running bcrypt at cost 12. Both arms
  returned the byte-identical body `{"code": "unauthorized",
  "message": "Incorrect username or password", "details": null}`, so
  response inspection alone did not enumerate. Black-box probing
  with N=100 samples per arm measured a **mean delta of 339 ms,
  stdev ~10 ms** — separation is unambiguous after a single sample.
  The standard SOSS recommendation is to hash a decoy on the
  no-such-user branch so both arms spend a bcrypt cycle.
- **Impact:** any caller that can reach `/api/token` (the public
  login endpoint) can enumerate registered email addresses at the
  current `5/minute` per-IP rate limit (~7 200 probes/day per
  attacker IP, scaling linearly across rotated IPs). The leak feeds
  every downstream phish/credential-stuffing campaign and undermines
  the anti-enum work already done on `/email/verify/resend`,
  `/password/reset/request` and `/2fa/disable/request`: those
  endpoints became uniform-by-design while the front door
  enumerated.
- **Recommendation:** introduce a fixed module-level decoy bcrypt
  hash (`_LOGIN_DECOY_HASH`, generated once with `bcrypt.hashpw`).
  When `user is None`, call `verify_password(form_data.password,
  _LOGIN_DECOY_HASH)` and discard the result before raising 401.
  Both arms now run one cost-12 bcrypt; the timing channel
  collapses to sub-millisecond noise.
- **Effort:** S — one constant, one branch reorganisation; no
  schema change, no new dependency.
- **Disposition:** fixed in this PR.
- **Exploit script:** `.raw/exploits/F-03-005.py`. Pre-fix it
  measures mean_known=199 ms, mean_unknown=3 ms, delta=196 ms
  (above 100 ms threshold) and exits 1. Post-fix it measures
  delta=0.10 ms and exits 0.
- **Regression test:** `backend/tests/security/wave_2/test_email_enumeration.py::TestTokenEnumeration`
  (2 tests: status+body equality across arms; mean timing delta
  < 30 ms over N=20 samples — CI-tolerant bound).

### F-03-006 — `/api/email/verify/resend` email enumeration via timing differential

- **Severity:** major
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/routers/auth.py:583-595` (pre-fix branch)
- **Tool:** static review + black-box timing probe + exploit script
  (`.raw/exploits/F-03-006.py`)
- **Observation:** The route's docstring already declared an
  anti-enum invariant ("a fake bcrypt call equalises latency so
  callers cannot distinguish the two code paths by timing") but the
  pad sat in the **`else` branch only**. When the email matched a
  registered-but-unverified user, the success branch ran the JWT
  signing + email log call (~7 ms wall-clock) and *no* bcrypt; when
  the email matched no user (or an already-verified user), the
  `else` branch ran one `get_password_hash("anti-enum-padding")`
  (~540 ms). Bodies and statuses were uniform. Black-box probing
  with N=100 measured a **mean delta of 533 ms, stdev ~120 ms** —
  one of the largest leaks in the surface. The branch placement
  was the bug; the intent was correct.
- **Impact:** an attacker can enumerate which emails are
  registered-but-unverified — exactly the audience whose accounts
  are most useful to hijack (no login history, no 2FA setup, often
  a recently-typed password). Combined with `/2fa/disable/request`
  (F-03-007) and `/api/token` (F-03-005), an attacker assembles a
  three-bit account state per email (registered? unverified?
  2FA-enabled?) using only public, rate-limited probes.
- **Recommendation:** move `get_password_hash("anti-enum-padding")`
  out of the `else` branch and run it unconditionally before the
  success-branch `if`. Mirror the password-reset-request pattern,
  which has been correct since v0.6.0. Token signing and email
  logging on the success branch are negligible compared to the
  bcrypt cost, so a single bcrypt call equalises wall-clock.
- **Effort:** S — three lines moved.
- **Disposition:** fixed in this PR.
- **Exploit script:** `.raw/exploits/F-03-006.py`. Post-fix delta
  = 1.25 ms (well below 100 ms threshold).
- **Regression test:** `backend/tests/security/wave_2/test_email_enumeration.py::TestVerifyResendEnumeration`
  (2 tests: status+body equality; timing parity).

### F-03-007 — `/api/2fa/disable/request` email enumeration via timing differential

- **Severity:** major
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/routers/auth.py:695-709` (pre-fix branch)
- **Tool:** static review + black-box timing probe + exploit script
  (`.raw/exploits/F-03-007.py`)
- **Observation:** Same pattern as F-03-006. The bcrypt anti-enum
  pad sat in the `else` branch only, so the success branch
  (`user is not None and user.is_totp_enabled` → JWT sign + email
  log) ran ~5 ms and the no-op branch (everyone else → bcrypt) ran
  ~600 ms. Black-box probing with N=100 measured a **mean delta of
  595 ms, stdev ~270 ms**. The leak distinguishes a stricter set
  than registered-vs-unregistered: it isolates accounts with
  email-channel 2FA enabled, which are the high-value targets for
  any social-engineering attack ("you've been locked out of 2FA,
  click here to reset…").
- **Impact:** an attacker enumerates accounts with email-channel
  2FA enabled — strictly more sensitive than plain existence
  enumeration, since 2FA-enabled accounts are the primary target
  of MFA-stripping phish kits.
- **Recommendation:** identical to F-03-006 — move the
  `get_password_hash` pad out of the `else` branch and run it
  unconditionally.
- **Effort:** S — three lines moved.
- **Disposition:** fixed in this PR.
- **Exploit script:** `.raw/exploits/F-03-007.py`. Post-fix delta
  = 0.70 ms.
- **Regression test:** `backend/tests/security/wave_2/test_email_enumeration.py::TestTwofaDisableRequestEnumeration`
  (2 tests: status+body equality; timing parity).

### F-03-008 — `/api/register` email enumeration via response body and status

- **Severity:** minor
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/routers/auth.py:230-236`,
  `backend/app/routers/auth.py:299-307`
- **Tool:** static review + black-box probe
- **Observation:** The self-signup endpoint returns
  `{"code": "error", "message": "A user with this email already
  exists.", "details": null}` with status `400` when the submitted
  email matches an existing account, and a `201` body containing
  the new user record otherwise. The status differential
  (`400` vs `201`) and the explicit "already exists" message both
  enumerate; the body-shape differential alone (`code/message`
  envelope vs nested `user` object) is unambiguous. Timing also
  diverges (~7 ms vs ~340 ms because the success branch runs
  bcrypt to hash the new user's password) — but the body is the
  primary channel.
- **Impact:** registered emails enumerable through the public
  signup endpoint at whatever `5/minute` per-IP rate limit allows.
  Severity is **minor** rather than major because (a) registration
  is intrinsically existence-revealing — any signup form must
  reject duplicates somewhere, (b) the `5/minute` per-IP limit
  bounds throughput at ~7 200 probes/day per attacker IP, similar
  to `/token`, and (c) closing it requires a registration
  redesign (return 200 always, send distinct "you already have an
  account" emails to existing users vs verification links to new
  users) — that's not a Wave 2 patch.
- **Recommendation:** out of scope for Wave 2. The registration
  redesign is a multi-step change touching the signup UX, the
  email templates, and the SMTP-fallback path. File to backlog as
  a Wave 5 (business-logic abuse) candidate; Wave 5 is the right
  home because the redesign trades enumeration resistance for
  signup-UX friction and that's a product decision, not a
  one-line patch.
- **Effort:** M — touches signup UX, two new email templates, the
  `verification_active` branch, and the openapi response shape;
  affects the frontend signup flow.
- **Disposition:** deferred to Wave 5 (business-logic abuse) — see
  Wave 2 backlog entry.
- **Exploit script:** none filed (minor; the body+status differential
  is documented inline above and reproducible with two `curl`
  invocations).
- **Regression test:** none filed in Wave 2 (would lock in the
  pre-fix shape; the test belongs with the Wave 5 redesign).

### F-03-009 — `/api/password/reset/request` residual timing variance (below threshold)

- **Severity:** observation
- **Audience:** internal-audit
- **Location:** `backend/app/routers/auth.py:617-637` (current — already
  constant-time)
- **Tool:** static review + black-box timing probe
- **Observation:** The endpoint already runs
  `get_password_hash("anti-enum-padding")` unconditionally (correct
  by design pre-Wave-2). Black-box probing with N=100 still
  measures a non-zero residual: known-arm mean=335 ms (single
  bcrypt + JWT signing + email logging), unknown-arm mean=600 ms
  (single bcrypt only, but with much higher variance — stdev=204 ms,
  min=197 ms, max=1009 ms). The mean delta is large *in the wrong
  direction* (known is faster than unknown), which is consistent
  with the unknown arm's `bcrypt.gensalt` competing against
  background asyncio work for the GIL on the test rig — not a
  real signal an attacker can exploit consistently. The minimum
  duration on each arm tells the real story: known floor is
  ~330 ms (bcrypt + cheap downstream), unknown floor is ~197 ms
  (bcrypt only). An attacker measuring minimums could still
  distinguish the two paths after a large sample, since the known
  arm always pays for JWT signing and the unknown arm never does.
- **Impact:** below remediation threshold. The minimum-floor
  differential is ~130 ms but requires the attacker to sample
  hundreds of times to identify a floor through the noise; over
  the same horizon the `3/hour` per-IP and per-email-hash limits
  on this route gate them to a few hundred probes per day —
  enough to confirm a single suspected email but not to enumerate
  a corpus.
- **Recommendation:** no code change in Wave 2. If the residual
  becomes a concern, the fix is to move JWT signing + email
  logging to a background task (so the response returns
  immediately after the bcrypt call, regardless of branch) — that
  is a refactor with frontend implications, not a one-liner.
- **Effort:** M — would require an async task queue + a frontend
  contract change (response returns before email actually sent).
- **Disposition:** observation — below remediation threshold; no
  code change.
- **Exploit script:** none (observation severity).
- **Regression test:** the existing
  `TestPasswordResetRequestEnumeration` class in
  `test_email_enumeration.py` pins the body+status equality and
  the < 30 ms mean-delta bound, which is what an attacker
  actually measures end-to-end. Pinning the minimum-floor
  differential would require a flake-prone test and is not
  warranted at observation severity.

### F-03-010 — Access tokens not invalidated by password change

- **Severity:** major
- **Audience:** [Prod] [SoftwareX] [OSS] [Self-hoster]
- **Location:**
  - `backend/app/utils/security.py:46-61` (pre-fix `create_access_token` —
    no `iat` claim emitted)
  - `backend/app/dependencies.py:32-60` (pre-fix `get_current_user` —
    no consultation of `user.password_changed_at`)
  - `backend/app/routers/auth.py:405-429` (pre-fix `change_password` —
    rotated `hashed_password` only, never bumped `password_changed_at`)
  - `backend/app/routers/auth.py:670-707` (`password_reset_confirm` —
    bumped `password_changed_at` and killed in-flight OTPs but not
    in-flight access tokens)
- **Tool:** static review + exploit script (`.raw/exploits/F-03-010.py`)
- **Observation:** `create_access_token` minted JWTs carrying only
  `exp` and `sub` — no `iat`, no `pwa`. `get_current_user` decoded
  the token, looked the user up by email, and returned them
  unconditionally; the user's `password_changed_at` column was never
  consulted on the access path. A bearer token leaked through any
  side channel (browser storage on a shared device, proxy log,
  mobile-app keychain backup, mis-scrubbed log pipeline) therefore
  stayed valid for the full remaining 8h of `ACCESS_TOKEN_EXPIRE_MINUTES`
  even after the legitimate owner changed or reset their password.
  The reset-confirm path in `auth.py:697-698` did the right thing
  for OTPs (`invalidate_active_otps`) but stopped short of access
  tokens. The self-serve `/me/password` change path was worse: it
  did not even bump `password_changed_at`, so the existing `pwa`
  replay defence on the password-reset link wouldn't have helped
  either. This is the access-token half of the F-01-010 carry-over;
  the refresh-token half (rotation, revocation list) lands in Task 10.
- **Impact:** any process that observes a bearer token at any point
  in its 8h lifetime can use that token after the owner explicitly
  rotates their password — i.e. a password change does not actually
  end the session. Concretely: a user who suspects compromise and
  changes their password keeps the attacker's session alive for up
  to 8h; a stolen device reset does not invalidate cached tokens; a
  leaked log line reveals a still-usable credential. Severity is
  **major** (not blocker) because the attacker first needs to lift
  the token (the JWT signature still requires the secret to forge),
  but any compromise scenario that recovers a token bypasses the
  primary remediation a user has — changing their password.
- **Recommendation:** add `iat` (issued-at, epoch seconds) to every
  access token at mint time; in `get_current_user`, after the
  signature/expiry check, compare `payload['iat']` to
  `int(user.password_changed_at.timestamp())` and reject (401) when
  the token's `iat` is strictly less than the column. Use `<`, not
  `<=`, so a token minted in the same second the password rotated
  (the legitimate re-mint case in the rotation handler) still
  validates. Also bump `password_changed_at` in the
  `change_password` endpoint so the self-serve flow gets the same
  invalidation as the reset-confirm flow. Legacy tokens minted
  before this rollout carry no `iat` claim; treat the missing claim
  as `iat = 0` so the first password change after deploy
  invalidates them — the cost is forcing legacy holders through one
  re-login, which is acceptable on a security-fix rollout.
- **Effort:** S — 2 lines added to `create_access_token`, 5-line
  iat-vs-pwa check in `get_current_user`, 1 line in `change_password`
  to bump `password_changed_at`. No migration (column already exists
  per the v0.6.0 auth-email-flows migration). No frontend change.
- **Disposition:** fixed in this PR.
- **Exploit script:** `.raw/exploits/F-03-010.py`. PRE-FIX the
  script logs in, calls `/api/me` with the token (200), changes the
  password via `/api/me/password` (200), then re-calls `/api/me`
  with the OLD token — and gets 200, exiting 1. POST-FIX the
  re-call gets 401 and the script exits 0. The script needs a
  Postgres test DB (`TEST_DATABASE_URL`); same setup as the
  F-03-005/006/007 timing exploits.
- **Regression test:** `backend/tests/security/wave_2/test_session_invalidation.py`
  (5 tests: `iat` claim is present on minted tokens; old token
  rejected after rotation; fresh post-rotation token works; legacy
  no-`iat` tokens rejected after rotation; `iat == pwa` boundary
  accepted so the rotation handler can re-mint in the same second).

### F-03-011 — No email-change confirmation flow (account-takeover lock-out vector)

- **Severity:** major
- **Audience:** [Prod] [SoftwareX] [OSS] [Self-hoster]
- **Location:**
  - `backend/app/routers/auth.py:356-397` (pre-fix `update_user_me` —
    direct write to `users.email` with no confirmation loop)
  - `backend/app/models/user.py` (no `pending_email` column pre-fix)
- **Tool:** static review
- **Observation:** `PATCH /me` accepted `user_update.email`,
  uniqueness-checked it, and overwrote `users.email` directly. There
  was **no** second-factor email loop: no token issued to either the
  old or the new address; no notification to the legitimate owner;
  no path back into the account once the rotation landed. Combined
  with F-03-010 (access tokens not invalidated by password change,
  fixed in this PR but only for in-flight tokens after the rotation),
  the attack chain is straightforward: an attacker who briefly holds
  a live session — XSS, leaked bearer token, hijacked browser, lost
  device, prior compromise window before F-03-010 was deployed —
  PATCHes `/me` with their own email, gains permanent control of
  password-reset and 2FA-disable links, and locks the legitimate
  owner out. The owner has no notification on their old address (so
  they only discover the takeover at next login, by which point the
  attacker has rotated the password too) and no cancellation path.
- **Impact:** silent account takeover from a transient
  authenticated-session compromise. The attack window is the
  existing access-token lifetime (8h post-F-03-010, 8h pre-F-03-010
  even after a password change) — long enough to chain a session
  hijack into a permanent account-control transfer. Severity is
  **major** because the attack requires an authenticated session
  (so it is not a pre-auth blocker), but it converts every
  in-session compromise into a persistent one and bypasses the
  primary remediation a user has (changing their password — which
  only goes to the attacker's mailbox once the email is rotated).
- **Recommendation:** dual-confirmation flow. `PATCH /me` no longer
  rotates `users.email` in place; it parks the requested address
  on a new column `users.pending_email` and dispatches two
  short-lived JWTs:
  - an `email_change_confirm` token to the **new** address
    (consume → swap `email <- pending_email` and clear
    `pending_email`).
  - an `email_change_cancel` token to the **old** address
    (consume → clear `pending_email` only; one-click
    "this wasn't me").
  The confirm token carries the requested `new_email` as a JWT
  claim, cross-checked against the user's current `pending_email`
  at consume time. Single-use is enforced by that mismatch (a
  second `PATCH /me` overwrites `pending_email`, invalidating any
  prior confirm token without needing the JTI denylist) and by the
  swap clearing `pending_email` (so a re-played consume hits a
  cleared row and 400s). `password_changed_at` is **not** bumped
  on confirm — this is an email change, not a credential
  rotation — so existing access tokens remain valid through the
  swap. Anti-enumeration: `PATCH /me`'s response shape is
  identical whether the requested address is free, taken by
  another user, or matches a pending request — the address-taken
  case fails at confirm time (DB unique constraint → 409), not
  at PATCH time, so callers cannot enumerate registered emails
  through `/me`.
- **Effort:** S — one nullable column (`users.pending_email`),
  one new service module (`email_change_service.py`), two new
  endpoints (`/email-change/confirm`, `/email-change/cancel`),
  two new email templates, modified `PATCH /me` handler. Migration
  is purely additive (no backfill required). Frontend currently
  disables the email field in the Account Settings form, so the
  visible UX is unchanged for self-serve users; only direct API
  callers (admin tooling, integration scripts) and a future
  "let users change their email" UX work see the new flow.
- **Disposition:** fixed in this PR.
- **Frontend disposition:** schema regenerated to expose
  `pending_email` on `UserRead`; the existing `AccountSettingsPage`
  email field is `disabled` and only sends `full_name`, so no
  visible-UX change is required to ship the backend flow safely.
  A "Pending: <new>" hint + cancel/resend affordances are
  deferred to backlog (Wave 2b — "Wire frontend pending-email UX")
  as the path to re-enabling email editing in the UI.
- **Exploit script:** none filed. The pre-fix gap is a one-line
  PATCH against `/me` from any authenticated session; the security
  invariant is that the post-fix flow rejects the rotation until
  the new address proves control. The regression tests below
  cover that invariant directly.
- **Regression test:** `backend/tests/security/wave_2/test_email_change_confirmation.py`
  (10 tests across 6 classes: happy path PATCH→pending+two emails;
  confirm swaps and clears; password_changed_at is NOT bumped on
  confirm; cancel clears pending; cancel idempotent on no-pending;
  confirm replay rejected; new_email claim mismatch rejected;
  expired confirm token rejected; PATCH /me uniform-by-response
  for taken-vs-free target; second PATCH replaces pending and
  invalidates the prior confirm token).

## F-01-010 — JWT lifetime + revocation (carry-over)

_Status section filled by Task 10._

**Status update (2026-05-03):** Access-token half closed by F-03-010
(commit `94d33870`); refresh-token half pending Task 10.

## Resolved since prior

_Listed by Task 11 if any prior auth-related findings were closed by intervening commits._

## False positives — not filed
