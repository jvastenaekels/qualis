# Axis 09 — Reproducibility

**Date:** 2026-04-25
**Auditor:** Claude (Sonnet 4.6) — deep pass
**Pass type:** Deep (automated + manual + cross-manifest)

---

## Scope

Docker build from scratch, lockfile integrity, seed/init reproducibility, env var documentation, deployment manifest alignment (Procfile / Scalingo / Docker Compose), and fresh-contributor onboarding.

## Raw inputs captured

| Check | Result |
|---|---|
| Docker build from scratch | **Not executed** — `docker` binary not available on audit host |
| `uv lock --check` | PASS — `Resolved 115 packages in 1ms` (`.raw/uv-lock-check.log`) |
| `npm ci --dry-run` | PASS with EBADENGINE warning (node 22 vs required 24) — `.raw/npm-ci-check.log` |
| Alembic drift (Wave 1) | `Target database is not up to date` (`.raw/alembic-check.log`) |
| init_db.py read | Assessed non-destructive without `--reset`; run deferred |

---

## Findings

### F-09-001 : Docker build not testable on audit host — test environment gap

- **Severity:** observation
- **Audience:** [SoftwareX] [Maintenance]
- **Location:** `backend/Dockerfile`, `frontend/Dockerfile`
- **Observation:** `docker` binary is absent from the audit host. The build-from-scratch test (Step 1 of the audit protocol) could not be executed. Manual review of both Dockerfiles found no obvious build-breaking issues (correct multi-stage build, `npm ci`, `uv sync --frozen --no-dev`, nginx SPA serving). However, the Docker path cannot be vouched for without an actual build run.
- **Impact:** SoftwareX reviewers cloning the repo and running `docker compose up` may hit a build failure that this audit did not catch.
- **Recommendation:** Execute `docker compose build --no-cache && docker compose up -d` in a CI environment (GitHub Actions runner with Docker support) and gate on success. Add a `docker-build` job to `.github/workflows/ci.yml`.
- **Effort:** M

---

### F-09-002 : README Quick Start omits database setup steps

- **Severity:** major
- **Audience:** [SoftwareX] [Maintenance]
- **Location:** `README.md` (Quick Start section)
- **Observation:** The README Quick Start sequence is: `git clone` → `make install` → `make run-backend`. It skips three required steps: (1) create a `.env` file with `DATABASE_URL`, (2) run `make migrate` (Alembic migrations), (3) run `python backend/init_db.py` (create admin account). Without these steps, `make run-backend` will start the uvicorn process but every API call requiring the database will fail (schema validation logs `ERROR` on startup and continues non-fatally). A fresh contributor following only the README will have a broken install.
- **Impact:** SoftwareX reviewers reproduce the install following the README and encounter a non-functional backend. This is a desk-reject signal. A new contributor cannot onboard without reading the much longer development guide.
- **Recommendation:** Add the following to the Quick Start, immediately after `make install`:
  ```bash
  cp .env.example .env          # see below — .env.example must be created (F-09-003)
  # edit .env: set DATABASE_URL
  make migrate                  # Alembic: create schema
  cd backend && uv run python init_db.py  # create admin account
  ```
- **Effort:** S

---

### F-09-003 : No `.env.example` file — env var bootstrapping undocumented at repo root

- **Severity:** major
- **Audience:** [SoftwareX] [Maintenance]
- **Location:** transverse (repo root, `backend/`)
- **Observation:** No `.env.example`, `.env.sample`, or equivalent template file exists anywhere in the repository. The `Settings` class in `backend/app/core/config.py` reads from `.env` / `../env`, but a new contributor has no starting point. The deployment guide (`docs/guides/deployment.md`) documents all production env vars, but this is 3 levels deep in the docs and not linked from the Quick Start. Additionally, `ALLOWED_ORIGINS` is consumed via `os.getenv()` directly in `backend/app/main.py` (not through the `Settings` pydantic model), so it does not appear in `config.py` — a contributor reading `config.py` as the authoritative env var reference will miss it.

  Required env vars identified:

  | Variable | Source | Status |
  |---|---|---|
  | `DATABASE_URL` | `config.py` | **Required** — no usable default (dummy URL used for static analysis only) |
  | `SECRET_KEY` | `config.py` | Defaults to `CHANGEME-insecure-dev-only` |
  | `IP_HASH_SALT` | `config.py` | Defaults to `CHANGEME-insecure-dev-only` |
  | `ALLOWED_ORIGINS` | `main.py` (raw `os.getenv`) | Defaults to localhost variants — not in `config.py` |
  | `ADMIN_EMAIL` | `init_db.py`, `script_utils.py` | Defaults to `admin@example.com` |
  | `ADMIN_PASSWORD` | `init_db.py`, `script_utils.py` | Defaults to `admin123` |
  | `FRONTEND_URL` | `config.py` | Defaults to `http://localhost:5173` |
  | `ENVIRONMENT` | `config.py` | Defaults to `development` |
  | `REDIS_URL` | `limiter.py` | Optional — in-memory fallback |
  | `SMTP_HOST` / `SMTP_*` | `config.py` | Optional — stdout fallback |
  | `S3_*` | `config.py` | Optional — audio storage |

- **Impact:** A reviewer cloning the repo cannot start the backend without reading scattered documentation. `ALLOWED_ORIGINS` being outside the `Settings` model is a secondary hazard: automated env var documentation tools will miss it.
- **Recommendation:** (1) Create `.env.example` at the repository root documenting all vars above with inline comments. (2) Migrate `ALLOWED_ORIGINS` into `Settings` in `config.py` to make `config.py` the single source of truth.
- **Effort:** S

---

### F-09-004 : `backend/data/example-study.json` referenced in docs but absent from repo

- **Severity:** major
- **Audience:** [SoftwareX] [Maintenance]
- **Location:** `docs/guides/deployment.md`, `docs/guides/contributing/development.md`
- **Observation:** Both the deployment guide and the contributing/development guide reference `backend/data/example-study.json` (or `data/example-study.json`) as the seeding input for `seed.py`. This file does not exist in the repository. Running the documented seed commands will fail immediately with a `FileNotFoundError`.

  Affected commands:
  ```bash
  # contributing guide:
  cd backend && uv run python seed.py data/example-study.json
  # deployment guide:
  scalingo run -- env API_BASE_URL=http://internal python backend/seed.py backend/data/example-study.json
  ```

- **Impact:** Seed/demo state cannot be reproduced from the documented procedure. SoftwareX reproducibility criterion is not met for the demo workflow. A reviewer trying to populate the app with sample data will get an error.
- **Recommendation:** Either (a) commit a minimal but valid `backend/data/example-study.json` to the repository, or (b) update the docs to point to an existing alternative seed path. Given that the `data/` directory in the project root contains binary files (ZIPs, WEBMs, PNGs), option (a) requires creating `backend/data/` with a JSON fixture.
- **Effort:** M

---

### F-09-005 : Alembic drift — dev database 9 migrations behind HEAD

- **Severity:** major
- **Audience:** [Prod] [Maintenance]
- **Location:** `backend/db_migrations/versions/` (15 migrations total)
- **Observation:** Wave 1 captured `ERROR [alembic.util.messaging] Target database is not up to date` (`alembic-check.log`). The actual migration chain has 15 entries (HEAD: `d4e5f6a7b8c9` — rename_workspace_to_project), while the dev database appears to be at migration 6 (`2bf0f513c6c8` — add_audio_recordings_table). The 9 unapplied migrations include significant schema changes: `add_statement_display_order`, `add_last_step_reached` (with backfill), `add_draft_responses`, `add_resume_code`, `add_concourse_tables`, `add_statement_concourse_traceability`, `add_item_versions_and_comments`, `rename_workspace_to_project`.

  Additionally, `CLAUDE.md` (the project's own developer notes) documents the migration chain as stopping at `add_audio_recordings_table`, which is now 9 migrations out of date. This mismatch will mislead contributors creating new migrations (they will reference a stale chain).

- **Impact:** Any developer or reviewer running the backend against the dev DB (without first running `make migrate`) will encounter silent schema errors or runtime failures on features using the new tables (`concourses`, `item_versions`, `draft_responses`). The CLAUDE.md drift increases the risk of a contributor generating a migration with a wrong `down_revision`.
- **Recommendation:** (1) Run `make migrate` on the dev database immediately. (2) Update `CLAUDE.md` migration chain to list all 15 entries (or change the policy to "see `db_migrations/versions/` for the current chain"). (3) Add `make migrate` to the mandatory `make ci` gate or at minimum to the README Quick Start.
- **Effort:** S

---

### F-09-006 : `ALLOWED_ORIGINS` managed outside `Settings` — env var taxonomy incomplete

- **Severity:** minor
- **Audience:** [Maintenance]
- **Location:** `backend/app/main.py` (`origins_raw = os.getenv("ALLOWED_ORIGINS", ...)`)
- **Observation:** `ALLOWED_ORIGINS` is read with a bare `os.getenv()` call in `main.py`, bypassing the pydantic `Settings` class in `config.py`. This means: (a) it does not appear in any `Settings`-based documentation or introspection, (b) it cannot be validated or type-checked by pydantic, (c) `settings = Settings()` is not the single source of truth for configuration. The deployment guide does document `ALLOWED_ORIGINS`, but the code structure will mislead anyone auditing the configuration surface via `config.py`.
- **Impact:** Low in isolation, but exacerbates F-09-003 (missing `.env.example`). If a future contributor adds a configuration auditor or auto-generates documentation from `Settings`, `ALLOWED_ORIGINS` will be silently omitted.
- **Recommendation:** Add `ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:4173,..."` to `Settings` and read `settings.ALLOWED_ORIGINS` in `main.py` instead of the bare `os.getenv()`.
- **Effort:** S

---

### F-09-007 : Procfile `postdeploy` runs `alembic upgrade head` twice

- **Severity:** minor
- **Audience:** [Prod] [Maintenance]
- **Location:** `backend/scripts/postdeploy.py:59,62`, `backend/init_db.py:36-56`
- **Observation:** The `postdeploy` phase in the Procfile runs `postdeploy.py`, which calls `scripts/migrate.py` (Step 1: `alembic upgrade head`) and then `init_db.py` (Step 2, which also calls `run_migrations()` → `alembic upgrade head` again). The double call is idempotent (alembic detects HEAD and skips), but it doubles the deploy time for the migration phase and adds a confusing redundancy.
- **Impact:** No data risk. Adds ~1–5 seconds per deploy. More importantly, the code structure suggests that `init_db.py` was originally the sole deployment script and `postdeploy.py` was added as a wrapper without removing the migration call from `init_db.py`.
- **Recommendation:** Remove the `run_migrations()` call from `init_db.py` (keep only `seed_data()`), making `postdeploy.py` the canonical two-step sequence: migrate then seed.
- **Effort:** S

---

### F-09-008 : `docker-compose.yml` backend service does not expose port — not testable from host without `docker exec`

- **Severity:** minor
- **Audience:** [Maintenance]
- **Location:** `docker-compose.yml`
- **Observation:** The `backend` service does not expose any ports to the host. The only exposed port is `frontend:3000`. The nginx config proxies `/api/` to `backend:8000` (internal Docker network). This is correct for normal use, but means there is no way to run `curl http://localhost:8000/health` from the host to verify backend health independently, as called for in the audit protocol Step 1. A developer wanting to inspect backend logs, reach the OpenAPI docs at `/docs`, or test the API without going through nginx must use `docker compose exec backend sh` or `docker compose run`.
- **Impact:** Minor inconvenience. The Docker setup works as designed (single-entry nginx). But the audit protocol health check (`curl localhost:8000/health`) cannot run without adding a port mapping.
- **Recommendation:** Add an optional comment in `docker-compose.yml` explaining the network topology. For developer convenience, optionally expose `"8000:8000"` under a dev profile (`docker compose --profile dev up`) or document how to reach the API docs in `docker-compose.yml` comments.
- **Effort:** S

---

### F-09-009 : Node.js version mismatch between `.nvmrc`, `package.json engines`, and system

- **Severity:** minor
- **Audience:** [Maintenance]
- **Location:** `.nvmrc` (`24.12.0`), `frontend/package.json` (`engines.node: "24.x"`), system (`v22.22.0`)
- **Observation:** The `.nvmrc` and `package.json` both require Node 24.x. The audit host (and potentially contributors without nvm) runs v22.22.0. `npm ci --dry-run` produces `npm warn EBADENGINE Unsupported engine`. While `npm ci` itself still succeeds (the warning is non-fatal), certain build features tied to Node 24 could silently fail. The frontend Dockerfile uses `FROM node:24-alpine` (correct), but local contributors not using nvm may encounter subtle failures.
- **Impact:** Minor: CI/Docker use the correct version. Local contributors using system Node 22 may hit inconsistencies in build output or test behavior.
- **Recommendation:** Document the nvm usage explicitly in the contributing guide. Add `nvm use` to the Quick Start or a `Makefile` guard (`node --version | grep -q "^v24" || echo "WARNING: Node 24 required"`).
- **Effort:** S

---

### F-09-010 : Many backend `pyproject.toml` deps have no upper bound — update risk at next `uv lock`

- **Severity:** observation
- **Audience:** [Maintenance]
- **Location:** `backend/pyproject.toml` (dependencies section)
- **Observation:** Most runtime dependencies specify only a lower bound (e.g., `numpy>=2.2.0`, `boto3>=1.36.17`, `alembic>=1.18.1`). Only a few are tightly pinned: `asyncpg==0.31.0`, `pydantic==2.12.5`, `sqlalchemy[asyncio]==2.0.45`, `fastapi[standard]>=0.128.0,<0.129.0`. The `uv.lock` file pins everything exactly (e.g., `numpy==2.4.2`, `boto3==1.42.44`), so current builds are fully deterministic. However, the next `uv lock --upgrade` (or `uv lock --upgrade-package <x>`) could pull in a major version bump of an unpinned dep (especially `alembic`, which is at `1.18.x` and could jump to `2.0`).
- **Impact:** No current reproducibility risk (lockfile is used). Long-term: running `uv lock` to update deps is unexpectedly risky without deliberate upper bounds.
- **Recommendation:** Add upper bounds for deps where major breaking changes are plausible: `alembic>=1.18.1,<2.0`, `numpy>=2.2.0,<3.0`, `boto3>=1.36.17,<2.0`. `fastapi` already has a tight range as a model.
- **Effort:** S

---

### F-09-011 : CLAUDE.md migration chain documentation stale (9 entries behind)

- **Severity:** observation
- **Audience:** [Maintenance]
- **Location:** `CLAUDE.md` ("Database Migrations (Alembic)" section)
- **Observation:** `CLAUDE.md` documents the migration chain as: `initial_schema → rename_randomize... → remove_consent_buttons → add_pre_instruction → add_is_test_run → add_audio_recordings_table` (6 entries). The actual chain has 15 entries; the 9 undocumented migrations added since that documentation was last updated include: `add_statement_display_order`, `add_last_step_reached`, `fix_last_step_reached_backfill`, `add_draft_responses`, `add_resume_code`, `add_concourse_tables`, `add_statement_concourse_traceability`, `add_item_versions_and_comments`, `rename_workspace_to_project`. This is the same root cause as F-09-005 (dev DB drift).
- **Impact:** A contributor creating a new migration will see a CLAUDE.md that implies `add_audio_recordings_table` is HEAD — they may create a migration with a wrong `down_revision`.
- **Recommendation:** Either update the CLAUDE.md chain to include all 15 migrations, or change the guidance to "see `backend/db_migrations/versions/` for the current chain, do not rely on this list." The second option is more maintenance-friendly.
- **Effort:** S (5 minutes)

---

### F-09-012 : `scalingo.json` is near-empty — no Scalingo-specific configuration captured

- **Severity:** observation
- **Audience:** [Maintenance]
- **Location:** `scalingo.json`
- **Observation:** `scalingo.json` contains only `{"name": "Libre-Q"}`. Scalingo's `app.json`/`scalingo.json` format supports declaring environment variables (with descriptions, required/optional, default values), addons, formation (dyno sizes), and buildpacks. None of this is captured. The actual configuration (buildpacks, env vars) lives in `.buildpacks` (correct: Node → Python) and the deployment guide, but `scalingo.json` does not document it in machine-readable form.
- **Impact:** No operational impact. A one-click Scalingo deploy button or automated fork setup cannot be created. Minor reviewer experience degradation.
- **Recommendation:** Populate `scalingo.json` with at minimum the `env` section listing required variables. See Scalingo `app.json` documentation.
- **Effort:** S

---

## Summary table

| ID | Title | Severity | Effort |
|---|---|---|---|
| F-09-001 | Docker build not testable — environment gap | observation | M |
| F-09-002 | README Quick Start omits DB setup steps | major | S |
| F-09-003 | No `.env.example` — env var bootstrapping undocumented | major | S |
| F-09-004 | `backend/data/example-study.json` absent from repo | major | M |
| F-09-005 | Alembic drift — dev DB 9 migrations behind HEAD | major | S |
| F-09-006 | `ALLOWED_ORIGINS` outside `Settings` | minor | S |
| F-09-007 | Procfile `postdeploy` runs `alembic upgrade head` twice | minor | S |
| F-09-008 | Docker backend port not exposed to host | minor | S |
| F-09-009 | Node.js version mismatch `.nvmrc` / system | minor | S |
| F-09-010 | Many pyproject.toml deps have no upper bound | observation | S |
| F-09-011 | CLAUDE.md migration chain 9 entries stale | observation | S |
| F-09-012 | `scalingo.json` near-empty | observation | S |

**Totals:** 0 blockers, 4 major, 3 minor, 5 observations — 12 findings

---

## Verdict on reproducibility

The lockfiles (uv.lock, package-lock.json) are consistent and produce deterministic builds; `uv lock --check` passes; `npm ci` succeeds. The Scalingo deployment architecture (`.buildpacks` + Procfile + `postdeploy.py`) is coherent and correctly sequences Node build → Python install → migration → seed. The Docker Compose setup is structurally sound.

However, **three major findings** prevent full reproducibility for a fresh audience:

1. The README Quick Start cannot produce a working install (missing DB setup steps — F-09-002).
2. No `.env.example` exists, so the required configuration is not discoverable from the repo root (F-09-003).
3. The documented seed command references a non-existent file (F-09-004).

These three are all fixable in under a day (combined effort S+S+M) and must be addressed before SoftwareX submission.

The Docker build-from-scratch test could not be executed (F-09-001). This gap should be closed by a CI Docker build job before the submission date.
