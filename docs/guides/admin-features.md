# Admin Dashboard Features

This guide provides a comprehensive overview of all administrative features available in the Open-Q platform.

---

## 📊 Dashboard Overview

The Admin Dashboard is organized into dedicated pages for each study:

- **Overview**: Study statistics, participation trends, and quick actions.
- **Analytics**: Deep dive into consensus analysis, duration patterns, and data quality.
- **Design**: Configure grid shape, statements, translations, and study behavior.
- **Team**: Manage collaborators and invite new researchers.
- **Recruitment**: Create access links, track conversion funnels, and monitor success rates.
- **Exports**: Download participant data and explore individual grid reconstructions.
- **Profile**: Manage your account security and enable 2FA.

---

## 🎨 Study Design

### Study Configuration

**Location**: `/admin/studies/{slug}/design`

#### Core Settings

- **Study Slug**: Unique identifier used in participant URLs.
- **Default Language**: Fallback locale if the participant's language is unavailable.
- **Study State**: Control public access and editing capabilities.
  - **Draft**: Full editing capabilities. Ideal for initial setup.
  - **Active**: Public and collecting data. Structural changes (grid, statements) are locked.
  - **Paused**: Temporarily closed to new submissions. Allows text/translation fixes.
  - **Closed**: No longer accepting submissions. Exports remain available.

#### Grid Configuration

Define the forced distribution shape for the Q-sort:

- **Score**: The numerical value of each column (e.g., -4 to +4).
- **Capacity**: Number of statements that fit in each column.

> [!IMPORTANT]
> The sum of all column capacities **must equal** the total number of statements.

#### Behavioral Options

- **Show Statement Codes**: Display "S1", "S2" identifiers on cards for easier analysis.
- **Randomize Statements**: Shuffle statement order per participant to prevent bias (Q-methodology best practice).
- **Access Password**: Require a password before participants can view the study content.

### Translations & Content

Manage multilingual content for your study:

- **Title**: Main study name.
- **Description**: Brief overview shown on the welcome page.
- **Instructions**: Detailed Markdown content explaining the research context.
- **Consent**: Customizable consent form (title, description, accept/decline text).

### Statements

Add, edit, or remove statements from your Q-set:

- Each statement supports translations in multiple languages.
- Statement codes (e.g., "S1", "S2") are used for internal tracking and exports.

> [!WARNING]
> Once a study is **Active**, you cannot add or remove statements. Plan your Q-set carefully during the Draft phase.

### Pre-Sort & Post-Sort

Configure demographic questions (Pre-Sort) and qualitative follow-up questions (Post-Sort):

- **Pre-Sort**: Collect participant metadata (age, gender, occupation, etc.).
- **Post-Sort**: Ask participants to comment on extreme placements or provide general feedback.

---

## 👥 Team Management

**Location**: `/admin/studies/{slug}/team`

### Inviting Collaborators

1. Enter the collaborator's email address.
2. Select their role (**Editor** or **Viewer**).
3. Click **Send Invitation**.

The system generates a unique registration link. If SMTP is configured, an email is sent automatically. Otherwise, the link is displayed in the UI for manual sharing.

### Roles & Permissions

| Feature                      | Owner | Editor | Viewer |
| :--------------------------- | :---: | :----: | :----: |
| View Study Configuration     |  ✅   |   ✅   |   ✅   |
| Edit Translations/Metadata   |  ✅   |   ✅   |   ❌   |
| Edit Grid/Statements (Draft) |  ✅   |   ✅   |   ❌   |
| Change Study State           |  ✅   |   ✅   |   ❌   |
| Manage Recruitment Links     |  ✅   |   ✅   |   ❌   |
| Export Data                  |  ✅   |   ✅   |   ✅   |
| Invite/Remove Collaborators  |  ✅   |   ❌   |   ❌   |
| Delete Study                 |  ✅   |   ❌   |   ❌   |

---

## 📡 Recruitment & Analytics

**Location**: `/admin/studies/{slug}/recruitment`

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

### Visual Analytics

The recruitment page now includes interactive charts to help you optimize your outreach:

- **Recruitment Funnel**: A visual pipeline showing the conversion from Link Visit → Study Start → Submission.
- **Link Comparison**: Benchmarking chart comparing performance metrics across different recruitment channels.

---

## 📦 Data Exports

**Location**: `/admin/studies/{slug}/exports`

### Interactive Inspection

Before exporting raw data, use the **Interactive Data View** to audit your results:

- **Participant ID**: Click any ID to view that participant's specific grid reconstruction and survey responses.
- **Audit Tooltips**: Identify why a participant was flagged as suspect or see their qualitative comments at a glance.

### Export Formats

1. **Full JSON Dump**
   - Complete study configuration + all participant data.
   - Ideal for backup or custom analysis pipelines.

2. **CSV (Wide Format)**
   - One row per participant, columns for metadata and statement scores.
   - Compatible with Excel, SPSS, and other spreadsheet tools.

3. **PQMethod ZIP**
   - `.dat` and `.sta` files formatted for PQMethod software.
   - Industry-standard format for Q-methodology factor analysis.

4. **KenQ JSON**
   - Optimized for the Web-KenQ analysis tool. Contains study definition and sorts.

### Data Privacy

All exports are available only to users with at least **Viewer** permissions on the study. IP addresses are hashed by default to protect participant anonymity.

---

## 📈 Study Analytics

**Location**: `/admin/studies/{slug}/analytics`

The Analytics module provides advanced research insights beyond simple counts:

### Participation Trends

- **Submissions Timeline**: Track participation velocity with daily "Started vs. Completed" comparisons.
- **Completion Rate Evolution**: Monitor how your conversion rate changes over time to identify engagement drops.

### Data Quality & Distribution

- **Duration Distribution**: A histogram of completion times.
  - 🚩 **Suspect Flag**: Participants who complete the study in under 2 minutes are automatically flagged as "Suspect" (speeders).
- **Device Breakdown**: Analysis of the hardware used by participants (Desktop vs. Mobile).

### Content Analysis (Consensus & Controversy)

Identify the most significant patterns in your Q-set:

- **Consensus Analysis**: Statements with the lowest standard deviation (where participants agree the most).
- **Controversy Analysis**: Statements with the highest variance (where views are most polarized).
- **Research Strength**: Real-time confidence indicator based on your current sample size.

---

## 🔍 Individual Participant Detail

**Location**: `/admin/studies/{slug}/exports` (Click any participant ID)

Inspect individual perspectives with high-fidelity visualizations:

- **Grid Reconstruction**: See the participant's exact sorting layout in a 2D pyramid grid matching the study design.
- **Interactive Tooltips**: Hover over statements in the grid to read their full text and see their original code.
- **Metadata Inspection**: View duration, user agent, and survey responses alongside the visual sort.

---

## 🔐 Profile & Security

**Location**: `/admin/profile`

### Account Settings

- **Email**: Your login identifier (cannot be changed directly - contact admin).
- **Full Name**: Display name shown in the UI.
- **Password**: Change your account password anytime.

### Two-Factor Authentication (2FA)

Enable TOTP-based 2FA to secure your account:

1. Click **Setup 2FA**.
2. Scan the QR code with an authenticator app (Google Authenticator, Authy, Bitwarden, etc.).
3. Enter the 6-digit code to confirm activation.

Once enabled, login requires both your password and a valid TOTP token.

> [!IMPORTANT]
> To disable 2FA, you must provide your current password as verification.

---

## 🏢 Workspace Management (Superuser)

**Location**: `/admin/workspaces` (Superuser only)

Workspaces provide organizational isolation for multi-tenant deployments:

- **List Workspaces**: View all workspaces in the system.
- **Create Workspace**: Set up a new isolated environment for a research team.
- **Manage Members**: Assign workspace-level roles (Admin, Researcher, Viewer).

---

## 👤 User Management (Superuser)

**Location**: `/admin/users` (Superuser only)

Superusers can manage all user accounts:

- **List Users**: View all registered accounts.
- **Create User**: Manually create an account (useful for admin-managed onboarding).
- **Delete User**: Remove an account (cannot delete yourself).

> [!CAUTION]
> Superuser status grants global access to all studies and workspaces. Only assign this role to trusted platform administrators.

---

## 📈 Study Overview

**Location**: `/admin/studies/{slug}`

Get a high-level view of your study's progress:

- **Study State Badge**: Visual indicator of Draft/Active/Paused/Closed status.
- **Participant Count**: Total starts and submissions.
- **Recent Activity**: Latest participant submissions.
- **Quick Actions**: Shortcuts to Design, Recruitment, and Exports.

---

## 🚀 Best Practices

1. **Start in Draft**: Build and test your study configuration thoroughly before activating.
2. **Use Recruitment Links**: Track cohorts separately for better analysis (e.g., "Twitter Campaign", "Email List Batch 1").
3. **Enable 2FA**: Protect sensitive research data from unauthorized access.
4. **Monitor Success Rates**: A drop below 60% often signals UX issues.
5. **Export Regularly**: Back up your data throughout the study lifecycle.
