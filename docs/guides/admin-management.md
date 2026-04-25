# Admin and Team Management

This guide explains how to manage accounts, research teams, and study permissions in Qualis.

---

## User Management

User accounts are managed by **Superusers**. A superuser can list all system users and create new accounts.

### Bootstrapping the First Superuser

If your system is fresh, use the CLI to create your first superuser:

```bash
cd backend
uv run python scripts/create_user.py
```

Follow the prompts to enter an email, password, and toggle the **Superuser** status to `y`. This user will be added as the **Owner** of the default project.

### API Access

Once you have an account, you can manage users via the API at `GET /api/admin/users/`.

> [!CAUTION]
> Superusers have global visibility. Only grant this status to trusted platform administrators.

---

## Account Security (2FA)

Researchers are strongly encouraged to enable **Two-Factor Authentication (TOTP)** to protect sensitive research data.

### Enabling 2FA

1. Navigate to your **Profile** page.
2. Click **Setup 2FA**.
3. Scan the QR code with an authenticator app (e.g., Google Authenticator, Authy, or Bitwarden).
4. Enter the 6-digit confirmation code to activate.

### Dual-Step Login

Once enabled, the login flow will require your password first, followed by a valid TOTP token.

> [!IMPORTANT]
> To disable 2FA, you must provide your current account password as a verification step.

---

## Managing Study Teams

Study owners can invite other researchers to collaborate on their work.

### Inviting a Collaborator

Invite a user by their email through the **project settings** page.

1. Enter the collaborator's email.
2. Select a role (**Researcher** or **Viewer**).
3. Click **Send Invitation**.

Qualis will generate a unique registration link. If SMTP is configured, the user will receive an email. If not (e.g., in development), the link is displayed in the dashboard logs.

### Invitation Process

- **Registered Users**: Clicking the invitation link while logged in will immediately grant them access to the study.
- **New Users**: The link will pre-fill the registration form. Access is granted once the account is created.

### Roles and Permissions

Qualis supports three project-level roles with varying levels of access:

| Feature                            | Owner | Researcher | Viewer |
| :--------------------------------- | :---: | :--------: | :----: |
| View Configuration                 |  Yes  |    Yes     |  Yes   |
| Update Meta/Text (Active/Paused)   |  Yes  |    Yes     |  No    |
| Update Grid/Structure (Draft Only) |  Yes  |    Yes     |  No    |
| Export Study Data                  |  Yes  |    Yes     |  No    |
| Change Study State                 |  Yes  |    Yes     |  No    |
| Manage Project Members             |  Yes  |    No      |  No    |
| Delete Study                       |  Yes  |    No      |  No    |

**Note**: Project Owners automatically have Owner-level access to all studies in their project.

---

## Study Lifecycle

Studies progress through several states:

1. **Draft**: All configuration is unlocked. Full structural changes allowed.
2. **Active**: The study is public. **Structural configuration is locked**. Only metadata and translations (text fixes) can be updated.
3. **Paused**: Public access is suspended. Participants cannot submit. Use this state for temporary maintenance or fixing urgent typos.
4. **Closed**: Public access is revoked. Exporting results is still possible.
5. **Archived**: Long-term storage for completed studies. Data is preserved but the study is hidden from the active list.

> [!TIP]
> Use the **Paused** state if you need to fix a typo in a statement or instruction while the study is live, without deleting and recreating it.
