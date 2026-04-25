# Admin Dashboard Features

This guide provides a comprehensive overview of all administrative features available in the Qualis platform.

---

## Dashboard Overview

The Admin Dashboard is organized into dedicated pages for each study, accessible from the left sidebar:

- **Overview**: Study statistics, participation trends, and quick actions.
- **Design**: Configure grid shape, statements, translations, and study behavior (7 tabs: General, Presort, Instruction, Grid & Q-Set, Post-sort, Branding, Interface).
- **Recruitment**: Create access links, track conversion funnels, and monitor success rates.
- **Data**: View participant timelines, device breakdowns, individual session detail, and manage test runs.
- **Analysis**: Run factor analysis (PCA/Centroid), view scree plots, factor loadings, factor arrays, and distinguishing/consensus statements.
- **Settings**: Study-level settings.
- **Profile**: Manage your account security and enable 2FA.

---

## Study Design

### Study Configuration

**Location**: Study sidebar > Design

#### Core Settings

- **Study Slug**: Unique identifier used in participant URLs.
- **Default Language**: Fallback locale if the participant's language is unavailable.
- **Study State**: Control public access and editing capabilities.
  - **Draft**: Full editing capabilities. Ideal for initial setup.
  - **Active**: Public and collecting data. Structural changes (grid, statements) are locked.
  - **Paused**: Temporarily closed to new submissions. Allows text/translation fixes.
  - **Closed**: No longer accepting submissions. Exports remain available.
  - **Archived**: Long-term storage state for completed studies.

#### Grid Configuration

Define the forced distribution shape for the Q-sort:

- **Score**: The numerical value of each column (e.g., -4 to +4).
- **Capacity**: Number of statements that fit in each column.

> [!IMPORTANT]
> The sum of all column capacities **must equal** the total number of statements. The designer validates this and shows a warning banner if they do not match.

#### Behavioral Options

- **Show Statement Codes**: Display "S1", "S2" identifiers on cards for easier analysis.
- **Randomize Statements**: Shuffle statement order per participant to prevent bias (Q-methodology best practice).

### Import / Export Configuration

Easily duplicate studies or back up your configurations:

- **Export Configuration**: Download a JSON file containing the full study design (grid, statements, translations, and settings). This **excludes** participant data.
- **Import Study**: Create a new study by uploading a previously exported configuration file. The system will validate the file and allow you to set a new slug for the imported study.

> [!TIP]
> Use this feature to create "template" studies that you can clone and adapt for different contexts or languages.

### Translations and Content

Manage multilingual content for your study:

- **Title**: Main study name.
- **Subtitle**: Brief tagline shown on the welcome page.
- **Description**: Overview shown on the welcome page.
- **Objective**: Research objective shown to participants.
- **Instructions (Condition of Instruction)**: Markdown content explaining the sorting frame for participants.
- **Consent**: Customizable consent form (title, description).

### Statements

Add, edit, or remove statements from your Q-set:

- Each statement supports translations in multiple languages.
- Statement codes (e.g., "S1", "S2") are used for internal tracking and exports.

> [!WARNING]
> Once a study is **Active**, you cannot add or remove statements. Plan your Q-set carefully during the Draft phase.

### Pre-Sort and Post-Sort

Configure demographic questions (Pre-Sort) and qualitative follow-up questions (Post-Sort):

- **Pre-Sort**: Collect participant metadata before sorting begins.
- **Post-Sort**: Ask participants to comment on extreme placements or provide general feedback. Supports audio responses when S3 is configured.

#### Question Types

Both pre-sort and post-sort support the following field types:

| Type          | Description                                      |
| :------------ | :----------------------------------------------- |
| `text`        | Single-line text input                           |
| `textarea`    | Multi-line text area                             |
| `number`      | Numeric input with optional min/max validation   |
| `select`      | Dropdown with predefined options                 |
| `radio`       | Radio button group                               |
| `checkbox`    | Checkbox toggle                                  |
| `date`        | Date picker                                      |
| `email`       | Email input with format validation               |
| `text_audio`  | Text input with optional audio recording (post-sort only, requires S3) |

Each question supports:

- **Localized labels and placeholders** for all configured languages.
- **Required field validation** to enforce mandatory responses.
- **Conditional visibility**: Show or hide a question based on another question's answer using operators (`equals`, `not_equals`, `contains`, `greater_than`, `less_than`).
- **Drag-to-reorder** for arranging question order in the designer.

#### Content Formatting

Instructions, condition of instruction, and consent text fields support **Markdown** formatting (headings, bold, italic, lists, links). Content is rendered with XSS protection.

#### Custom UI Labels

Researchers can override default UI strings (button text, step names) per language via the `ui_labels` field in study translations. This allows full localization control without modifying the application code.

---

## Team Management

**Location**: Project settings (sidebar > project menu)

Team management is handled at the **project level**, not per-study. Project owners can invite collaborators and manage roles from the project settings page.

### Inviting Collaborators

1. Navigate to your project settings.
2. Enter the collaborator's email address.
3. Select their role (**Researcher** or **Viewer**).
4. Click **Send Invitation**.

The system generates a unique registration link. If SMTP is configured, an email is sent automatically. Otherwise, the link is displayed in the UI for manual sharing.

### Roles and Permissions

| Feature                      | Owner | Researcher | Viewer |
| :--------------------------- | :---: | :--------: | :----: |
| View Study Configuration     |  Yes  |    Yes     |  Yes   |
| Edit Translations/Metadata   |  Yes  |    Yes     |  No    |
| Edit Grid/Statements (Draft) |  Yes  |    Yes     |  No    |
| Change Study State           |  Yes  |    Yes     |  No    |
| Manage Recruitment Links     |  Yes  |    Yes     |  No    |
| Export Data                  |  Yes  |    Yes     |  No    |
| Manage Project Members       |  Yes  |    No      |  No    |
| Delete Study                 |  Yes  |    No      |  No    |

---

## Recruitment

**Location**: Study sidebar > Recruitment

### Creating Access Links

Generate unique recruitment links to control and track participant cohorts:

1. **Public Links**: Unlimited usage. Ideal for social media or open recruitment.
2. **Individual Links**: Single-use tokens for panel recruitment or longitudinal studies.
3. **Limited Links**: Capped usage (e.g., 50 participants per link).

### Tracking Metrics

Monitor your recruitment funnel in real-time:

- **Total Links**: Number of active recruitment links.
- **Started**: Participants who accessed the study via a link.
- **Submitted**: Participants who completed the full sorting session.
- **Success Rate**: Percentage of starts that resulted in submissions.

> [!TIP]
> A low success rate often indicates usability issues. Review your instructions, grid complexity, or mobile experience.

### QR Codes

Each recruitment link can generate a QR code for printed materials, conference presentations, or classroom settings.

---

## Data Page

**Location**: Study sidebar > Data

### Participant Table

A searchable, sortable table of all participants showing:

- Participant ID (anonymous)
- Status (completed, in progress, started)
- Submission timestamp and duration
- Language used and device type
- Test run flag and discard status

### Timeline and Device Charts

- **Submissions Timeline**: Track participation velocity with daily trends.
- **Device Breakdown**: Distribution of desktop, mobile, and tablet participants.

### Individual Participant Detail

Click any participant to view their detailed session:

- **Grid Reconstruction**: High-fidelity visual of the participant's exact Q-sort placement.
- **Presort and Post-sort Responses**: All survey answers in a structured view.
- **Audio Recordings**: Playback controls for audio responses (if S3 is configured).
- **Metadata**: Device, browser, language, duration, timestamps.

### Managing Responses

- **Discard**: Flag a participant's data as discarded with a mandatory reason (e.g., "incomplete sorting", "suspected bot"). Discarded participants are excluded from exports and analysis but data is preserved for audit purposes.
- **Test Runs**: Test submissions are automatically flagged and can be cleared from this page.

### Pilot / Test Mode

The study designer includes a built-in pilot mode for non-destructive testing:

1. In the Design page, use the **Preview** action to launch a test session.
2. The participant view opens with `?mode=test` in the URL, loading the current draft from local storage instead of the backend.
3. Complete the study as a participant would — no data is persisted to the database.
4. A local confirmation code (e.g., `PILOT-ABC123`) is generated at the end.

Pilot mode supports cross-tab collaboration: multiple team members can test the same draft simultaneously via `localStorage` synchronization. Each pilot session is isolated from real participant data.

> [!TIP]
> Use pilot mode to walk through the full participant experience before activating your study. The session resets automatically on the next visit.

---

## Analysis

**Location**: Study sidebar > Analysis

### Scree Plot

Displays eigenvalues to help determine the optimal number of factors. A Kaiser criterion reference line (eigenvalue > 1) is drawn automatically. Components above this line are suggested as meaningful factors.

### Analysis Configuration

- **Extraction Method**: PCA (Principal Component Analysis) or Centroid extraction (Brown 1980). PCA is faster; Centroid is traditional in Q-methodology.
- **Number of Factors**: Select based on the scree plot elbow and Kaiser criterion (eigenvalue > 1.0). The system suggests a default count.
- **Rotation**: Varimax with Kaiser normalization (standard) or None.
- **Flagging**: Auto-flagging uses a dual threshold — significance (`1.96 / sqrt(n_statements)`) and dominance (loading must be highest on one factor). Manual flagging allows researcher override.

### Results Tabs

After running an analysis:

- **Loadings**: Participant-by-factor loading matrix with significance highlighting and flag indicators.
- **Factor Arrays**: Composite Q-sort for each factor showing idealized statement placements, computed from weighted z-scores of flagged participants.
- **Statements**: Z-scores, factor array positions, and distinguishing/consensus classifications:
  - **Distinguishing (D)**: Statements where a factor's z-score differs significantly from other factors, tested at p < 0.05, 0.01, and 0.001 using Standard Error of Differences (SED).
  - **Consensus (C)**: Statements with no significant differences across any pair of factors.
- **Characteristics**: Eigenvalues, variance explained, composite reliability (Spearman-Brown formula), standard error of factor scores, and factor correlation matrix.

> [!NOTE]
> Test runs and discarded participants are automatically excluded from analysis. At least 2 non-discarded participants are required to run an analysis.

---

## Data Exports

**Location**: Study sidebar > Data (export options)

### Export Formats

1. **CSV (Wide Format)**: One row per participant, columns for metadata and statement scores. Compatible with Excel, SPSS, and other spreadsheet tools.
2. **PQMethod ZIP**: `.dat` and `.sta` files formatted for PQMethod and Ken-Q Analysis software.
3. **KenQ JSON**: Complete JSON structure compatible with web-based analysis tools.
4. **R-Kit ZIP**: CSV data file with a ready-to-run R script using the `qmethod` package.
5. **Research Package**: Comprehensive ZIP with all formats, codebook, and metadata for archiving.

### Individual Participant Exports

From a participant's detail view, export their data individually as CSV or JSON. Audio recordings can be downloaded as a ZIP.

### Data Privacy

All exports are available only to users with at least Researcher permissions on the study. No PII is stored unless specifically requested in the presort configuration. Researchers are encouraged to only collect necessary data.

Qualis implements several privacy protections automatically:

- **IP Address Hashing**: Participant IP addresses are hashed using SHA-256 with a configurable salt (`IP_HASH_SALT`) before storage. Raw IPs are never persisted.
- **Consent Audit Trail**: Each participant's consent is recorded with a hash of the consent version they saw, enabling researchers to audit which consent text each participant agreed to.
- **Language Resolution**: When exporting multilingual studies, option labels are resolved using the participant's language, falling back to the study's default language, then to the first available translation.

---

## Profile and Security

**Location**: Profile page

### Account Settings

- **Email**: Your login identifier.
- **Full Name**: Display name shown in the UI.
- **Password**: Change your account password.

### Two-Factor Authentication (2FA)

Enable TOTP-based 2FA to secure your account:

1. Click **Setup 2FA**.
2. Scan the QR code with an authenticator app (Google Authenticator, Authy, Bitwarden, etc.).
3. Enter the 6-digit code to confirm activation.

Once enabled, login requires both your password and a valid TOTP token.

> [!IMPORTANT]
> To disable 2FA, you must provide your current password as verification.

---

## Project Management

Projects provide organizational isolation for multi-tenant deployments:

- **Create Project**: Set up an isolated environment for a research team.
- **Manage Members**: Assign project-level roles (Owner, Researcher, Viewer).
- **Switch Projects**: Use the project switcher in the sidebar.
- **Storage Usage**: Monitor total audio storage consumption and quota from the study settings page.

---

## Collaborative Editing

When multiple team members edit a study simultaneously, Qualis provides safety mechanisms to prevent data loss:

- **Auto-Save with Backup**: Changes are automatically backed up to local storage every second. If the browser closes unexpectedly, unsaved changes are recovered on the next visit.
- **Navigation Guard**: Attempting to leave the Design page with unsaved changes triggers a confirmation dialog.
- **Optimistic Locking**: If another user saves changes while you are editing, the system detects the conflict (HTTP 409) and attempts a 3-way merge. Simple changes (metadata, translations) are merged automatically. Structural conflicts (grid, statements) require manual resolution.
- **Sync Status**: The Design page shows a real-time indicator: *Synced*, *Saving...*, *Modified*, or *Error*.

---

## Keyboard Shortcuts

| Shortcut        | Action                                |
| :-------------- | :------------------------------------ |
| `Cmd+K` / `Ctrl+K` | Open the command menu for quick navigation between studies, projects, and actions |

---

## User Management (Superuser)

Superusers can manage all user accounts:

- **List Users**: View all registered accounts.
- **Create User**: Manually create an account.
- **Delete User**: Remove an account (cannot delete yourself).

> [!CAUTION]
> Superuser status grants global access to all studies and projects. Only assign this role to trusted platform administrators.

---

## Study Overview

**Location**: Study sidebar > Overview

Get a high-level view of your study's progress:

- **Study State Badge**: Visual indicator of Draft/Active/Paused/Closed/Archived status.
- **Participant Count**: Total starts and submissions.
- **Recent Activity**: Latest participant submissions.
- **Quick Actions**: Shortcuts to Design, Recruitment, and Data.

---

## Best Practices

1. **Start in Draft**: Build and test your study configuration thoroughly before activating.
2. **Use Test Runs**: Walk through the participant experience before going live.
3. **Use Recruitment Links**: Track cohorts separately for better analysis (e.g., "Twitter Campaign", "Email List Batch 1").
4. **Enable 2FA**: Protect sensitive research data from unauthorized access.
5. **Monitor Success Rates**: A drop below 60% often signals UX issues.
6. **Export Regularly**: Back up your data throughout the study lifecycle.
