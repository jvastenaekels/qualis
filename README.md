# Libre-Q

**Open-source platform for Q-methodology research.**

Design studies, collect Q-sorts, and run factor analysis from the browser. Supports any device, requires no software installation, and keeps data on your own server.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![CI](https://github.com/jvastenaekels/libre-q/actions/workflows/ci.yml/badge.svg)](https://github.com/jvastenaekels/libre-q/actions/workflows/ci.yml)

<!-- TODO: Add hero screenshot of the Q-sort grid interface, e.g. docs/assets/hero-qsort.png -->
<!-- Suggested capture: a participant's mid-sort view on a tablet, statements visible, grid partially populated, language switcher visible. -->

---

## Statement of need

Q-methodology — Stephenson's (1953) approach to studying subjectivity by having participants rank-order a set of statements — is widely used in environmental governance, health, education, and political ecology. Its uptake in the past decade has expanded into critical research traditions that emphasise reflexivity, transparency of analytical choices, situatedness of subjectivities, and integration of participant voice (Stainton Rogers 1997; Stenner 2011; Watts & Stenner 2012; Sneegas 2020). This expansion has run into a tooling gap.

**Existing tools force a tradeoff** between data-collection ergonomics and analytical depth:

- **PQMethod** (Schmolck) and the **R `qmethod` package** (Zabala 2014) provide rigorous factor analysis but no participant-facing UI; researchers must collect Q-sorts on paper or with a separate tool, then transcribe.
- **FlashQ** and **HTMLQ** offer browser-based data collection but no analysis capability and limited mobile support.
- **KADE** (Banasick 2019) is a polished open-source desktop analysis tool but, like PQMethod, leaves the data-collection problem to the researcher.
- **Ken-Q Analysis** (the older online tool) bundles collection and analysis but is not self-hosted, has limited mobile support, and is not open source — researchers cannot inspect or modify the analytical procedures.

None of these tools support multi-language studies natively, integrate post-sort participant audio responses with the analysis, or expose the analytical choices in a way that supports critical Q-methodology's transparency requirements.

**Libre-Q fills this gap as a single-platform, browser-based, multilingual, self-hosted, and open-source tool that integrates the full Q-methodology workflow** — study design, mobile-first participant recruitment and data collection, factor analysis, and export to the major analytical formats — while keeping the methodological choices visible and editable by the researcher. It is targeted at research groups practising critical Q-methodology, but it is usable for classical Q-methodology workflows as well.

The platform is intentionally self-hosted: data ownership remains with the researcher, and Libre-Q can be run on institutional infrastructure to satisfy GDPR data-residency requirements common in European Q research.

---

## Comparison with existing tools

| Capability | FlashQ / HTMLQ | PQMethod | Ken-Q (online) | KADE (Banasick 2019) | qmethod (R, Zabala 2014) | Libre-Q |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Browser-based data collection | Yes | No | Yes | No | No | **Yes** |
| Mobile & tablet support | Limited | No | Limited | No | N/A | **Yes** |
| Built-in factor analysis | No | Yes | Yes | Yes | Yes | **Yes** |
| Enforced forced distribution | Partial | N/A | N/A | N/A | N/A | **Yes** |
| Multi-language studies | No | No | No | No | N/A | **Yes** |
| Audio post-sort responses | No | No | No | No | No | **Yes** |
| Recruitment tracking & funnels | No | No | No | No | No | **Yes** |
| Team collaboration (roles) | No | No | No | No | No | **Yes** |
| Export to PQMethod / R / Ken-Q | N/A | N/A | N/A | Yes | N/A | **Yes** |
| Self-hosted / data ownership | Partial | Desktop | No | Desktop | Yes (local R) | **Yes** |
| Open source | Yes | No | No | Yes | Yes | **Yes** |

*"N/A" indicates the capability does not apply to the tool category (e.g., R packages have no participant-facing UI, so "mobile support" is not applicable).*

---

## Key Features

### Participant Experience

- **Clean, readable layout.** Simple interface that lets participants focus on the sorting task without unnecessary distractions.
- **Works on any device.** Smartphone, tablet, or desktop — participants open a link and start sorting. No apps or plugins required.
- **Mobile-first drag-and-drop.** Touch-optimized sorting with auto-pan, dwell-zoom, and edge scrolling, so participants without desktop access are not excluded.
- **Multi-language support.** Translate statements, instructions, consent forms, and UI labels. Participants see the study in their preferred language.


### Study Design

- **Visual grid designer** with symmetry lock, capacity validation, and configurable score ranges.
- **Survey builder** with 9 question types (text, number, select, radio, checkbox, date, email, textarea, audio), conditional visibility, reordering, and per-question validation.
- **Markdown-formatted content** for instructions, consent forms, and condition of instruction.
- **Import/Export configurations** to create templates, back up designs, or clone studies across projects.
- **Pilot mode** to run through the full participant experience without persisting any data.

### Analysis

- **Built-in factor analysis** — run initial exploration without exporting to external software.
- **PCA or Centroid extraction** (Brown 1980) with Varimax rotation and Kaiser normalization.
- **Scree plot** with Kaiser criterion reference line for factor selection.
- **Auto-flagging** using significance and dominance thresholds, or manual flagging for full researcher control.
- **Distinguishing & consensus statements** classified via Standard Error of Differences at multiple significance levels (p < 0.05, 0.01, 0.001).
- **Factor arrays, z-scores, composite reliability** (Spearman-Brown), and factor correlation matrix.

### Data Collection & Monitoring

- **Recruitment links** — public, single-use, or capacity-limited — with QR code generation and funnel tracking (started vs. completed).
- **Monitoring dashboard** with submission timelines, device breakdowns, and completion rates.
- **Session review** with grid reconstruction, survey responses, and audio playback.
- **Test run management** to separate pilot data from real submissions.
- **Discard with reason** to flag problematic responses while preserving the audit trail.

### Export & Interoperability

| Format | Description |
| :----- | :---------- |
| **CSV** | Wide-format, one row per participant. Compatible with Excel, SPSS, Stata. |
| **PQMethod** | `.dat` + `.sta` files ready for PQMethod and Ken-Q Analysis. |
| **Ken-Q JSON** | Native format for Ken-Q web analysis. |
| **R-Kit** | CSV + auto-generated R script using the `qmethod` package. |
| **Research Package** | ZIP with all formats, codebook, and metadata for archiving. |

### Privacy & Security

- **Self-hosted.** Data stays on your server with no third-party analytics or tracking.
- **IP address hashing.** Participant IPs are SHA-256 hashed with a configurable salt before storage — never stored in plaintext.
- **Consent audit trail.** Each participant's consent is recorded with a hash of the consent version they agreed to.
- **Security headers** (HSTS, CSP, X-Frame-Options) and bcrypt password hashing.
- **Two-factor authentication** (TOTP) for researcher accounts.
- **Role-based access control.** Project-level roles (Owner, Researcher, Viewer) control who can edit, export, or manage team members.

### Collaboration

- **Projects** to isolate research groups — each with its own members and studies.
- **Concurrent editing** with auto-save, optimistic locking, and conflict resolution.
- **Invitation system** via email, or shareable link when SMTP is not configured.

---

## Quick Start

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Node.js](https://nodejs.org/) v24+
- PostgreSQL 15+ (running locally or reachable by URL)

### From zero

```bash
# 1. Clone and enter
git clone https://github.com/jvastenaekels/libre-q.git
cd libre-q

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
make run-backend     # Terminal 1 — FastAPI on :8000
make run-frontend    # Terminal 2 — Vite dev server on :5173
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

Contributions are welcome. Please read the guidelines before submitting a PR:

- [Coding Standards](docs/contributing/coding-standards.md)
- [Frontend Guidelines](docs/contributing/frontend-guidelines.md)
- [Backend Guidelines](docs/contributing/backend-guidelines.md)
- [Development Setup](docs/guides/contributing/development.md)

---

## Citation

If you use Libre-Q in your research, please cite both the software and the accompanying paper. Machine-readable metadata is in [`CITATION.cff`](CITATION.cff) at the repository root (GitHub displays a "Cite this repository" button in the sidebar).

**Software (Zenodo archive):**

> Vastenaekels, J., & Dedinger, C. (2026). *Libre-Q: An open-source platform for Q-methodology research* (Version 0.1.0) [Software]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

(DOI assigned automatically by Zenodo at the first tagged release; will be filled in here once available.)

**Paper (SoftwareX):**

> Vastenaekels, J., & Dedinger, C. (2026). Libre-Q: An open-source platform for Q-methodology research. *SoftwareX*. https://doi.org/10.1016/j.softx.2026.XXXXXX

(DOI assigned by Elsevier on acceptance.)

---

## Acknowledgments

**Author contributions:**

- **Julien Vastenaekels** — software architecture, implementation, documentation, maintenance, paper co-author.
- **Clémence Dedinger** (Université de Reims Champagne-Ardenne) — methodological design, user-side testing, conceptual feedback on the platform's positioning for critical Q-methodology, paper co-author. No direct code contribution.

**Methodological grounding:** Libre-Q's design draws on the critical Q-methodology literature, in particular Stainton Rogers (1997), Stenner (2011), Watts & Stenner (2012), and Sneegas (2020).

**Tools and dependencies:** Libre-Q would not exist without the open-source ecosystem it builds on — FastAPI, React, SQLAlchemy, Pydantic, dnd-kit, react-i18next, Vite, Biome, Ruff, Playwright, and many others. See `backend/pyproject.toml` and `frontend/package.json` for the full list.

---

## AI usage disclosure

In the spirit of [Elsevier's policy on AI tool use in scientific software](https://www.elsevier.com/about/policies/publishing-ethics) and the [JOSS reviewer guidelines](https://joss.readthedocs.io/en/latest/review_criteria.html), the following disclosure applies to Libre-Q's development:

Generative AI assistants (primarily Anthropic Claude, with occasional cross-checks via OpenAI Codex) were used during development and documentation:

- **Code generation and refactoring:** AI assistants drafted parts of the implementation (notably some boilerplate FastAPI routers, React components, and test scaffolding), which were then reviewed, edited, and integrated by the human author.
- **Documentation drafting:** README, tutorials, and inline documentation were partially drafted with AI assistance and edited for accuracy and tone.
- **Code review and audit:** A multi-axis pre-submission code audit was conducted with AI sub-agents (see `docs/audits/`); findings were reviewed and prioritised by the human author before remediation.

**Human responsibility:** All architectural decisions, methodological choices (extraction method, rotation, flagging logic), security-sensitive code paths, and the final published version are the responsibility of the listed authors. AI-generated content was reviewed and edited prior to inclusion.

**Reproducibility:** This disclosure is also recorded in the SoftwareX submission letter and in the project's commit history (commits co-authored with `Claude Opus 4.7` and `Codex` markers in trailer lines).

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

Libre-Q is developed in the spirit of Open Science — providing a transparent, reproducible, and accessible tool for subjectivity research where data ownership remains with the researcher.
