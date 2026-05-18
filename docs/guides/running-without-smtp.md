# Running Qualis without SMTP / email

Qualis is fully usable without an SMTP server. When `SMTP_HOST`,
`SMTP_USER`, or `SMTP_PASSWORD` is unset, Qualis runs in **email-optional
mode**: outgoing emails are written to the application log, and every
account-recovery action has an in-product path that needs no email.

A startup log line confirms the mode and lists the consequences. For the
canonical list of email-related environment variables, see
[`deployment.md`](deployment.md#email-transport-auth-flows). For the
manual superuser recovery actions referenced below, see
[`admin-management.md`](admin-management.md).

---

## Capability matrix

| Flow | Without SMTP |
|---|---|
| Registration | ✅ Account is active immediately; no verification email needed. |
| Password reset (user clicks "forgot") | ⚙️ User contacts the operator. A superuser opens **Admin → Users → ⋯ → Generate password-reset link** and sends the link out of band. |
| Project invitation | ✅ The invite link is shown with a copy button right after inviting — no email involved. |
| Email change | ⚙️ Self-service is disabled. A superuser opens **Admin → Users → ⋯ → Set email** and sets the new address directly (no confirmation email is sent). |
| Lost authenticator (2FA) | ⚙️ A superuser uses **Admin → Users → ⋯ → Reset 2FA**. See [Recovering the last superuser](#recovering-the-last-superuser) if no second superuser exists. |
| Email-based 2FA | 🚫 Disabled. Users must use an authenticator app. Existing email-2FA accounts are recovered via "Reset 2FA". |
| Memo mentions / notifications | ✅ Informational only; written to the log, never blocking. |

Legend: ✅ works unchanged · ⚙️ requires a manual superuser action · 🚫 disabled.

---

## Recovering the last superuser

The "Lost authenticator (2FA)" row above assumes a *second* superuser is
available to perform the **Reset 2FA** action. If the **only** superuser
has email-based 2FA and SMTP is unavailable, that account cannot log in
and no one can reset it from the UI.

An operator with shell access on the backend host creates a fresh
superuser, who can then sign in and **Reset 2FA** on the locked account
from **Admin → Users → ⋯ → Reset 2FA**.

If at least one *other* working admin credential exists (no 2FA, or a
known authenticator), use the interactive script — it authenticates as
that admin and creates the new user through the Admin API:

```bash
cd backend && uv run python scripts/create_user.py
```

It prompts for the existing admin's email and password, then the new
user's email, password, and whether it is a superuser (answer `y`).

If **no** usable admin credential exists at all (the single superuser is
the only account and is locked out by 2FA), `create_user.py` cannot
authenticate, so create the superuser directly against the database from
the backend environment:

```bash
cd backend && uv run python - <<'PY'
import asyncio
from app.database import SessionLocal
from app.models import User
from app.utils.security import get_password_hash

async def main():
    async with SessionLocal() as s:
        s.add(User(
            email="recovery-admin@example.com",
            hashed_password=get_password_hash("change-me-now"),
            is_active=True,
            is_superuser=True,
        ))
        await s.commit()

asyncio.run(main())
PY
```

Log in as the new superuser, run **Reset 2FA** on the locked account,
then delete or demote the temporary `recovery-admin` account once the
original superuser is back in.

---

## Enabling email later

Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` (and `EMAILS_FROM_EMAIL`)
and restart. The startup banner disappears, the admin banner clears, the
forgot-password page reverts to the standard message, and the email-2FA
option reappears. No data migration is required.
