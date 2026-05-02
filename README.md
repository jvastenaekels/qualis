<p align="center">
  <img src="docs/assets/qualis-logo.png" alt="Qualis" width="180" />
</p>

# Qualis

**Open-source platform for Q-methodology research.**

Design studies, collect Q-sorts, and run factor analysis from the browser. Supports any device, requires no software installation, and keeps data on your own server.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/jvastenaekels/qualis/actions/workflows/ci.yml/badge.svg)](https://github.com/jvastenaekels/qualis/actions/workflows/ci.yml)

<!-- TODO: Add hero screenshot of the Q-sort grid interface, e.g. docs/assets/hero-qsort.png -->
<!-- Suggested capture: a participant's mid-sort view on a tablet, statements visible, grid partially populated, language switcher visible. -->

---

## Statement of need

Q-methodology, Stephenson's (1953) approach to studying subjectivity through rank-ordering of statements, is used in environmental governance, health, education, and political ecology. Its uptake over the past decade has expanded into critical research traditions that emphasise reflexivity, transparency of analytical choices, situatedness of subjectivities, and integration of participant voice (Stainton Rogers 1997; Stenner 2011; Watts & Stenner 2012; Sneegas 2020).

Q-methodology tools typically separate data collection from analysis, and rarely cover multi-language studies, audio post-sort responses linked to the analysis, or programmatic access to the analytical pipeline. The capability table below breaks this down feature by feature.

Qualis covers the full workflow in a single self-hosted browser application: study design, mobile-first recruitment and data collection, factor analysis, and export to PQMethod, R, and Ken-Q formats. The analytical choices stay visible and editable by the researcher. Qualis respects the constraints of classical Brown-school analysis when the inquiry calls for them. When the inquiry is critical-Q, the platform extends the analytical surface through collaborative memos, audio post-sorts, and voices panels that keep participant material attached to factor interpretation.

Data ownership stays with the researcher, and Qualis can run on institutional infrastructure to meet the GDPR data-residency expectations common in European Q research.

---

## Comparison with existing tools

| Capability | HTMLQ | Quince (Banasick) | PQMethod | Ken-Q Analysis | KADE (Banasick 2019) | qmethod (R, Zabala 2014) | Qualis |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Browser-based data collection | Yes | Yes | No | No | No | No | **Yes** |
| Documented mobile & tablet support | Tablet | Yes | No | — | No | N/A | **Yes** |
| Built-in factor analysis | No | No | Yes | Yes | Yes | Yes | **Yes** |
| Multi-language studies | No | No | No | No | No | N/A | **Yes** |
| Audio post-sort responses | No | No | No | No | No | No | **Yes** |
| Shared memos | No | No | No | No | No | No | **Yes** |
| Reusable concourse with versioning and item-level discussion | No | No | No | No | No | No | **Yes** |
| Recruitment tracking & funnels | No | No | No | No | No | No | **Yes** |
| Team collaboration (roles) | No | No | No | No | No | No | **Yes** |
| Interop with PQMethod / R / Ken-Q formats | CSV out | KADE / PQMethod | Native | Imports PQMethod | Imports CSV/PQMethod | Yes (import & export) | **Yes** |
| Self-hosted | Yes | Frontend only | Desktop | Yes (static site) | Desktop | Yes (local R) | **Yes** |
| Open source | Yes (MIT) | Yes (GPL-3) | Yes (GPL) | Yes (GPL-3) | Yes (GPL-3) | Yes (GPL-2/3) | **Yes (AGPL-3)** |

*"N/A" indicates the capability does not apply to the tool category (e.g., R packages have no participant-facing UI, so "mobile support" is not applicable). "—" indicates we did not find documented support for the capability in the tool's published materials at the time of writing; corrections welcome via PR. "Ken-Q Analysis" refers specifically to the in-browser analysis app at `shawnbanasick.github.io/ken-q-analysis/`; data collection in the Banasick toolchain is handled by separate tools (Q-Sort Touch, **Quince**, EasyHTMLQ).*

---

## Key features

### Participant experience

- **Clean, readable layout.** A simple interface that lets participants focus on the sorting task.
- **Works on any device.** Smartphone, tablet, or desktop. Participants open a link and start sorting. No apps or plugins required.
- **Mobile-first drag-and-drop.** Touch-optimised sorting with auto-pan, dwell-zoom, and edge scrolling, so participants without desktop access are not excluded.
- **Multi-language support.** Translate statements, instructions, consent forms, and UI labels. Participants see the study in their preferred language.


### Study design

- **Visual grid designer** with symmetry lock, capacity validation, and configurable score ranges.
- **Survey builder** with 9 question types (text, number, select, radio, checkbox, date, email, textarea, audio), conditional visibility, reordering, and per-question validation.
- **Markdown-formatted content** for instructions, consent forms, and condition of instruction.
- **Import/Export configurations** to create templates, back up designs, or clone studies across projects.
- **Optional rough-sort step.** The 3-pile triage that precedes the fine-sort grid is configurable per study, since not every protocol uses it.
- **Pilot mode** to run through the full participant experience without persisting any data.

### Concourse

A reusable pool of candidate statements that lives at the project level, not the study level. Researchers can curate the concourse over time, draw on it across multiple studies, and keep the curatorial trail attached to the data.

- **Project-scoped statement pool** with status workflow (proposed, kept, dropped) so the team can see what was considered and what was excluded.
- **Per-item provenance**: source citation, multilingual translations, free-form tags, and an editable code.
- **Version history** on each statement so revisions are traceable.
- **Item-level comments** for team discussion of curatorial choices, alongside concourse-level memos that travel with exports for replication and pre-registration packages.
- **Q-set sampling** into a study with one click; the link back to the concourse is preserved.

### Analysis

- **Built-in factor analysis** for initial exploration without exporting to external software.
- **PCA or Centroid extraction** (Brown 1980) with Varimax rotation and Kaiser normalization.
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
- **Two-factor authentication** — TOTP (authenticator app) or email-OTP as a fallback channel; self-serve recovery flow to disable 2FA when the authenticator is lost.
- **Email-driven account flows** — sign-up email verification and password reset via time-limited tokens; graceful degradation when SMTP is not configured (dev-friendly).
- **Role-based access control.** Project-level roles (Owner, Researcher, Viewer) control who can edit, export, or manage team members.

### Collaboration

- **Projects** to isolate research groups, each with its own members and studies.
- **Concurrent editing** with auto-save, optimistic locking, and conflict resolution.
- **Invitation system** via email, or shareable link when SMTP is not configured.

---

## Quick start

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Node.js](https://nodejs.org/) v24+
- PostgreSQL 15+ (running locally or reachable by URL)

### From zero

```bash
# 1. Clone and enter
git clone https://github.com/jvastenaekels/qualis.git
cd qualis

# 2. Configure environment
cp .env.example .env
# Edit .env to set:
#   - DATABASE_URL  (your local Postgres connection string)
#   - SECRET_KEY    (generate: python -c 'import secrets; print(secrets.token_urlsafe(48))')
#   - IP_HASH_SALT  (same generation as SECRET_KEY)
#   - ENVIRONMENT=development  (enables tutorial / E2E test routes)

# 3. Install dependencies (Python via uv, Node via npm)
make install

# 4. Create the database schema
make migrate

# 5. Initialize the database (creates an admin user from ADMIN_EMAIL/PASSWORD)
cd backend && uv run python init_db.py && cd ..

# 6. (Optional) Seed an example study to explore the participant flow
cd backend && uv run python seed.py data/example-study.json && cd ..

# 7. Run the app (two terminals)
make run-backend     # Terminal 1: FastAPI on :8000
make run-frontend    # Terminal 2: Vite dev server on :5173
```

Visit [http://localhost:5173](http://localhost:5173). Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env`.

If you seeded the example study (step 6), you can also visit `http://localhost:5173/remote-work-perspectives` to walk the participant flow.

### Verifying your setup

```bash
# Run the full CI pipeline locally (lint + type check + test + build, ~3 min)
make ci

# Or run only the tests
make test
```

### Docker alternative

A `docker-compose.yml` is provided for a self-contained Postgres + app stack. See [`docs/guides/deployment.md`](docs/guides/deployment.md) for the supported invocation.

### Deploy

Qualis deploys as a single application (FastAPI serves the built React frontend). See the [Deployment Guide](docs/guides/deployment.md) for Scalingo, Render, Heroku, and Docker instructions.

---

## Documentation

Organized using the [Diataxis framework](https://diataxis.fr/). See the [full index](docs/README.md).

| | |
| :--- | :--- |
| **[Tutorials](docs/tutorials/)** | [Your First Study](docs/tutorials/your-first-study.md) &middot; [Collecting Responses](docs/tutorials/collecting-responses.md) &middot; [Analyzing — Foundations](docs/tutorials/analyzing-results-foundations.md) &middot; [Analyzing — Refinement](docs/tutorials/analyzing-results-refinement.md) &middot; [Development Workflow](docs/contributing/development.md) |
| **[Guides](docs/guides/)** | [Conducting Studies](docs/guides/conducting-studies.md) &middot; [Data Export](docs/guides/data-export.md) &middot; [Deployment](docs/guides/deployment.md) &middot; [S3 Audio Setup](docs/guides/s3-setup.md) |
| **[Reference](docs/reference/)** | [API](docs/reference/api.md) &middot; [Configuration](docs/reference/configuration.md) &middot; [Admin Dashboard](docs/reference/admin-dashboard.md) &middot; [Components](docs/reference/components.md) |
| **[Explanation](docs/explanation/)** | [Architecture](docs/explanation/architecture.md) &middot; [Q-Methodology](docs/explanation/q-methodology.md) &middot; [Mobile UX Decisions](docs/explanation/design-decisions/mobile-ux.md) |

---

## Tech stack

| Layer | Technologies |
| :---- | :----------- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, dnd-kit, Zustand, TanStack Query, react-i18next |
| **Backend** | Python 3.13, FastAPI, SQLAlchemy (async), Pydantic, Alembic |
| **Database** | PostgreSQL 15+ |
| **Storage** | S3-compatible (AWS, MinIO, Cloudflare R2) for audio recordings |
| **Tooling** | uv, npm, Biome, Ruff, Vitest, Playwright |

---

## Contributing

Contributions are welcome. Please read the guidelines before submitting a PR:

- [Coding Standards](docs/contributing/coding-standards.md)
- [Frontend Guidelines](docs/contributing/frontend-guidelines.md)
- [Backend Guidelines](docs/contributing/backend-guidelines.md)
- [Development Setup](docs/contributing/development.md)

---

## Citation

If you use Qualis in your research, please refer to the machine-readable metadata in [`CITATION.cff`](CITATION.cff) at the repository root (GitHub displays a "Cite this repository" button in the sidebar).

---

## Acknowledgments

**Author contributions:**

- **Julien Vastenaekels** (Université de Reims Champagne-Ardenne): software architecture, implementation, documentation, maintenance, methodological design, user-side testing, conceptual feedback on the platform's positioning for critical Q-methodology.
- **Clémence Dedinger** (Université de Reims Champagne-Ardenne): methodological design, user-side testing, conceptual feedback on the platform's positioning for critical Q-methodology. No direct code contribution.

**Methodological inspiration:** Qualis aims to be useful across Q-methodology traditions — from classical Brown-school analysis to more interpretive and critical orientations. The platform's design is informed in particular by readings of Stephenson (1953), Brown (1980), McKeown & Thomas (1988/2013), Watts & Stenner (2012), and, on the reflexive and participant-voice side, Stainton Rogers (1997), Stenner (2011), and Sneegas (2020). These works are inspirations rather than endorsements; the responsibility for any given design choice rests with Qualis.

**Open-source dependencies:** Qualis builds on FastAPI, React, SQLAlchemy, Pydantic, dnd-kit, react-i18next, Vite, Biome, Ruff, Playwright, and many other libraries. See `backend/pyproject.toml` and `frontend/package.json` for the full list.

---

## AI usage disclosure

Generative AI assistants were used during Qualis's development under human review. See [`AI_USAGE.md`](AI_USAGE.md) for the full disclosure.

---

## License

GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for details.
