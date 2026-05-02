# Admin Dashboard Reference

Page-by-page catalog of the admin dashboard. Each section maps a sidebar entry to the controls and data it surfaces.

For task-oriented walkthroughs ("how do I…?") see [`../guides/conducting-studies.md`](../guides/conducting-studies.md). For team and account management at the project level, see [`../guides/admin-management.md`](../guides/admin-management.md).

---

## Sidebar layout

The dashboard is scoped to a single study at a time. The active study is selected via the study switcher; the active project is selected via the project switcher.

| Page | Path | Purpose |
| ---- | ---- | ------- |
| Overview | `/admin/studies/{slug}` | Study state, headline counts, recent activity |
| Design | `/admin/studies/{slug}/design` | Study configuration (7 tabs) |
| Recruitment | `/admin/studies/{slug}/recruitment` | Access links, conversion funnel |
| Data | `/admin/studies/{slug}/data` | Participant table, charts, individual sessions, exports |
| Analysis | `/admin/studies/{slug}/analysis` | Factor analysis runs, scree plot, results tabs |
| Members | `/admin/projects/{slug}/members` | Project-level: invitations, roles, removal |
| Profile | `/admin/profile` | Account settings, 2FA |

A **Memos** drawer is available on every study and concourse page via a toolbar icon (see [Memos](#memos)).

---

## Overview

| Element | Notes |
| ------- | ----- |
| State badge | Draft / Active / Paused / Closed / Archived. |
| Participant count | Total starts and submissions. |
| Recent activity | Last submissions chronologically. |
| Quick actions | Shortcuts to Design, Recruitment, Data. |

---

## Design

Seven tabs.

### General

| Field | Notes |
| ----- | ----- |
| Slug | Unique within the project. Editable in Draft. |
| Default language | ISO 639-1 fallback locale. |
| Study state | One of Draft, Active, Paused, Closed, Archived. State transitions are constrained (see below). |
| Show statement codes | Toggles `S1`, `S2`, … visibility on cards. |
| Randomize statements | Per-session deterministic shuffle. |

State transitions:

| From | To | Constraints |
| ---- | -- | ----------- |
| Draft | Active | Validation must pass (`POST /api/admin/studies/{slug}/validate`). |
| Active | Paused | Allowed any time; halts new submissions. |
| Paused | Active | Allowed any time. |
| Active / Paused | Closed | Definitive end of collection; exports remain. |
| Closed | Archived | Long-term storage state. |
| Archived | (deleted) | Superuser only, via `DELETE /api/admin/studies/{slug}`. |

### Presort, Postsort

Survey field types: `text`, `textarea`, `number`, `select`, `radio`, `checkbox`, `date`, `email`, and (post-sort only, when S3 is configured) `text_audio`.

Per-question features: localized labels and placeholders, required validation, conditional visibility (`equals`, `not_equals`, `contains`, `greater_than`, `less_than`), drag-to-reorder.

### Instruction

Markdown editor for the welcome page, condition of instruction, and consent text. Rendered with DOMPurify XSS protection.

### Grid & Q-Set

| Control | Notes |
| ------- | ----- |
| Grid columns | Editable score and capacity per column. Sum of capacities must equal statement count. |
| Symmetry lock | Enforces symmetric capacities (e.g. `-3` capacity equals `+3`). |
| Statements list | Add / edit / remove statements. Each statement has a code and per-language translations. |

Once the study is Active, grid and statements become read-only. Translations and metadata remain editable.

### Branding

Logo URL, accent colour, primary colour, partner logos. See [`study-configuration-format.md`](study-configuration-format.md#branding-object) for the field schema.

### Interface

Interaction mode (drag, tap-to-place) and overall interface style.

### Import / Export

| Action | Notes |
| ------ | ----- |
| Export configuration | JSON; excludes participant data. Filename `{slug}_config_{YYYYMMDD}.json`. |
| Import study | Validates JSON via `POST /api/admin/studies/validate-import`, then creates a new DRAFT study with an editable slug. |
| Preview (pilot mode) | Opens the participant view with `?mode=test`, loading the current draft from local storage. The submit step is short-circuited locally; nothing reaches the backend. |

---

## Recruitment

| Control | Notes |
| ------- | ----- |
| Create link | Three types: public (unlimited), individual (single-use token), limited (capped uses). |
| QR code | Generated per link for printed materials. |
| Funnel | Total Links / Started / Submitted / Success Rate. |
| Revoke | `DELETE /api/admin/recruitment/links/{link_id}`. |

---

## Data

### Participant table

Columns: anonymous ID, status, submission timestamp, duration, language, device type, discard status. Searchable and sortable; pagination is server-side.

### Charts

- Submissions timeline (daily counts).
- Device breakdown (desktop / mobile / tablet).

### Participant detail

Click any row to open the inspector (three tabs: Visual Sort, Responses, Environment).

| Tab | Content |
| --- | ------- |
| Visual Sort | Reconstructed Q-grid (`GridSort` in read-only mode). |
| Responses | All presort and postsort answers; audio playback when present. |
| Environment | Device, browser, language, IP-hash, durations, timestamps. |

### Discard / restore

Discarding a participant requires a reason. Discarded rows are excluded from analysis and exports but are preserved for audit.

### Pilot-mode sessions

Sessions opened via Preview (pilot mode) never reach the database — the frontend short-circuits the submit step and generates a local `PILOT-XXXXX` confirmation code instead. The Data page therefore shows zero pilot records by default.

### Exports

| Format | Endpoint | Notes |
| ------ | -------- | ----- |
| CSV (wide) | `/export/csv` | One row per non-discarded participant. |
| PQMethod | `/export/pqmethod` | `.dat` + `.sta` ZIP. Completed only. |
| R-Kit | `/export/r-kit` | CSV + auto-generated `qmethod` script. |
| Research package | `/export/package` | All formats + codebook + metadata. |
| Single participant CSV | `.../participants/{id}/export/csv` | |
| Single participant JSON | `.../participants/{id}/export/json` | |
| Single participant audio | `.../participants/{id}/export/audio` | ZIP. |

See [`../guides/data-export.md`](../guides/data-export.md) for the workflow.

---

## Analysis

### Scree plot

Eigenvalues with a Kaiser reference line at `λ = 1`. Source: `GET /api/admin/studies/{slug}/analysis/eigenvalues`.

### Configuration

| Setting | Values | Notes |
| ------- | ------ | ----- |
| Extraction | PCA / Centroid | Centroid follows Brown 1980. |
| Number of factors | Integer | Default suggested from Kaiser criterion. |
| Rotation | Varimax / None | Varimax uses Kaiser normalization. |
| Flagging | Auto / Manual | Auto-flag threshold: significance at `1.96 / sqrt(n_statements)`, plus dominance (highest loading on a single factor). |

### Explorer panel

Diagnostic block surfaced at the top of the Analysis page. Source: `POST /api/admin/studies/{slug}/analysis/preview-range`.

- **Eigenvalue / variance preview** for a configurable factor-count range (typically 1–10), so you can scan how variance breaks down without committing to a full run per candidate.
- **Cumulative variance** and **scree-line context** alongside the Kaiser λ = 1 reference.
- **Recommended factor count** based on the Kaiser criterion, with a manual override that drives the next run.

### Results tabs

| Tab | Content |
| --- | ------- |
| Loadings | Participant × factor loadings, with significance highlighting and flag controls. |
| Factor Arrays | Composite Q-sort per factor (weighted z-scores of flagged participants). |
| Statements | Z-scores, factor positions, distinguishing/consensus classifications at p < 0.05, 0.01, 0.001 (Standard Error of Differences). |
| Characteristics | Eigenvalues, variance explained, composite reliability (Spearman-Brown), factor correlation matrix. |

### Compare

When two analysis runs exist, the Compare bar aligns them via Tucker φ congruence (computed client-side; see `frontend/src/utils/tuckerPhi.ts`).

- **φ matrix**: pairwise congruence between factors of the two runs.
- **Aligned arrays**: factors of the second run reordered + sign-flipped to maximise congruence with the first.
- **Delta columns**: per-statement difference between aligned arrays.

Used to verify that minor changes (different N, different rotation, different flagging) produce equivalent factor structures. Threshold rule of thumb: φ ≥ 0.95 = identical, 0.90 ≤ φ < 0.95 = equivalent, φ < 0.90 = the perturbation mattered.

### Factor canvas

A focus-mode view for one factor at a time. The factor array sits on the left; a **voices panel** on the right pulls participant material for the highest-loading flagged participants — post-sort comments, audio playback, distinguishing statements at the column extremes — that you can pin onto the canvas to anchor interpretive claims in specific participant voices. Per-factor researcher notes save back to the run.

Each run is persisted to the audit trail (`AnalysisRun`); past runs are accessible from the history panel and can be reloaded or deleted. Notes on a run are editable; results are immutable.

Discarded participants are excluded automatically. Minimum: 2 non-discarded participants.

---

## Memos

A drawer of structured notes attached to a parent (study or concourse). Surfaced on all admin pages of that parent via a toolbar icon. Source: `GET /api/admin/{studies|concourses}/{id}/memo` and related endpoints.

### Entries

A memo is a list of titled entries, each with a markdown body (up to 10 000 chars). Entries are reorderable and may be added or deleted by any project member with edit rights. The drawer remembers position and read state per user.

### Threaded comments

Each entry has a comment thread. Comments support `@user` mentions stored as a `mentions: int[]` array on the comment; mentioned users see an unread badge on the toolbar icon until they open the drawer. Comments can be marked **resolved** (resolution is reversible) or soft-deleted.

### Templates

The **Methodology memo** template surfaces as a dedicated entry on the Study Designer toolbar — a one-click way to log design decisions next to the controls that produced them. Source: `GET /api/admin/memo/templates`.

### Export

Memos are included in the Research Package export. See [Data Export](../guides/data-export.md).

---

## Members

Project-scoped page (path: `/admin/projects/{slug}/members`). Lists project members with their role and supports invitations and removals. Source: `GET /api/admin/projects/{slug}/members`.

### Member table

| Column | Notes |
| ------ | ----- |
| Member | Name + email; current user marked. |
| Role | `Owner` / `Editor` / `Viewer` (see [API roles](api.md#roles)). Editable inline by Owners via a select. |
| Actions | Remove member (Owners only; cannot self-remove). |

### Invitations

The **Invite member** dialog accepts an email and role. If SMTP is configured, an email is sent; otherwise a shareable invitation link is shown in a confirmation dialog. Pending invitations are listed alongside the member table.

This page replaces the previous embedded members list inside Project Settings.

---

## Profile

### Account

Email, full name, password change.

### 2FA (TOTP)

`Setup 2FA` → scan the provisioning QR with an authenticator app → enter the 6-digit code to enable. Disabling requires the current password.

---

## Keyboard shortcuts

| Shortcut | Action |
| -------- | ------ |
| `Cmd+K` / `Ctrl+K` | Command menu (quick navigation across studies, projects, actions). |
