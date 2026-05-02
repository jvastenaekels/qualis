# Auth email flows — design

**Date** : 2026-05-02
**Status** : approved (brainstorming), pending implementation plan
**Scope** : add email-driven auth flows on top of existing TOTP 2FA + open registration

## Problem

Qualis currently has:
- **2FA TOTP-only** via `pyotp` (QR enrollment). No email-based 2FA channel, no recovery if the authenticator is lost.
- **Open registration** : `/auth/register` creates accounts with `is_active=True` immediately. No email-of-record proof.
- **No password reset** flow. A locked-out user must contact an admin manually.

The existing SMTP transport (`app/utils/email.py`) already sends invitation and memo-mention emails, with a clean dev-mode fallback (logs the email instead of sending when `SMTP_HOST` is missing). The transport is solid; what's missing is the auth-side flows on top of it.

This spec adds four flows:

| Flow | Format | Action |
|---|---|---|
| Email verification at registration | signed link | activate the account |
| Password reset | signed link | open new-password form |
| 2FA disable (recovery) | signed link | force `is_totp_enabled=False` |
| 2FA login via email-OTP | 6-digit code | submitted as `x-totp-token` header |

Registration via a valid `invitation_token` skips email verification (the token already proves email ownership).

## Approach

**Hybrid tokens — JWT for the link-based flows, two small DB tables for what JWT alone cannot guarantee.**

- The three link-based flows (verify, reset, 2FA-disable) use signed JWT tokens with `iss/aud/purpose` claims and short expiries. This mirrors the existing `decode_invitation_token` pattern in `app/utils/security.py`.
- The 2FA email-OTP login uses a 6-digit numeric code stored hashed in a new `twofa_email_otp_codes` table. Three properties make a JWT-in-URL inadequate here: the user must be able to type the code into the existing 2FA form (not click a link, which would defeat the purpose if email is the second factor); brute-force resistance requires server-side attempt counting; consume-once semantics require a server-side `used_at` marker.
- The 2FA-disable flow gets an extra small `consumed_email_tokens` table for single-use enforcement on top of the JWT. This is the most security-sensitive of the link-based flows — disabling the second factor — so idempotency alone is insufficient (rationale in "Replay defense" + "Approaches considered").

A pure stateless approach (JWT for everything) was rejected — see "Approaches considered".

A pure stateful approach (one `email_tokens` table covering all four flows) was rejected as over-engineering for current needs. Could be revisited if/when admin tooling needs to inspect outstanding tokens.

## Data model

### `users` — three columns added

| Column | Type | Notes |
|---|---|---|
| `email_verified_at` | `datetime \| None` | `NULL` = unverified. Date (not bool) so audit can see when verification happened. |
| `totp_channel` | `str \| None` (`'app' \| 'email'`) | active channel when `is_totp_enabled=True`; `NULL` otherwise. |
| `password_changed_at` | `datetime` (NOT NULL, default `NOW()`) | bumped on every password rotation; encoded as `pwa` claim in password-reset JWT for replay defense (see "Replay defense" below). |

### `twofa_email_otp_codes` — new table

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `user_id` | FK `users.id` ON DELETE CASCADE | indexed |
| `code_hash` | str | bcrypt of the 6-digit code, never plaintext |
| `expires_at` | datetime | typically `created_at + 5 min` |
| `attempts` | int default 0 | incremented on each wrong submission |
| `used_at` | datetime nullable | consume-once marker |
| `created_at` | datetime default `NOW()` | for resend rate-limit |

Index : partial `(user_id) WHERE used_at IS NULL` to find the active code quickly.

### `consumed_email_tokens` — new table (single-use marker for 2FA-disable JWTs)

Minimal denylist used **only** by the `twofa_disable` flow to enforce single-use over a stateless JWT (see Codex stress-test rationale in "Replay defense" below).

| Column | Type | Notes |
|---|---|---|
| `jti` | str PK | JWT `jti` claim of the consumed token |
| `purpose` | str | always `'twofa_disable'` for now; column kept open in case `password_reset` ever wants the same protection |
| `consumed_at` | datetime default `NOW()` | for retention/cleanup |

A nightly cleanup job (or on-demand) deletes rows where `consumed_at < NOW() - INTERVAL '7 days'` — the JWT itself expires after 15 min, so 7 days is ample replay-protection padding without unbounded growth.

### Migration

Single Alembic migration `add_auth_email_flows`, added after head `62538cba702e`. Creates `twofa_email_otp_codes` and `consumed_email_tokens` tables, adds `email_verified_at`, `totp_channel`, and `password_changed_at` columns to `users`, and applies the backfills below.

**Backfill required** (avoids breaking existing accounts):
- `users.email_verified_at = NOW()` for all existing rows
- `users.totp_channel = 'app'` for rows where `is_totp_enabled = True`
- `users.password_changed_at = NOW()` for all existing rows (zero-impact: only matters for tokens issued *after* this date)

## Service layer

### `app/utils/security.py` — additions

Module is under `mypy --strict`, payload uses `TypedDict`:

```python
EmailTokenPurpose = Literal["email_verify", "password_reset", "twofa_disable"]

class EmailTokenPayload(TypedDict, total=False):
    sub: Required[str]                # user email
    purpose: Required[EmailTokenPurpose]
    iss: Required[str]                # always "qualis"
    aud: Required[str]                # always "auth-email"
    exp: Required[int]
    iat: Required[int]
    jti: Required[str]                # unique ID for audit + single-use denylist (2fa_disable)
    pwa: int                          # password_reset only: epoch seconds of user.password_changed_at at issuance

def create_email_token(email: str, purpose: EmailTokenPurpose,
                       expires_delta: timedelta,
                       password_changed_at: datetime | None = None) -> str: ...
def decode_email_token(token: str, expected_purpose: EmailTokenPurpose) -> EmailTokenPayload: ...
```

Signed with the same `SECRET_KEY` as other JWT tokens. Decode validates `iss="qualis"` and `aud="auth-email"` strictly to prevent confusion with the existing access-token / invitation-token JWT families that share the same key.

Separate signing keys per family was considered and deferred — the `iss/aud/purpose` triple covers the practical confusion-attack surface for a small academic platform; a key split is straightforward to retrofit later if the threat model changes.

### `app/services/email_token_consume_service.py` — new (under `mypy --strict`)

Tiny helper for the `twofa_disable` single-use semantics:

```python
async def is_jti_consumed(db: AsyncSession, jti: str) -> bool
async def mark_jti_consumed(db: AsyncSession, jti: str, purpose: str) -> None  # raises IntegrityError on race (unique PK)
async def cleanup_consumed(db: AsyncSession, older_than: timedelta) -> int      # for the cleanup job
```

The `IntegrityError` on race is the protection: two concurrent attempts to consume the same `jti` end with one success and one 409.

### `app/services/email_otp_service.py` — new (under `mypy --strict`)

```python
class OTPRateLimitError(Exception): pass

async def issue_otp(db: AsyncSession, user: User) -> str  # returns plaintext code for email
async def verify_otp(db: AsyncSession, user: User, code: str) -> bool
async def invalidate_active_otps(db: AsyncSession, user: User) -> None
```

Internal rules:
- `issue_otp` generates 6 digits via `secrets.randbelow(1_000_000)` formatted `06d`, bcrypt-hashes, writes to DB with `expires_at = now + TWOFA_EMAIL_OTP_EXPIRE_MINUTES`. **Invalidates active codes for the same user first** (one valid code at a time).
- Rate-limit "1 OTP per 30 s per user": if last `created_at` < 30 s, raises `OTPRateLimitError` → router maps to HTTP 429.
- `verify_otp` finds the active non-used non-expired code, checks `attempts < 5`, compares bcrypt, marks `used_at` on success, increments `attempts` on failure. At the 5th failure the code is dead.

### `app/utils/email.py` — five new functions

Same shape as `send_invitation_email` (inline HTML, dev-mode logging fallback when SMTP unset):

- `send_email_verification(email_to, verify_url)`
- `send_password_reset(email_to, reset_url)`
- `send_twofa_disable_link(email_to, disable_url)`
- `send_twofa_disabled_notification(email_to, when, ip_hint)` — sent **after** a successful 2FA disable, so the user notices an unauthorized action even if the link landed in their already-compromised mailbox
- `send_twofa_login_otp(email_to, code)`

No Jinja templates yet — five inline templates remain readable. To revisit beyond ~8 templates.

No `EmailVerificationService` class — each flow is `encode → email` and `decode → find user → apply action`. The route handlers compose the helpers directly.

## Endpoints

### Modified

**`POST /auth/register`** :
- If valid `invitation_token` matching the supplied email → `email_verified_at = NOW()`, `is_active = True` (current behavior preserved).
- Otherwise → `is_active = False`, `email_verified_at = NULL`, send verification email.
- Response body becomes `{user, requires_email_verification: bool}` instead of bare `User`.

**`POST /auth/token`** :
- If `settings.email_verification_active` (= `EMAIL_VERIFICATION_REQUIRED AND is_smtp_configured`) and `email_verified_at IS NULL` → HTTP 403 `email_not_verified` (frontend shows resend). When SMTP is not configured, the gate **must not fire** — the app must keep functioning. Same goes when the operator explicitly sets `EMAIL_VERIFICATION_REQUIRED=False`. The `is_smtp_configured` automatic fallback is a hard requirement: an operator who deploys without SMTP must never end up with locked-out accounts.
- 2FA branch keys on `user.totp_channel`:
  - `'app'` → unchanged (header `x-totp-token` checked against TOTP secret).
  - `'email'` → without header, calls `issue_otp` + sends email + returns `Token(requires_2fa=True, channel='email')`. With header, calls `verify_otp`.
- `Token` schema gains optional `channel: Literal['app', 'email'] | None`.

**`POST /auth/2fa/enable`** :
- Body gains `channel: 'app' | 'email'`.
- `'app'` → current TOTP flow + `totp_channel = 'app'`.
- `'email'` → no QR code; one dry-run `issue_otp` + user submits the code to confirm channel works → `is_totp_enabled = True`, `totp_secret = NULL`, `totp_channel = 'email'`.

### New

| Endpoint | Auth | Rate-limit | Body | Effect |
|---|---|---|---|---|
| `POST /auth/email/verify` | none | n/a | `{token}` | activate account (idempotent) |
| `POST /auth/email/verify/resend` | none | 3/h | `{email}` | resend verification (always 200) |
| `POST /auth/password/reset/request` | none | 3/h | `{email}` | send reset link (always 200) |
| `POST /auth/password/reset/confirm` | none | n/a | `{token, new_password}` | verify `pwa` claim matches current `password_changed_at`, rotate password (bumps `password_changed_at`), invalidate active OTP codes |
| `POST /auth/2fa/disable/request` | none | 3/h | `{email}` | send 2FA-disable link (always 200) |
| `POST /auth/2fa/disable/confirm` | none | n/a | `{token}` | atomic: `mark_jti_consumed` (rejects if already consumed) → clear `is_totp_enabled / totp_secret / totp_channel` → `send_twofa_disabled_notification` |

**Anti-enumeration hardening** :
- Every "request" endpoint returns 200 regardless of whether the email exists or whether the user is in the right state.
- **Constant-time response** : when the email is unknown, perform a fake bcrypt with the same cost as the real path (`get_password_hash("dummy")`) to equalize latency. The fake bcrypt result is discarded.
- **Per-email rate-limit** in addition to per-IP : SHA-256 of the lowercased email is the second `slowapi` key, capped at 3/h. Defends against a single attacker rotating IPs to enumerate one specific email.

**2FA-disable flow contract** : the link in the email points to a frontend page that displays a confirm button; the actual `POST /auth/2fa/disable/confirm` is fired only on explicit user click. This neutralizes email-scanner / link-preview "clicks" that would otherwise auto-trigger the disable.

### Audit

Each sensitive mutation calls `app.utils.audit.log_admin_action(...)` (free-form `action` / `resource` strings, no closed enum to extend). New `(action, resource)` pairs: `('email_verify', 'user')`, `('password_reset_confirm', 'user')`, `('twofa_disable_confirm', 'user')`, `('twofa_enable', 'user')`, `('twofa_login_failed', 'user')`. The `details` dict carries `{'channel': 'email'|'app'}` where relevant. Tokens and codes never appear in details (per the audit util's docstring contract).

## Frontend

### New pages (`frontend/src/pages/`)

- `EmailVerificationSentPage.tsx` — post-registration screen: "verify your email at {x}", "resend" button with cooldown.
- `EmailVerifyPage.tsx` — landing for `/verify-email?token=…`: spinner → success or "link expired, [resend]".
- `PasswordResetRequestPage.tsx` — `/forgot-password`, single email field.
- `PasswordResetConfirmPage.tsx` — `/reset-password?token=…`, new-password + confirm fields with the same validations as signup.
- `TwoFactorRecoveryPage.tsx` — `/2fa/recover`, single email field.
- `TwoFactorDisablePage.tsx` — `/2fa/disable?token=…`. **Critical contract** : on mount, render a warning + "Confirm disable" button only. **No API call on mount** (defends against email-scanner pre-fetches and link-preview triggers). The POST to `/auth/2fa/disable/confirm` fires only on user click. Add `<meta name="referrer" content="no-referrer">` to the page so the token in the URL never leaks to third-party assets.

### Modified pages

- `RegisterPage.tsx` — on success, redirect to `EmailVerificationSentPage` (or to dashboard when invited, current behavior).
- `LoginPage.tsx` — handle the new `channel` field in `Token`. If `'email'`, show "code sent to your email" instead of "open your authenticator". Add "lost 2FA" link → `/2fa/recover` and "forgot password" link → `/forgot-password`.
- `ProfilePage.tsx` (or admin equivalent) — 2FA section: add `'app' | 'email'` channel selector at enable time.

### Hooks rule

Each new page is < 100 LOC of non-JSX logic (one API call + `loading|error|success` state). The CLAUDE.md `use<Name>` hook extraction rule does not trigger.

### API client

Regenerated via `make generate-api` after backend schemas land.

### i18n

New keys added under `auth.email.*`, `auth.password_reset.*`, `auth.twofa.recovery.*`, `auth.twofa.disable.*`, `auth.twofa.enable.{channel_app, channel_email, channel_help}`, `auth.login.{otp_email_sent, lost_2fa_link, forgot_password_link}`. All three locales (`en`, `fr`, `fi`) — `npm run i18n-check` validates parity.

## Configuration

New settings in `app/core/config.py` with safe defaults:

```python
EMAIL_VERIFICATION_REQUIRED: bool = True
EMAIL_VERIFY_TOKEN_EXPIRE_HOURS: int = 24
PASSWORD_RESET_TOKEN_EXPIRE_HOURS: int = 1
TWOFA_DISABLE_TOKEN_EXPIRE_MINUTES: int = 15
TWOFA_EMAIL_OTP_EXPIRE_MINUTES: int = 5
TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS: int = 30
```

Existing `FRONTEND_URL` (already present at `app/core/config.py:25`) is the base for building action links.

`SMTP_HOST/USER/PASSWORD/PORT/TLS/EMAILS_FROM_*` already exist — unchanged.

## Dev / production behavior

**SMTP unset (dev)** : strict alignment with the existing `send_invitation_email` pattern — log a warning + a structured "MOCK EMAIL" block containing the link or OTP. No route raises an error if SMTP is missing; the developer copy-pastes the URL/OTP from server logs.

**Consequence in dev** : with `EMAIL_VERIFICATION_REQUIRED=True` and SMTP unset, signup works but the account is locked until the developer fetches the link from logs. Documented in `CONTRIBUTING.md` (to add).

**Production** : a real SMTP provider should be configured (Brevo, Postmark, Resend SMTP, Mailgun…) so the verification gate has teeth. The app **degrades gracefully if SMTP is missing**: `settings.email_verification_active` automatically returns `False` when `SMTP_HOST/USER/PASSWORD` are not all set, so login is not blocked and self-signups create immediately-active+verified accounts. This means an operator can deploy the binary first, configure SMTP later, and never end up with locked-out users in between.

### URL token leakage hardening

Tokens travel in URL query strings (`?token=…`). Three concrete defenses:

1. **Frontend pages set `Referrer-Policy: no-referrer`** (HTML meta tag, see `TwoFactorDisablePage` notes; same applied to `EmailVerifyPage` and `PasswordResetConfirmPage`). Prevents leak via `Referer` header to any third-party asset loaded by the page.
2. **Server access logs scrub the `token` query parameter** : add a uvicorn / nginx middleware filter that rewrites `?token=…` to `?token=REDACTED` in access-log lines. (FastAPI middleware is the simpler insertion point — one filter on the access logger.)
3. **Consume happens via POST** (request body, not URL). The frontend extracts the token from `window.location.search` and sends it in the request body; the GET that loaded the page is the only line where the token appears, and that line is scrubbed by point 2.

## Replay defense for stateless tokens

A signed JWT can be replayed until expiry. Per-flow mitigation:

- `email_verify` replayed → no-op (idempotent: `email_verified_at` is only set to `NOW()` if `IS NULL`).
- `password_reset` replayed within 1h → would otherwise allow re-rotation of the password. **Mitigation** : the token carries the user's `password_changed_at` at issuance time as a `pwa` claim (epoch seconds). On consume, the route compares `pwa` to the current `users.password_changed_at`; a mismatch (because the password has already been rotated, bumping the column) rejects the token. This replaces the originally-proposed `pwh_prefix` approach, which was too low-entropy on bcrypt (the first 8 chars are nearly constant: `$2b$12$X`).
- `twofa_disable` replayed → **single-use stateful enforcement** via the `consumed_email_tokens` table. The route atomically `INSERT`s the JWT's `jti` (PK collision = 409 = already consumed) before performing the disable action. This is the only flow with stateful single-use because it's the most security-sensitive (defeats the second factor); the cost is one row per disable + a periodic cleanup job. Email-scanner pre-fetches are additionally neutralized by the frontend contract (no API call on page mount; explicit user click required).

The choice to keep `email_verify` and `password_reset` stateless rests on: (a) `email_verify` is genuinely idempotent so replay has no effect, (b) `password_reset`'s `pwa`-based defense is structurally equivalent to a single-use marker (one rotation = token dead) without the table cost. The 2FA-disable single-use was added after a Codex stress-test (see "Approaches considered") flagged that this flow needed stronger guarantees than the others.

## Testing

### Backend (`backend/tests/`)

One file per flow, following existing `test_auth_*.py` style.

- `test_auth_email_verify.py` — signup without invitation → inactive + email logged; login blocked while unverified; verify with valid token → activated; expired token (+25h) → 400; already-verified → 200 idempotent; resend rate-limit (4th in 1h → 429); resend for unknown email → 200 anti-enumeration; **invitation token bypasses verification** (regression).
- `test_auth_password_reset.py` — request → email logged, 200 even for unknown email; **constant-time check**: response time within 50ms of unknown-email vs known-email (assert via `time.perf_counter()`); confirm with valid token → password rotated, `password_changed_at` bumped, old MDP rejected; expired token → 400; **replay after first use → 400 via `pwa` claim mismatch**; confirm invalidates active OTP codes; rate-limit 3/h per IP **and** 3/h per email-hash.
- `test_auth_twofa_email_otp.py` — enable with `channel='email'` → `is_totp_enabled=True`, `totp_secret IS NULL`, `totp_channel='email'`; login without header → 200 `{requires_2fa: true, channel: 'email'}` + email logged; login with correct code → token issued; wrong code → 401, `attempts++`; 5 wrong → code dead even with the right code; resend < 30 s → 429; expired (+5m01s) → 401; reissue invalidates previous codes.
- `test_auth_twofa_recovery.py` — request for 2FA-enabled user → email logged; request for unknown / non-2FA user → 200 anti-enumeration, no email; confirm with valid token → 2FA cleared + audit + **`send_twofa_disabled_notification` called**; **confirm replay with same token → 409 via `consumed_email_tokens` PK collision** (not silent no-op); concurrent confirm (two parallel requests with the same token) → exactly one succeeds, one returns 409.
- `test_auth_jwt_isolation.py` — new : assert that an `access_token` JWT cannot be passed where an `email_verify` token is expected (`aud`/`iss`/`purpose` mismatch → 400), and conversely. Defends against JWT-family confusion across the shared `SECRET_KEY`.

### Frontend (Vitest)

One test per new page, mocking store + API:
- happy path (valid token → success state)
- error path (expired token → message + resend button)
- `LoginPage` : new `channel='email'` branch
- `ProfilePage` 2FA enable : selector toggles wording

### E2E (Playwright)

One spec `e2e/auth-email.spec.ts` covering signup → "verify email" screen → login blocked → fetch link via test-mode debug API → verify → login OK.

E2E for password-reset and 2FA-email is **not** added (covered by integration tests). CLAUDE.md rule "E2E only when touching admin-flow code" applies; mailbox E2E friction is high.

### Quality gate

`make ci` must pass. Roughly +25 backend tests + ~10 frontend tests, expected +30 s on CI duration.

## Out of scope

- **Welcome email** after verification (could be added trivially later).
- **Inbound email** (support inbox, ticket parsing).
- **Codes de récupération** (8 printable one-shot codes) — explicitly rejected during brainstorming in favor of self-serve email recovery only.
- **Per-login channel chooser** when both TOTP and email are enrolled — only one channel at a time.
- **Welcome email for invited users** — out of scope; the existing invitation email already serves that role.
- **Admin tooling** for inspecting outstanding tokens / forcing resends — not currently needed.

## Approaches considered

- **Stateless JWT for all four flows** — rejected. The 2FA login OTP must be a typeable short code with consume-once and brute-force protection; a JWT-in-URL would mean clicking a link, defeating email-as-second-factor (the user already has email access).
- **Single `email_tokens` table for everything** — rejected. Cleaner on paper, but adds a table + a service for benefits (admin auditability of in-flight tokens) the platform has not requested. Reconsider if those needs emerge.
- **`pwh_prefix` for password-reset replay defense** — adopted in the initial draft, then **rejected after Codex stress-test** : bcrypt hashes start with `$2b$<cost>$` (almost-constant prefix), so 8 chars carry far less than 8 hex digits of entropy. Replaced with a `pwa` (`password_changed_at` epoch) claim against a new `users.password_changed_at` column.
- **Stateless 2FA-disable** — adopted in the initial draft, then **rejected after Codex stress-test** : the most security-sensitive flow (defeats the second factor) cannot rely on idempotency alone. Added a small `consumed_email_tokens` denylist for single-use enforcement, plus the explicit-click frontend contract to neutralize email-scanner pre-fetches.
- **Separate JWT signing key per family** — deferred. Risk mitigated by strict `iss`/`aud`/`purpose` validation. Trivial to retrofit (one new setting + one helper) if the threat model warrants it.
- **Adopt Jinja2 templates now** — deferred. Five inline HTML templates remain readable and match the existing `send_invitation_email` style. Revisit beyond ~8 templates.
