# Admin and Team Management

How to manage accounts, research teams, and study permissions in a Qualis instance.

For initial bootstrap of the first admin account on a fresh deployment, see [`deployment.md`](deployment.md). For the page-by-page UI catalog, see [`../reference/admin-dashboard.md`](../reference/admin-dashboard.md).

---

## Account security (2FA)

Researchers are strongly encouraged to enable Two-Factor Authentication (TOTP).

1. Open **Profile → Two-Factor Authentication**.
2. Click **Setup 2FA**.
3. Scan the QR code with an authenticator app (Google Authenticator, Authy, Bitwarden, …).
4. Enter the 6-digit code to activate.

Once enabled, login takes the password first, then the TOTP code. To disable, you must re-enter the current password.

**2FA login channel.** After entering the password, the user is prompted for the 6-digit code from their authenticator app (TOTP).

**Lost authenticator (self-serve recovery).** If a user loses access to their authenticator app, they can initiate a 2FA disable flow from the login screen. A time-limited link (15 minutes by default) is sent to their registered email address. Opening the link disables 2FA on the account without admin involvement. A platform superuser can also manually clear a user's TOTP from the admin Users page (`POST /api/admin/users/{id}/reset-totp`), removing their second factor; this does not bump `password_changed_at` or revoke existing sessions. Email *verification*, by contrast, remains email-only — admins cannot mark an email verified through the admin UI.

## Email verification

When `EMAIL_VERIFICATION_REQUIRED` is enabled and SMTP is configured, new accounts must verify their email address before logging in. A verification link is sent on sign-up and can be resent from the login screen. Admins cannot manually verify a user's email — the flow is email-driven. In environments without SMTP, verification is automatically skipped (accounts are immediately active).

---

## Manage study teams

Project Owners can invite collaborators and set their role from **Project settings → Members**.

### Invite

1. Enter the collaborator's email.
2. Choose a role (**Member** or **Viewer**).
3. Click **Create & send invitation**.

Qualis generates a unique registration link. If SMTP is configured, the user receives an email; otherwise, the link is logged to stdout (visible in the deployment logs) and shown in the dashboard for manual sharing.

For an invited person already registered, the link grants project access immediately. For a new user, the link pre-fills the registration form; access is granted once the account is created.

### Roles

Project membership maps to study-level capability as follows:

| Capability | Owner | Member | Viewer |
| ---------- | :---: | :--------: | :----: |
| View configuration | ✓ | ✓ | ✓ |
| Update text / translations (Draft only) | ✓ | ✓ | — |
| Update structure (Draft only) | ✓ | ✓ | — |
| Change study state | ✓ | ✓ | — |
| Export study data | ✓ | ✓ | — |
| Manage project members | ✓ | — | — |
| Delete study [^delete] | ✓ | — | — |

[^delete]: Requires study Owner role **and** platform superuser, and the study must already be **Archived**.

Project Owners automatically have Owner-level access on every study in their project. Project deletion (separate from study deletion) is also Owner-only and requires the project to contain no studies.

For the role checks at the API level (and the equivalent endpoints), see [`../reference/api.md`](../reference/api.md).

---

## Study lifecycle

Studies progress through five states. The full transition rules are in [`../reference/admin-dashboard.md#general`](../reference/admin-dashboard.md#general); a quick summary:

| State | Public access | Editing |
| ----- | ------------- | ------- |
| Draft | None | Full structural editing. |
| Active | Open via recruitment links | Collection-window dates (start/end) only. Translations, grid, and statements are locked — switch back to Draft to edit them. |
| Paused | Suspended | Same as Active. |
| Closed | Revoked | Same as Active. Exports remain available. |
| Archived | Revoked | None. Long-term storage; hidden from the active list. |

Use **Paused** rather than **Closed** to temporarily suspend public access without ending the study. Fixing a typo in a statement is not possible from Paused — switch the study back to **Draft** to edit statements or translations, then re-activate. Use **Closed** when data collection is definitively over.
