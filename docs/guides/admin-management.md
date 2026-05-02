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

**2FA login channels.** After entering the password, the user can choose to receive the 2FA code via their authenticator app (TOTP) or by email (a 6-digit one-time code valid for 10 minutes, subject to a 30-second resend cooldown). The email channel requires SMTP to be configured; see [`deployment.md`](deployment.md#email-transport-auth-flows).

**Lost authenticator (self-serve recovery).** If a user loses access to their authenticator app, they can initiate a 2FA disable flow from the login screen. A time-limited link (15 minutes by default) is sent to their registered email address. Opening the link disables 2FA on the account without admin involvement. Admins cannot manually bypass 2FA or verify accounts through the admin UI — the flows are entirely email-driven.

## Email verification

When `EMAIL_VERIFICATION_REQUIRED` is enabled and SMTP is configured, new accounts must verify their email address before logging in. A verification link is sent on sign-up and can be resent from the login screen. Admins cannot manually verify a user's email — the flow is email-driven. In environments without SMTP, verification is automatically skipped (accounts are immediately active).

---

## Manage study teams

Project Owners can invite collaborators and set their role from **Project settings → Members**.

### Invite

1. Enter the collaborator's email.
2. Choose a role (**Researcher** or **Viewer**).
3. Click **Send Invitation**.

Qualis generates a unique registration link. If SMTP is configured, the user receives an email; otherwise, the link is logged to stdout (visible in the deployment logs) and shown in the dashboard for manual sharing.

For an invited person already registered, the link grants project access immediately. For a new user, the link pre-fills the registration form; access is granted once the account is created.

### Roles

Project membership maps to study-level capability as follows:

| Capability | Owner | Researcher | Viewer |
| ---------- | :---: | :--------: | :----: |
| View configuration | ✓ | ✓ | ✓ |
| Update text / translations (Active or Paused) | ✓ | ✓ | — |
| Update structure (Draft only) | ✓ | ✓ | — |
| Change study state | ✓ | ✓ | — |
| Export study data | ✓ | ✓ | — |
| Manage project members | ✓ | — | — |
| Delete study | ✓ | — | — |

Project Owners automatically have Owner-level access on every study in their project. Project deletion (separate from study deletion) is also Owner-only and requires the project to contain no studies.

For the role checks at the API level (and the equivalent endpoints), see [`../reference/api.md`](../reference/api.md).

---

## Study lifecycle

Studies progress through five states. The full transition rules are in [`../reference/admin-dashboard.md#general`](../reference/admin-dashboard.md#general); a quick summary:

| State | Public access | Editing |
| ----- | ------------- | ------- |
| Draft | None | Full structural editing. |
| Active | Open via recruitment links | Translations and metadata only. Grid + statements are locked. |
| Paused | Suspended | Same as Active. Use to fix a typo in a statement without taking the study down. |
| Closed | Revoked | Same as Active. Exports remain available. |
| Archived | Revoked | None. Long-term storage; hidden from the active list. |

Use **Paused** rather than **Closed** if you need to fix a typo while the study is live. Use **Closed** when data collection is definitively over.
