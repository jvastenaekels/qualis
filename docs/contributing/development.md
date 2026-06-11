# Development Workflow

How to set up Qualis locally and the daily commands to keep the dev loop fast. Covers first-time setup (clone, install, database, dev servers) and the recurring tooling you reach for once you are running.

For the architectural overview, see [`../explanation/architecture.md`](../explanation/architecture.md).

---

## Prerequisites

- Git, Python 3.13+, Node.js 24+, PostgreSQL 15+, and a Unix-like environment (Linux, macOS, or WSL).

If PostgreSQL is not yet installed:

- **macOS:** `brew install postgresql@15 && brew services start postgresql@15`
- **Debian/Ubuntu:** `sudo apt install postgresql-15 && sudo service postgresql start`
- **Windows:** Use [Postgres.app](https://postgresapp.com/) under WSL, or the [official installer](https://www.postgresql.org/download/windows/).

---

## First-time setup

### Clone

```bash
git clone https://github.com/jvastenaekels/qualis.git
cd qualis
```

The repository is a monorepo:

```
qualis/
  backend/        # FastAPI application (Python)
  frontend/       # React SPA (TypeScript)
  docs/           # Documentation
  Makefile        # Common commands
```

### Install dependencies

```bash
make install
```

This runs `cd backend && uv sync` (Python deps into `backend/.venv/`) and `cd frontend && npm ci`. If `uv` is not installed: `curl -LsSf https://astral.sh/uv/install.sh | sh`.

### Set up the database

```bash
psql -U postgres
# In the psql shell:
CREATE DATABASE qualis_dev;
CREATE USER qualis_user WITH PASSWORD 'qualis_pass';
GRANT ALL PRIVILEGES ON DATABASE qualis_dev TO qualis_user;
\q
```

### Configure environment variables

```bash
cp .env.example .env
```

Minimum local-dev variables:

```bash
DATABASE_URL=postgresql+asyncpg://qualis_user:qualis_pass@localhost:5432/qualis_dev
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
IP_HASH_SALT=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
ENVIRONMENT=development
ACCESS_TOKEN_EXPIRE_MINUTES=480
FRONTEND_URL=http://localhost:5173
```

For the full set of variables and what they do, see [`../reference/configuration.md#environment--app-settings`](../reference/configuration.md#environment--app-settings).

### Run migrations

```bash
make migrate
```

Applies the Alembic chain to the empty database.

### Bootstrap an admin account

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then:

```bash
cd backend && uv run python init_db.py && cd ..
```

### (Optional) Seed an example study

```bash
cd backend && uv run python seed.py data/example-study.json && cd ..
```

After seeding, you can walk the participant flow at <http://localhost:5173/study/hemp-bioeconomy-futures>.

### Run the dev servers

Two terminals:

```bash
make run-backend     # FastAPI on :8000, hot-reload
make run-frontend    # Vite on :5173, HMR
```

Verify: <http://localhost:8000/docs> (Swagger) and <http://localhost:5173>. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Verify the dev loop

Edit a visible string in `frontend/src/components/admin/AdminDashboard.tsx`, save, watch the browser update via HMR. Revert.

---

## Pre-commit hooks

Install the hooks so lint, types, and complexity checks run before every commit:

```bash
pre-commit install

# Optional: run on the whole repo
pre-commit run --all-files
```

## Make targets

| Scope | Command | Purpose |
| ----- | ------- | ------- |
| All | `make install` | Install Python (`uv sync`) and Node (`npm ci`) dependencies. |
| All | `make lint` | Ruff + Biome. |
| All | `make check` | Type checks (mypy, tsc), security (bandit), dead-code (vulture, deptry), API sync, i18n parity. |
| All | `make test` | pytest + Vitest. |
| Inner loop | `make ci-fast` | Lint + types + unit tests (~30–90 s). Use between every change. |
| Pre-push | `make ci` | Full local CI (lint + check + test + build, ~3–5 min). |
| Full | `make ci-full` | `make ci` + DB reset + Playwright E2E (~10–15 min). |
| API | `make generate-api` | Regenerate the frontend OpenAPI client. |
| API | `make check-api` | Verify the committed client matches the backend. |
| E2E | `make e2e` | Playwright tests only. |

## API client synchronisation

Any change to backend routes or Pydantic schemas requires a client regeneration:

1. Run `make generate-api`.
2. Commit the updated `frontend/src/api/generated.ts`.
3. CI runs `make check-api` and fails if the client is out of sync.

## Architecture checks

Two architecture fitness functions run in CI ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)), not via `make check`:

- **Backend** — `import-linter` (`uv run lint-imports`) enforces `routers` → `services` → `schemas` → `models`. Config: `[tool.importlinter]` in `backend/pyproject.toml`.
- **Frontend** — `dependency-cruiser` (`npm run lint:architecture`) rejects circular dependencies and orphan files. Config: `frontend/.dependency-cruiser.cjs`.

## Database maintenance

| Command | Purpose |
| ------- | ------- |
| `make migrate` | Apply pending Alembic migrations (`alembic upgrade head`). |
| `make migration-new` | Generate a new revision after editing models. **Always review** — auto-generation against an out-of-sync DB will include unrelated tables. |
| `make db-reset` | Drop and recreate all tables. **Destroys local data.** |
| `cd backend && uv run python seed.py data/example-study.json` | Update or create a study from a JSON definition. Backend must be running. |

For the migration chain and conventions, see the "Database Migrations" section in [`CLAUDE.md`](../../CLAUDE.md).

## Code map

### Backend

| Path | Description |
| ---- | ----------- |
| `app/main.py` | FastAPI application entry point |
| `app/models/` | SQLAlchemy models, one module per subdomain (user, project, study, participant, recruitment, concourse, analysis, memo) |
| `app/schemas/` | Pydantic request/response models, one module per subdomain |
| `app/routers/` | API route handlers |
| `app/routers/admin/` | Admin API routes (studies, projects, exports, analysis, memos) |
| `app/services/` | Business logic services |
| `app/core/config.py` | Application configuration |
| `db_migrations/` | Alembic migration scripts; `script_location` set in `alembic.ini` |
| `tests/` | pytest test suite |

### Frontend

| Path | Description |
| ---- | ----------- |
| `src/pages/` | Page-level components (one per route) |
| `src/pages/admin/` | Researcher dashboard pages |
| `src/components/admin/` | Reusable admin UI components |
| `src/components/admin/analysis/` | Analysis result visualizations |
| `src/store/` | Zustand state management stores |
| `src/api/` | Generated API client (Orval) |
| `public/locales/` | i18n translation files (one dir per locale; see `SUPPORTED_LANGUAGES` constant) |

## Common troubleshooting

| Symptom | Fix |
| ------- | --- |
| "Database connection refused" | Verify PostgreSQL is running and `DATABASE_URL` in `.env` is correct. |
| "Module not found" (Python) | Use the venv via `uv run …` rather than the system Python. |
| Frontend build errors after `git pull` | `cd frontend && rm -rf node_modules && npm install`. |
| Migration errors | `make db-reset` (destroys local data) and re-run `make migrate`. |

## Releases

Versioning is automated via [release-please](https://github.com/googleapis/release-please) using **Conventional Commits**. Every push to `main` is parsed: when there is at least one release-worthy commit, the workflow opens (or updates) a long-lived **release PR** that bumps the version everywhere it lives and writes a `CHANGELOG.md` entry. Merging the release PR creates the git tag and the GitHub release.

### Bump rules (v0.x)

While the project is below 1.0, bumps are deliberately conservative:

| Commit type | Version effect |
| ----------- | -------------- |
| `fix:` | patch (`0.1.0 → 0.1.1`) |
| `feat:` | patch (`0.1.0 → 0.1.1`) |
| `feat!:` or `BREAKING CHANGE:` footer | minor (`0.1.0 → 0.2.0`) |
| `docs:`, `test:`, `build:`, `ci:`, `chore:` | no bump (still appears in CHANGELOG when not hidden) |

A 1.0.0 cut is a manual decision (release-please can be triggered with a `Release-As: 1.0.0` commit footer when you want to make it).

### Files release-please bumps

The version lives in four places; release-please updates all of them in the release PR:

- `backend/pyproject.toml` (`[project] version`)
- `frontend/package.json` (`version`)
- `CITATION.cff` (`version` field, marked with `# x-release-please-version`)
- `.release-please-manifest.json`

`CITATION.cff`'s `date-released` is **not** auto-updated — the release PR's date is unknown when the PR is opened. Update it by hand in the release PR before merging, so the citation stays in sync with the GitHub release date.

### Citable DOIs (Zenodo)

To mint a DOI for each tagged release, enable the GitHub repository in your Zenodo account ([https://zenodo.org/account/settings/github/](https://zenodo.org/account/settings/github/)). Zenodo will then archive every new GitHub Release automatically and mint both a version-specific DOI and a "concept" DOI that always resolves to the latest version. Add the concept DOI to `CITATION.cff` (`doi:` field) once issued.
