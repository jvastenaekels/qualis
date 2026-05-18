# SMTP-optional mode — design

**Date:** 2026-05-17
**Branch:** `feat/smtp-optional-mode`
**Status:** approved (brainstorming), pending implementation plan

## Goal

Qualis must be **perfectly usable without SMTP / email**, and the capabilities
in that mode must be **clear** to the operator and to users.

Today every email-gated flow degrades to "link written to stdout via
`_send_or_log()`". That is technically functional but has two real defects:

1. No in-product way to obtain a recovery link without grepping server logs.
2. Email-based 2FA becomes a silent lockout (the OTP only reaches the logs,
   and there is no logged-in admin at login time to help).
3. The operator gets no signal that any of this is happening.

**Acceptance bar (chosen):** every *blocking* flow has an in-product path that
depends on neither email nor logs. The log fallback remains only as a safety
net, never the primary mechanism.

## Scope

### Blocking flows and current status

| Flow | Trigger | In-product path today |
|---|---|---|
| Password reset (forgot) | user | ❌ link only in logs |
| Project invitation | admin | ✅ **already complete** — backend returns `invite_url`; `ProjectMembersPage` shows it with a copy button regardless of email |
| Email change confirm | user | ❌ link only in logs |
| 2FA disable / lost authenticator | user | ✅ superuser `reset_totp` exists (needs surfacing) |
| 2FA email-OTP at login | user | ❌ silent lockout |

Invitation needs **no work** — it already satisfies the bar.

### Informational (out of scope — log fallback is acceptable)

`send_memo_mention_email`, `send_twofa_disabled_notification`,
`send_email_change_notification` (to the old address). No recovery is needed;
these never block a user.

## Design

Approach 2: on-demand reveal, per-flow, **no persistence**. Recovery links are
minted on demand by an authenticated superuser, audit-logged, never stored.
This preserves the current stateless-JWT property (reset tokens are never
persisted) and keeps the log fallback as a pure net.

### 1. Capability signal (backend → frontend)

- New **unauthenticated** `GET /api/config` returning a minimal bootstrap
  payload including `email_delivery: "smtp" | "manual"`, derived from the
  existing `settings.is_smtp_configured` property.
- No new config setting — only exposure of the existing property.
- Frontend reads it once at app bootstrap into the store. This single flag
  drives every adaptive UX decision below.

### 2. Core primitive: on-demand recovery-link reveal

- New superuser endpoint `POST /api/admin/users/{id}/recovery-link`,
  body `{ "kind": "password_reset" }`, returns
  `{ "url": str, "expires_at": datetime, "kind": str }`.
- The token is the **same token forgot-password mints**. It **does not rotate
  the password** — this is distinct from the existing `force_password_reset`
  ("account compromised, lock now") action, which is left unchanged.
- Audit-logged as `recovery_link_revealed` on every call. Rate-limited.
- **Never persisted.** Grants a superuser no new privilege (they can already
  `force_password_reset`); it only removes the log-grep step.

### 3. Email change without SMTP

- Self-service email change keeps its dual-confirmation flow when
  `email_delivery === "smtp"`.
- When `"manual"`: the self-service form is disabled with copy pointing to the
  administrator, and a **superuser sets the address directly** via the existing
  admin user-update path. The dual-confirmation loop is intentionally bypassed
  because the admin is the trust anchor. Audit-logged.

### 4. Close the 2FA-email lockout trap

- **Enrolment:** reject `totp_channel="email"` when `!is_smtp_configured`
  (clear validation error). Frontend hides the "email" 2FA option when
  capability is `manual`.
- **Login:** a user who *already* has `totp_channel="email"` while SMTP is
  manual receives a **distinct error code** so the frontend shows "email 2FA
  unavailable on this instance — contact your administrator" instead of a
  misleading "code sent".
- **Recovery:** superuser `reset_totp` already exists; surfaced as a button
  (section 5) and documented as the escape hatch.
- Migrating existing email-2FA users is out of scope (greenfield self-host has
  none); the recovery path is documented instead.

### 5. Frontend: surface verbs + adaptive copy

- `AdminUsersPage`: a "Generate password-reset link" action that reveals the
  URL in a copy-to-clipboard dialog **reusing the invitation-modal pattern**
  from `ProjectMembersPage` (lines ~518–600), plus the existing reset-2FA /
  force-reset verbs grouped consistently. The implementation plan will confirm
  which verb buttons are already wired in `useAdminUsersPage.ts`.
- Forgot-password page: success copy switches to "Email delivery is not
  configured — contact your administrator for a reset link" when `manual`.
- `AdminLayout`: a one-line banner when `manual` — "Email delivery not
  configured — recovery links are generated manually from Admin → Users."
- All new strings via `useTranslation()` / `t('key', 'English fallback')`,
  participant-strict / admin-best-effort per project i18n policy.

### 6. Capability-clarity layer

- A startup log line (main.py lifespan) enumerating, when SMTP is
  unconfigured, exactly what works and what the operator must do manually.
- An operator-facing doc at `docs/guides/running-without-smtp.md` with the
  full capability matrix: ✅ works unchanged / ⚙️ requires manual admin action
  / 🚫 disabled.

## Security considerations

- `recovery-link` is superuser-only, audit-logged per call, rate-limited. It
  mints the token a user would already get from forgot-password; a superuser
  can already `force_password_reset`, so no privilege escalation. No secret at
  rest.
- Direct admin set-email is audit-logged and bypasses dual-confirmation **by
  design** (superuser is trusted). Documented as intentional.
- Disallowing email-2FA without SMTP is strictly safer than the status quo.

## Out of scope (YAGNI)

- Central persisted "email outbox" console (that was Approach 1).
- Auto-migrating / converting existing email-2FA users.
- Memo-mention and notification emails (informational; log fallback fine).
- Alternative delivery channels (SMS, webhooks).

## Testing

**Backend**
- `/api/config` returns `"manual"` when SMTP unset, `"smtp"` when configured.
- `recovery-link`: superuser gate (403 for non-superuser), audit row written,
  returned token validates against the reset-confirm endpoint, rate limit.
- Email-2FA enrolment rejected when SMTP unconfigured (clear error).
- Login returns the distinct error code for legacy email-2FA + SMTP manual.
- Admin direct set-email swaps the address and writes an audit row.

**Frontend**
- Forgot-password copy switches on the capability flag.
- Reveal dialog copies the URL to clipboard (invitation-pattern reuse).
- Admin banner renders only when `manual`.
- 2FA enrolment hides the email option when `manual`.

## Strict-typing note

New backend leaf modules (e.g. a recovery-link service, the config endpoint)
should opt into the `mypy --strict` overrides list in `backend/pyproject.toml`,
consistent with the project's strict-module policy.
