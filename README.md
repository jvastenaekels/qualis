# Libre-Q

**The open-source platform for Q-methodology research.**

Design studies, collect Q-sorts on any device, and run factor analysis — all from your browser. No software to install, no vendor lock-in, no data leaving your server.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/jvastenaekels/libre-q/actions/workflows/ci.yml/badge.svg)](https://github.com/jvastenaekels/libre-q/actions/workflows/ci.yml)

<!-- TODO: Add hero screenshot of the Q-sort grid interface -->

---

## Why Libre-Q?

Most Q-methodology tools require desktop software, outdated browser plugins, or expensive subscriptions — and none of them cover the full research workflow. Libre-Q is different.

| Capability | FlashQ / HTMLQ | PQMethod | Ken-Q | Libre-Q |
| :--- | :---: | :---: | :---: | :---: |
| Browser-based data collection | Yes | No | No | **Yes** |
| Mobile & tablet support | Limited | No | No | **Yes** |
| Built-in factor analysis | No | Yes | Yes | **Yes** |
| Enforced forced distribution | Partial | N/A | N/A | **Yes** |
| Multi-language studies | No | No | No | **Yes** |
| Audio post-sort responses | No | No | No | **Yes** |
| Recruitment tracking & funnels | No | No | No | **Yes** |
| Team collaboration (roles) | No | No | No | **Yes** |
| Export to PQMethod / R / Ken-Q | N/A | N/A | N/A | **Yes** |
| Self-hosted / data ownership | Partial | Desktop | No | **Yes** |
| Open source | Yes | No | No | **Yes** |

---

## Key Features

### Participant Experience

- **Works on any device.** Smartphone, tablet, or desktop — participants open a link and start sorting. No apps, no plugins, no Java.
- **Mobile-first drag-and-drop.** A focus-flow interface engineered for touchscreens with auto-pan, dwell-zoom, and edge scrolling. Participants who can't use a desktop aren't excluded.
- **Guided sorting process.** The Rough Sort (agree/neutral/disagree) eases participants into the task before the Fine Sort (forced distribution), reducing cognitive load and dropout.
- **Strict forced distribution.** The grid enforces your exact distribution shape. Participants cannot submit an invalid sort — no missing items, no duplicates, no wrong column counts.
- **Deterministic randomization.** Statement order is shuffled per participant to prevent order effects, with the same order preserved on page refresh.

### Study Design

- **Visual grid designer** with symmetry lock, live capacity validation, and configurable score ranges.
- **Rich survey builder** with 9 question types (text, number, select, radio, checkbox, date, email, textarea, audio), conditional visibility, drag-to-reorder, and per-question validation.
- **Multi-language support** built in from day one. Add translations for statements, instructions, consent forms, and UI labels. Participants see the study in their language automatically.
- **Markdown-formatted content** for instructions, consent forms, and condition of instruction.
- **Import/Export configurations** to create study templates, back up designs, or clone studies across workspaces.
- **Pilot mode** to test the full participant experience without persisting any data.

### Analysis

- **Built-in factor analysis** — no need to export to external software for initial exploration.
- **PCA or Centroid extraction** (Brown 1980) with Varimax rotation and Kaiser normalization.
- **Scree plot** with Kaiser criterion reference line for factor selection.
- **Auto-flagging** with dual thresholds (significance + dominance), or manual flagging for researcher control.
- **Distinguishing & consensus statements** classified via Standard Error of Differences at multiple significance levels (p < 0.05, 0.01, 0.001).
- **Factor arrays, z-scores, composite reliability** (Spearman-Brown), and factor correlation matrix.

### Data Collection & Monitoring

- **Recruitment links** — public, single-use, or capacity-limited — with QR code generation and funnel tracking (started vs. completed).
- **Real-time dashboard** with submission timelines, device breakdowns, and success rates.
- **Individual session audit** with high-fidelity grid reconstruction, survey responses, and audio playback.
- **Test run management** to distinguish pilot data from real submissions.
- **Discard with reason** — flag problematic responses while preserving the audit trail.

### Export & Interoperability

| Format | Description |
| :----- | :---------- |
| **CSV** | Wide-format, one row per participant. Compatible with Excel, SPSS, Stata. |
| **PQMethod** | `.dat` + `.sta` files ready for PQMethod and Ken-Q Analysis. |
| **Ken-Q JSON** | Native format for Ken-Q web analysis. |
| **R-Kit** | CSV + auto-generated R script using the `qmethod` package. |
| **Research Package** | ZIP with all formats, codebook, and metadata for archiving. |

### Privacy & Security

- **Self-hosted.** Your data stays on your server. No third-party analytics, no tracking.
- **IP address hashing.** Participant IPs are SHA-256 hashed with a configurable salt before storage — never stored in plaintext.
- **Consent audit trail.** Each participant's consent is recorded with a hash of the version they agreed to.
- **Security headers** (HSTS, CSP, X-Frame-Options) and bcrypt password hashing.
- **Two-factor authentication** (TOTP) for researcher accounts.
- **Role-based access control.** Workspace-level roles (Owner, Researcher, Viewer) control who can edit, export, or manage team members.

### Collaboration

- **Workspaces** for team isolation — each research group gets its own space with members and studies.
- **Concurrent editing** with auto-save, optimistic locking, and 3-way merge conflict resolution.
- **Invitation system** via email (or shareable link when SMTP isn't configured).

---

## Quick Start

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Node.js](https://nodejs.org/) v24+
- PostgreSQL 15+

### Install & Run

```bash
git clone https://github.com/jvastenaekels/libre-q.git
cd libre-q
make install

# Terminal 1 — Backend (FastAPI)
make run-backend

# Terminal 2 — Frontend (React/Vite)
make run-frontend
```

Visit [http://localhost:5173](http://localhost:5173) to open the app.

```bash
# Run the full CI pipeline locally (lint + type check + test + build)
make ci
```

### Deploy

Libre-Q deploys as a single application (FastAPI serves the built React frontend). See the [Deployment Guide](docs/guides/deployment.md) for Scalingo, Render, Heroku, and Docker instructions.

---

## Documentation

Organized using the [Diataxis framework](https://diataxis.fr/). See the [full index](docs/README.md).

| | |
| :--- | :--- |
| **[Tutorials](docs/tutorials/)** | [Your First Study](docs/tutorials/your-first-study.md) &middot; [Collecting Responses](docs/tutorials/collecting-responses.md) &middot; [Analyzing Results](docs/tutorials/analyzing-results.md) &middot; [Local Development](docs/tutorials/local-development.md) |
| **[Guides](docs/guides/)** | [Conducting Studies](docs/guides/conducting-studies.md) &middot; [Admin Features](docs/guides/admin-features.md) &middot; [Data Export](docs/guides/data-export.md) &middot; [Deployment](docs/guides/deployment.md) &middot; [S3 Audio Setup](docs/guides/s3-setup.md) |
| **[Reference](docs/reference/)** | [API](docs/reference/api.md) &middot; [Configuration](docs/reference/configuration.md) &middot; [Components](docs/reference/components.md) |
| **[Explanation](docs/explanation/)** | [Architecture](docs/explanation/architecture.md) &middot; [Q-Methodology](docs/explanation/q-methodology.md) &middot; [Mobile UX Decisions](docs/explanation/design-decisions/mobile-ux.md) |

---

## Tech Stack

| Layer | Technologies |
| :---- | :----------- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, dnd-kit, Zustand, TanStack Query, react-i18next |
| **Backend** | Python 3.13, FastAPI, SQLAlchemy (async), Pydantic, Alembic |
| **Database** | PostgreSQL 15+ |
| **Storage** | S3-compatible (AWS, MinIO, Cloudflare R2) for audio recordings |
| **Tooling** | uv, npm, Biome, Ruff, Vitest, Playwright |

---

## Contributing

We welcome contributions! Please read our guidelines before submitting a PR:

- [Coding Standards](docs/contributing/coding-standards.md)
- [Frontend Guidelines](docs/contributing/frontend-guidelines.md)
- [Backend Guidelines](docs/contributing/backend-guidelines.md)
- [Development Setup](docs/guides/contributing/development.md)

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

**Mission:** Libre-Q contributes to Open Science by providing a transparent, reproducible, and accessible tool for subjectivity research, ensuring that data ownership remains with the researcher.
