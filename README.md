<p align="center">
  <img src="docs/assets/qualis-logo.png" alt="Qualis" width="180" />
</p>

# Qualis

**Open-source platform for Q-methodology research.**

Design studies, collect Q-sorts, and run factor analysis in the browser. Participants can use common phones, tablets, and desktops without installing apps or plugins; self-hosted deployments keep research data on your chosen server.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/jvastenaekels/qualis/actions/workflows/ci.yml/badge.svg)](https://github.com/jvastenaekels/qualis/actions/workflows/ci.yml)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.19985835.svg)](https://doi.org/10.5281/zenodo.19985835)

> **First time here?** [Start Qualis locally with Docker](#quick-start-docker).
> The guided demo takes three commands and opens at `http://localhost:3000`.

---

## Statement of need

Q-methodology, introduced by Stephenson (1953) as a way of studying subjectivity through rank-ordered statements, is used across the social sciences and in applied fields including health, sustainability, education, and public policy. A growing share of recent work extends a reflexive tradition that foregrounds transparency of analytical choices, reflexivity, and the integration of participant voice into interpretation (Stainton Rogers 1997; Stenner 2011; Watts & Stenner 2012; Sneegas 2020).

The studies this orientation invites tend to share a few practical needs:

- running in several languages;
- reaching participants across phones and computers;
- building and reusing the pool of candidate statements over time, with the curatorial trail kept visible;
- tracking how recruitment is unfolding without leaving the platform;
- keeping what participants say about their sort attached to the analysis;
- making the analytical choices open to discussion and revision by a research team.

The open-source and freely available tools most Q researchers reach for each cover part of this workflow well — browser-based collection, desktop factor analysis, format conversion — but sit in separate systems: design, collection, analysis, interpretation, privacy operations, and export end up scattered across tools, and the research record has to be reassembled at each import and export boundary, where the audit trail can weaken. A few hosted commercial platforms (Q Method Software / Qsortware, and the now-discontinued Q-Assessor) do integrate collection and analysis in one place, but they are closed-source and vendor-hosted: the data leaves the institution's control, the analytical internals cannot be inspected, and — as Q-Assessor's 2024 shutdown shows — a study's tooling can disappear with the vendor.

Qualis's central design claim is **continuity**: statements, translations, recruitment links, Q-sorts, participant responses, analytical memos, consent and withdrawal events, and export files stay linked as research objects in one self-hosted project, rather than moving between separate tools. The platform implements this through a project-scoped concourse where candidate statements are curated, versioned, and reused across studies; visual study design with sorting grids and post-sort surveys; mobile-first recruitment and data collection with funnel monitoring; built-in factor analysis; collaborative interpretation; and export to PQMethod, R, and Ken-Q formats. Researchers can use Qualis as a data-collection frontend feeding their preferred analysis tool, or as a complete platform — the export bridges to established Q-analytic tools stay open either way. What sets Qualis apart from the integrated commercial platforms is that this continuity is open-source and self-hostable, keeping data and analytical choices under the researcher's control, and that it adds reflexive-workflow affordances — audio post-sorts, shared analytical memos, and a versioned reusable concourse with item-level discussion — that none of the other Q tools surveyed here, open or commercial, provide.

The choices behind each analytical step are visible and adjustable. Multiple researchers can work on the same project, with collaborative memos for analytical reflexivity, optional audio post-sorts that travel with the analysis, and a voices panel that keeps participant material adjacent to factor interpretation.

Data ownership stays with the researcher, and Qualis can run on institutional infrastructure to support the GDPR-aware consent, withdrawal, and data-residency practices common in European Q research. These are technical safeguards and operational paths; compliance remains a matter for each institution's own ethics and legal process.

---

## Comparison with existing tools

| Capability | HTMLQ | Quince (Banasick) | PQMethod | Ken-Q Analysis | KADE (Banasick 2019) | qmethod (R, Zabala 2014) | Q-Assessor\* | Qsortware\* | Qualis |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Browser-based data collection | Yes | Yes | No | No | No | No | Yes | Yes | **Yes** |
| Documented mobile & tablet support | Tablet | Yes | No | — | No | N/A | — | Yes | **Yes** |
| Built-in factor analysis | No | No | Yes | Yes | Yes | Yes | Yes | Yes | **Yes** |
| Participant-facing multi-language studies | No | No | No | No | No | N/A | — | — | **Yes** |
| Audio post-sort responses | No | No | No | No | No | No | — | — | **Yes** |
| Shared memos | No | No | No | No | No | No | — | — | **Yes** |
| Reusable concourse with versioning and item-level discussion | No | No | No | No | No | No | — | — | **Yes** |
| Recruitment tracking & funnels | No | No | No | No | No | No | Enrollment | — | **Yes** |
| Team collaboration (roles) | No | No | No | No | No | No | — | — | **Yes** |
| Interop with PQMethod / R / Ken-Q formats | CSV out | KADE / PQMethod | Native | Imports PQMethod | Imports CSV/PQMethod | Yes (import & export) | PQMethod export | Yes | **Yes** |
| Self-hosted | Yes | Frontend only | Desktop | Yes (static site) | Desktop | Yes (local R) | No | No | **Yes** |
| Open source | Yes (MIT) | Yes (GPL-3) | Yes (GPL) | Yes (GPL-3) | Yes (GPL-3) | Yes (GPL-2+) | No | No | **Yes (AGPL-3)** |

\*Q-Assessor and Qsortware are closed-source, vendor-hosted commercial platforms that, unlike the open-source tools above, integrate collection and analysis in one system — so the **Open source** and **Self-hosted** rows, not integration itself, mark Qualis's distinction from them. Q-Assessor ceased operation in September 2024; its column reflects its last-documented feature set.

*Capabilities were checked against each tool's published materials in June 2026. "—" indicates no documented support was found at the time of writing — for the closed commercial tools many internals are undocumented, so "—" is not a positive claim of absence. "Participant-facing multi-language studies" means statements, instructions, and consent are translated so a participant chooses a language and sorts in it, distinct from a localizable single-language interface (which Quince and the commercial tools offer). Sources: [Quince](https://github.com/shawnbanasick/quince), [Q Method Software / Qsortware](https://qmethodsoftware.com/), and the published materials of PQMethod, Ken-Q Analysis, KADE (Banasick), HTMLQ, and qmethod (Zabala). Corrections welcome via PR.*

---

## Key features

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
- **Two-factor authentication** — TOTP (authenticator app) or email-OTP as a fallback channel; self-serve recovery flow to disable 2FA when the authenticator is lost.
- **Email-driven account flows** — sign-up email verification and password reset via time-limited tokens; graceful degradation when SMTP is not configured (dev-friendly).
- **Role-based access control.** Project-level roles (Owner, Member, Viewer) control who can edit, export, or manage team members.

### Collaboration

- **Projects** to isolate research groups, each with its own members and studies.
- **Shared project access** for research teams, with role-based permissions for editing, exports, and member management.
- **Invitation system** via email, or shareable link when SMTP is not configured.

---

## Quick start

### Quick start (Docker)

This is the recommended path for evaluation and first-time use. It starts PostgreSQL, the backend, and the built frontend with development demo credentials.

> The first `make demo-up` **builds the backend and frontend images from source** (no pre-built image is pulled), so the initial run compiles the stack and may take a few minutes; subsequent runs reuse the cached layers. Qualis is self-hosted by design — there is no third-party-hosted instance, which is the point: participant data stays on infrastructure you control.

Prerequisites:

- Git
- Docker with the `docker compose` plugin
- GNU Make and `curl` (included by default on most Linux/macOS systems; use WSL on Windows)

```bash
git clone https://github.com/jvastenaekels/qualis.git
cd qualis
```

Start the application:

```bash
make demo-up
```

**Expected result:** after the images are built and the services become healthy,
the command ends with `Qualis services are running` and tells you what to run
next. The first build can take several minutes; later starts reuse the images.

Load the guided example:

```bash
make demo-seed
```

**Expected result:** the final lines say that the Bioeconomy Futures demo data
is ready and point you to the smoke test. This step reuses the Python environment
already built into the backend image and does not install development tools.

Verify the complete path:

```bash
make demo-smoke
```

**Expected result:** `Qualis demo is ready`, followed by the login URL and demo
credentials. If any check fails, `curl` prints an error and Make stops without
printing the success message.

Open [http://localhost:3000/login](http://localhost:3000/login) and log in with:

| Field | Value |
| ----- | ----- |
| Email | `admin@example.com` |
| Password | `admin123` |

`make demo-seed` loads the **Bioeconomy Futures** example end to end: the study design, a curated concourse (accepted / rejected / proposed candidate statements, with edit history and discussion comments), and 18 synthetic Q-sorts with pre-sort and post-sort answers — including a few spoken audio comments — that you can analyse straight away. After seeding, the example participant flow is available at [http://localhost:3000/study/bioeconomy-futures](http://localhost:3000/study/bioeconomy-futures).

For a useful first tour after login:

1. Open **Bioeconomy Futures**, then **Analysis**, to inspect results that are
   already populated.
2. Open the participant link above in a private window to experience the study
   from the respondent side.
3. Follow [Your First Study](docs/tutorials/your-first-study.md) to build and
   activate a small study of your own.

The Docker stack includes a MinIO object store for the audio comments (console at [http://localhost:9001](http://localhost:9001), login `qualis` / `qualis-demo-secret`).

#### Quick-start troubleshooting

| What you see | What to do |
| ------------ | ---------- |
| `Cannot connect to the Docker daemon` or `docker: command not found` | Start Docker Desktop or the Docker service, then confirm `docker compose version` works before retrying. |
| `port is already allocated` for `3000`, `9000`, or `9001` | Stop the program or container using that port. `docker compose ps` shows Qualis containers; `lsof -i :3000` (replace the port as needed) shows other local processes on Linux/macOS. Then run `make demo-up` again. |
| The first build appears stuck while downloading or compiling | Leave it running: the initial source build can take several minutes on a slow connection. If it was interrupted, rerun `make demo-up`; Docker reuses completed layers. |

Stop the stack with:

```bash
make demo-down
```

### Local development setup

Use this path when you want hot reload, local tests, or direct backend/frontend development.

#### Prerequisites

- Git and GNU Make
- Python 3.13+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Node.js](https://nodejs.org/) v24+
- PostgreSQL 15+ (running locally or reachable by URL)

#### From zero

```bash
# 1. Clone and enter
git clone https://github.com/jvastenaekels/qualis.git
cd qualis

# 2. Create the local database and make the application role its owner
psql -U postgres
# In psql:
CREATE USER qualis_user WITH PASSWORD 'qualis_pass';
CREATE DATABASE qualis_dev OWNER qualis_user;
\q

# 3. Configure environment
cp .env.example .env
# Edit .env to set:
#   - DATABASE_URL=postgresql+asyncpg://qualis_user:qualis_pass@localhost:5432/qualis_dev
#   - SECRET_KEY    (generate: python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
#   - IP_HASH_SALT  (same generation as SECRET_KEY)
#   - ADMIN_EMAIL and ADMIN_PASSWORD (your first local admin account)
#   - ENVIRONMENT=development  (enables tutorial / E2E test routes)

# 4. Install dependencies (Python via uv, Node via npm lockfile)
make install

# 5. Apply database migrations
make migrate

# 6. Initialize the database (creates an admin user from ADMIN_EMAIL/PASSWORD)
cd backend && uv run python init_db.py && cd ..

# 7. Run the app (two terminals)
make run-backend     # Terminal 1: FastAPI on :8000
make run-frontend    # Terminal 2: Vite dev server on :5173

# 8. Optional: seed an example study after the backend is running
cd backend && uv run python seed.py data/example-study.json && cd ..
```

Visit [http://localhost:5173](http://localhost:5173). Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env`.

If you seeded the example study, you can also visit `http://localhost:5173/study/bioeconomy-futures` to walk the participant flow. (For the full demo — concourse plus filled Q-sorts — run `uv run python seed_demo.py` from `backend/` instead, with the backend running.)

### Verifying your setup

```bash
# Run the full CI pipeline locally (lint + type check + test + build, ~3 min)
make ci

# Or run only the tests
make test
```

### Reproducing the analytical validation (Lipset 1963)

Qualis ships a second bundled example that pins its factor-analysis engine to
an external, citable reference: the openly published Lipset (1963) "Value
Patterns of Democracy" Q dataset (33 statements, 9 Q-sorts), redistributed with
the R [`qmethod`](https://cran.r-project.org/package=qmethod) package under
GPL-2-or-later. No R is required to reproduce the check.

```bash
make demo-up
make demo-lipset       # seeds the `lipset-democracy` study
make validate-lipset   # exit 0 = Qualis matches the qmethod reference
```

`make validate-lipset` runs a PCA / Varimax / auto-flagging three-factor
analysis and asserts an identical flag assignment for all nine Q-sorts and
rotated loadings agreeing with the frozen `qmethod` reference. See
[`validation/lipset/README.md`](validation/lipset/README.md) for details and how
to regenerate the reference from R.

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

- **Julien Vastenaekels** (Université de Reims Champagne-Ardenne): software architecture, implementation, documentation, maintenance, methodological design, user-side testing, conceptual feedback on the platform's methodological positioning across Q-methodology traditions.
- **Clémence Dedinger** (Université de Reims Champagne-Ardenne): methodological design, user-side testing, conceptual feedback on the platform's methodological positioning across Q-methodology traditions.

**Methodological inspiration:** Qualis aims to be useful across Q-methodology traditions — from classical Brown-school analysis to more interpretive and reflexive orientations. The platform's design is informed in particular by readings of Stephenson (1953), Brown (1980), McKeown & Thomas (1988/2013), Watts & Stenner (2012), and, on the reflexive and participant-voice side, Stainton Rogers (1997), Stenner (2011), and Sneegas (2020). These works are inspirations rather than endorsements; the responsibility for any given design choice rests with Qualis.

**Open-source dependencies:** Qualis builds on FastAPI, React, SQLAlchemy, Pydantic, dnd-kit, react-i18next, Vite, Biome, Ruff, Playwright, and many other libraries. See `backend/pyproject.toml` and `frontend/package.json` for the full list.

---

## AI usage disclosure

Generative AI assistants were used during Qualis's development under human review. See [`AI_USAGE.md`](AI_USAGE.md) for the full disclosure.

---

## License

GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for details.
