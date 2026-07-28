# Feature reference

The complete catalogue, grouped by area. The README carries a summary; this page
is the detail.

### Participant experience

- **Clean, readable layout.** A simple interface that lets participants focus on the sorting task.
- **Works across common devices.** Participants can open a study link on a phone, tablet, or desktop browser and start sorting without installing apps or plugins.
- **Mobile-first drag-and-drop.** Touch-optimised sorting with auto-pan, dwell-zoom, and edge scrolling, so participants without desktop access are not excluded.
- **Intercultural studies.** Translate statements, instructions, consent forms, and UI labels into multiple languages; participants see the study in their preferred language. Lowers the barrier to cross-cultural and multi-site Q research.

### Study design

- **Visual grid designer** with symmetry lock, capacity validation, and configurable score ranges.
- **Survey builder** with 10 question types (text, long text, number, date, email, audio, dropdown, radio, checkboxes, rating), conditional visibility, reordering, and per-question validation.
- **Markdown-formatted content** for instructions, consent forms, and condition of instruction.
- **Import/Export configurations** to create templates, back up designs, or clone studies across projects.
- **Optional rough-sort step.** The 3-pile triage that precedes the fine-sort grid is configurable per study, since not every protocol uses it.
- **Pilot mode** to run through the full participant experience without persisting any data.

### Concourse

A reusable pool of candidate statements that lives at the project level, not the study level. Researchers can curate the concourse over time, draw on it across multiple studies, and keep the curatorial trail attached to the data.

- **Project-scoped statement pool** with status workflow (proposed, accepted, rejected) so the team can see what was considered and what was excluded.
- **Per-item provenance**: source citation, multilingual translations, free-form tags, and an editable code.
- **Version history** on each statement so revisions are traceable.
- **Item-level comments** for team discussion of curatorial choices, alongside concourse-level memos that travel with exports for replication and pre-registration packages.
- **Q-set sampling** into a study with one click; the link back to the concourse is preserved.

### Analysis

- **Built-in factor analysis** for initial exploration without exporting to external software.
- **PCA or Centroid extraction** (Brown 1980) with Varimax or judgmental (manual) rotation and Kaiser normalization.
- **Scree plot** with Kaiser criterion reference line for factor selection.
- **Auto-flagging** using significance and dominance thresholds, or manual flagging for full researcher control.
- **Distinguishing and consensus statements** classified via Standard Error of Differences at multiple significance levels (p < 0.05, 0.01, 0.001).
- **Factor arrays, z-scores, composite reliability** (Spearman-Brown), and factor correlation matrix.

### Data collection and monitoring

- **Recruitment links** (public, single-use, or capacity-limited) with QR code generation and funnel tracking (started vs. completed).
- **Monitoring dashboard** with submission timelines, device breakdowns, and completion rates.
- **Session review** with grid reconstruction, survey responses, and audio playback.
- **Discard with reason** to flag problematic responses while preserving the audit trail.

### Export and interoperability

| Format | Description |
| :----- | :---------- |
| **CSV** | Wide-format, one row per participant. Compatible with Excel, SPSS, Stata. |
| **PQMethod** | `.dat` + `.sta` files ready for PQMethod and Ken-Q Analysis. |
| **Ken-Q JSON** | Native format for Ken-Q web analysis. |
| **R-Kit** | CSV + auto-generated R script using the `qmethod` package. |
| **Research Package** | ZIP with all formats, codebook, and metadata for archiving. |

### Privacy and security

- **Self-hosted.** Data stays on your server with no third-party analytics or tracking.
- **IP address hashing.** Participant IPs are SHA-256 hashed with a configurable salt before storage. Plaintext IPs are never persisted.
- **Consent audit trail.** Each participant's consent is recorded with a hash of the consent version they agreed to.
- **Security headers** (HSTS, CSP, X-Frame-Options) and bcrypt password hashing.
- **Two-factor authentication** — TOTP (authenticator app), with a self-serve recovery flow to disable 2FA when the authenticator is lost.
- **Email-driven account flows** — sign-up email verification and password reset via time-limited tokens; graceful degradation when SMTP is not configured (dev-friendly).
- **Role-based access control.** Project-level roles (Owner, Member, Viewer) control who can edit, export, or manage team members.

### Collaboration

- **Projects** to isolate research groups, each with its own members and studies.
- **Shared project access** for research teams, with role-based permissions for editing, exports, and member management.
- **Invitation system** via email, or shareable link when SMTP is not configured.

---
