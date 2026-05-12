# SoftwareX Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Qualis installation and initialisation clear, deterministic, and evaluation-friendly for SoftwareX-style inspection and reuse.

**Architecture:** Treat Docker Compose as the primary evaluation path because it removes local PostgreSQL and Python/Node setup from the critical path. Keep the local development path as a secondary path, but make its ordering correct, deterministic, and smoke-testable. Add lightweight drift checks so lockfile versions, installation docs, and startup logging do not regress silently.

**Tech Stack:** Docker Compose, Make, FastAPI, PostgreSQL, Vite/React, npm lockfiles, uv, pytest, shell smoke checks.

---

## Target Experience

A first-time evaluator should be able to run:

```bash
git clone https://github.com/jvastenaekels/qualis.git
cd qualis
make demo-up
make demo-seed
make demo-smoke
```

Then open `http://localhost:3000`, log in with `admin@example.com` / `admin123`, and optionally visit `http://localhost:3000/coastal-wetland-futures`.

The local development path remains:

```bash
cp .env.example .env
make install
make migrate
cd backend && uv run python init_db.py && cd ..
make run-backend
make run-frontend
cd backend && uv run python seed.py data/example-study.json && cd ..
```

The seed command is deliberately after backend startup because `seed.py` calls the HTTP API.

## File Structure

- Modify `Makefile`: add demo targets, use `npm ci` for deterministic frontend install, improve `seed` target.
- Modify `README.md`: add a first-class "SoftwareX evaluation quick start" before the local "From zero" path; fix local seed ordering.
- Modify `docs/guides/deployment.md`: distinguish demo Docker defaults from production Docker configuration.
- Modify `backend/README.md`: align backend commands with `uv run` and root README.
- Modify `frontend/README.md`: align install command with `npm ci`.
- Modify `frontend/package-lock.json`: update root version metadata from `0.6.3` to `0.6.4`.
- Modify `docker-compose.yml`: add backend healthcheck and make frontend wait for a healthy backend.
- Modify `backend/app/main.py`: stop logging the raw `DATABASE_URL`.
- Create `scripts/check_installation_docs.py`: static drift checks for installation setup.
- Create `backend/tests/security/wave_6/test_startup_database_url_logging.py`: regression test against raw database URL logging.

---

### Task 1: Make Install Commands Deterministic

**Files:**
- Modify: `Makefile:6-17`
- Modify: `frontend/package-lock.json:1-10`
- Test: command-level verification

- [ ] **Step 1: Update the lockfile version metadata**

Edit `frontend/package-lock.json` so the top-level version and package-root version match `frontend/package.json`:

```json
{
    "name": "qualis",
    "version": "0.6.4",
    "lockfileVersion": 3,
    "requires": true,
    "packages": {
        "": {
            "name": "qualis",
            "version": "0.6.4"
        }
    }
}
```

Only change the two existing `"version": "0.6.3"` occurrences near the top of the file.

- [ ] **Step 2: Switch frontend install to `npm ci`**

Change the Makefile install target from:

```make
install:
	cd backend && uv sync
	cd frontend && npm install
```

to:

```make
install:
	cd backend && uv sync
	cd frontend && npm ci
```

- [ ] **Step 3: Run deterministic install verification**

Run:

```bash
make install
git diff --exit-code frontend/package-lock.json
```

Expected: `make install` exits 0 and `git diff --exit-code frontend/package-lock.json` exits 0.

- [ ] **Step 4: Check npm audit status explicitly**

Run:

```bash
cd frontend && npm audit --audit-level=high
```

Expected: If this fails, record the advisory package and fix or document the accepted risk in the implementation notes before marking this task complete.

- [ ] **Step 5: Commit**

```bash
git add Makefile frontend/package-lock.json
git commit -m "chore: make dependency installation deterministic"
```

---

### Task 2: Add Demo Make Targets

**Files:**
- Modify: `Makefile:4-24`
- Test: command-level verification

- [ ] **Step 1: Add demo targets to `.PHONY`**

Replace:

```make
.PHONY: install run-backend run-frontend lint check test ci run-ci ci-full run-ci-full
```

with:

```make
.PHONY: install run-backend run-frontend seed demo-up demo-seed demo-smoke demo-down lint check test ci run-ci ci-full run-ci-full
```

- [ ] **Step 2: Replace the placeholder `seed` target**

Replace:

```make
seed:
	@echo "Usage: cd backend && uv run python seed.py <path-to-study-json>"
```

with:

```make
seed:
	cd backend && uv run python seed.py data/example-study.json
```

- [ ] **Step 3: Add demo Docker targets**

Add immediately after `seed`:

```make
demo-up:
	docker compose up --build -d

demo-seed:
	docker compose exec backend uv run python seed.py data/example-study.json

demo-smoke:
	curl -fsS http://localhost:3000/ >/dev/null
	curl -fsS http://localhost:3000/health >/dev/null
	curl -fsS http://localhost:3000/api/study/coastal-wetland-futures >/dev/null

demo-down:
	docker compose down
```

- [ ] **Step 4: Validate Make syntax**

Run:

```bash
make -n demo-up
make -n demo-seed
make -n demo-smoke
make -n demo-down
```

Expected: each command prints the intended shell commands without executing Docker.

- [ ] **Step 5: Commit**

```bash
git add Makefile
git commit -m "chore: add demo setup targets"
```

---

### Task 3: Harden Docker Compose for Demo Startup

**Files:**
- Modify: `docker-compose.yml:16-35`
- Test: `docker compose config`; full Docker run when Docker is available

- [ ] **Step 1: Add a backend healthcheck**

Change the backend service from:

```yaml
  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://qualis:qualis@db:5432/qualis
      SECRET_KEY: docker-dev-secret-change-in-production
      IP_HASH_SALT: docker-dev-salt-change-in-production
      FRONTEND_URL: http://localhost:3000
      ENVIRONMENT: development
      ADMIN_EMAIL: admin@example.com
      ADMIN_PASSWORD: admin123
    depends_on:
      db:
        condition: service_healthy
```

to:

```yaml
  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql+asyncpg://qualis:qualis@db:5432/qualis
      SECRET_KEY: docker-dev-secret-change-in-production
      IP_HASH_SALT: docker-dev-salt-change-in-production
      FRONTEND_URL: http://localhost:3000
      ENVIRONMENT: development
      ADMIN_EMAIL: admin@example.com
      ADMIN_PASSWORD: admin123
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "uv run python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).read()\"",
        ]
      interval: 5s
      timeout: 3s
      retries: 12
```

- [ ] **Step 2: Make frontend wait for backend health**

Change:

```yaml
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
```

to:

```yaml
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      backend:
        condition: service_healthy
```

- [ ] **Step 3: Validate Compose syntax**

Run:

```bash
docker compose config
```

Expected: exits 0 and prints normalized Compose configuration.

- [ ] **Step 4: Run full demo path when Docker is available**

Run:

```bash
make demo-up
make demo-seed
make demo-smoke
make demo-down
```

Expected: all commands exit 0. `demo-smoke` must verify the frontend, backend health through nginx, and the seeded example study.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: make docker demo startup health-aware"
```

---

### Task 4: Fix Raw Database URL Logging

**Files:**
- Modify: `backend/app/main.py:80-84`
- Create: `backend/tests/security/wave_6/test_startup_database_url_logging.py`
- Test: `cd backend && uv run pytest tests/security/wave_6/test_startup_database_url_logging.py -q`

- [ ] **Step 1: Add the regression test**

Create `backend/tests/security/wave_6/test_startup_database_url_logging.py`:

```python
from pathlib import Path


def test_startup_does_not_log_raw_database_url() -> None:
    source = Path("app/main.py").read_text(encoding="utf-8")

    assert "settings.DATABASE_URL" not in source
    assert "DATABASE_URL is" not in source
```

- [ ] **Step 2: Run test to verify it fails before the fix**

Run:

```bash
cd backend && uv run pytest tests/security/wave_6/test_startup_database_url_logging.py -q
```

Expected before implementation: FAIL because `app/main.py` logs `settings.DATABASE_URL`.

- [ ] **Step 3: Replace the unsafe startup log**

Replace:

```python
    logger.info(f"lifespan: DATABASE_URL is {settings.DATABASE_URL}")
```

with:

```python
    logger.info("lifespan: database configuration loaded")
```

- [ ] **Step 4: Run the regression test**

Run:

```bash
cd backend && uv run pytest tests/security/wave_6/test_startup_database_url_logging.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/security/wave_6/test_startup_database_url_logging.py
git commit -m "fix: avoid logging raw database urls"
```

---

### Task 5: Add Static Drift Checks for Installation Setup

**Files:**
- Create: `scripts/check_installation_docs.py`
- Modify: `Makefile:57-61`
- Test: `python3 scripts/check_installation_docs.py`

- [ ] **Step 1: Create the checker script**

Create `scripts/check_installation_docs.py`:

```python
#!/usr/bin/env python3
"""Check that installation docs and package metadata stay coherent."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def check_frontend_lock_version() -> list[str]:
    package = json.loads(_read("frontend/package.json"))
    lock = json.loads(_read("frontend/package-lock.json"))
    errors: list[str] = []

    package_version = package["version"]
    lock_version = lock["version"]
    root_lock_version = lock["packages"][""]["version"]

    if lock_version != package_version:
        errors.append(
            f"frontend/package-lock.json version {lock_version!r} does not match "
            f"frontend/package.json {package_version!r}"
        )
    if root_lock_version != package_version:
        errors.append(
            f"frontend/package-lock.json packages[''].version {root_lock_version!r} "
            f"does not match frontend/package.json {package_version!r}"
        )

    return errors


def check_readme_demo_path() -> list[str]:
    readme = _read("README.md")
    required = [
        "make demo-up",
        "make demo-seed",
        "make demo-smoke",
        "http://localhost:3000",
        "admin@example.com",
        "admin123",
    ]
    return [f"README.md is missing {token!r}" for token in required if token not in readme]


def check_local_seed_order() -> list[str]:
    readme = _read("README.md")
    backend_index = readme.find("make run-backend")
    seed_index = readme.find("uv run python seed.py data/example-study.json")

    if backend_index == -1:
        return ["README.md is missing make run-backend in the local setup path"]
    if seed_index == -1:
        return ["README.md is missing the example seed command"]
    if seed_index < backend_index:
        return ["README.md documents seed.py before backend startup; seed.py requires the API"]
    return []


def check_no_raw_database_url_logging() -> list[str]:
    source = _read("backend/app/main.py")
    errors: list[str] = []
    if "settings.DATABASE_URL" in source:
        errors.append("backend/app/main.py still references settings.DATABASE_URL directly")
    if "DATABASE_URL is" in source:
        errors.append("backend/app/main.py still contains the raw DATABASE_URL log message")
    return errors


def main() -> int:
    errors = [
        *check_frontend_lock_version(),
        *check_readme_demo_path(),
        *check_local_seed_order(),
        *check_no_raw_database_url_logging(),
    ]
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("Installation docs are coherent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run checker to verify current failures**

Run:

```bash
python3 scripts/check_installation_docs.py
```

Expected before documentation updates: FAIL with missing demo README tokens and raw database URL logging if Task 4 is not complete.

- [ ] **Step 3: Wire the checker into `make check`**

In the `check` target, add this line after `python3 backend/scripts/check_relationships.py`:

```make
	python3 scripts/check_installation_docs.py
```

- [ ] **Step 4: Run checker after docs are updated**

Run:

```bash
python3 scripts/check_installation_docs.py
```

Expected after Tasks 4, 6, and 7: PASS with `Installation docs are coherent.`

- [ ] **Step 5: Commit**

```bash
git add scripts/check_installation_docs.py Makefile
git commit -m "test: guard installation documentation"
```

---

### Task 6: Rewrite README Quick Start Around SoftwareX Evaluation

**Files:**
- Modify: `README.md:134-190`
- Test: `python3 scripts/check_installation_docs.py`

- [ ] **Step 1: Replace the Quick Start section**

Replace the current `## Quick start` section through the Docker alternative subsection with:

````markdown
## Quick start

### SoftwareX evaluation quick start (Docker)

This is the recommended path for SoftwareX evaluation and first-time use. It starts PostgreSQL, the backend, and the built frontend with development demo credentials.

Prerequisite:

- Docker with the `docker compose` plugin

```bash
git clone https://github.com/jvastenaekels/qualis.git
cd qualis

make demo-up
make demo-seed
make demo-smoke
```

Open [http://localhost:3000](http://localhost:3000) and log in with:

| Field | Value |
| ----- | ----- |
| Email | `admin@example.com` |
| Password | `admin123` |

After seeding, the example participant flow is available at [http://localhost:3000/coastal-wetland-futures](http://localhost:3000/coastal-wetland-futures).

Stop the stack with:

```bash
make demo-down
```

### Local development setup

Use this path when you want hot reload, local tests, or direct backend/frontend development.

#### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Node.js](https://nodejs.org/) v24+
- PostgreSQL 15+ (running locally or reachable by URL)

#### From zero

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

# 3. Install dependencies (Python via uv, Node via npm lockfile)
make install

# 4. Create the database schema
make migrate

# 5. Initialize the database (creates an admin user from ADMIN_EMAIL/PASSWORD)
cd backend && uv run python init_db.py && cd ..

# 6. Run the app (two terminals)
make run-backend     # Terminal 1: FastAPI on :8000
make run-frontend    # Terminal 2: Vite dev server on :5173

# 7. Optional: seed an example study after the backend is running
cd backend && uv run python seed.py data/example-study.json && cd ..
```

Visit [http://localhost:5173](http://localhost:5173). Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env`.

If you seeded the example study, you can also visit `http://localhost:5173/coastal-wetland-futures` to walk the participant flow.

### Verifying your setup

```bash
# Run the full CI pipeline locally (lint + type check + test + build, ~3 min)
make ci

# Or run only the tests
make test
```
````

- [ ] **Step 2: Run the documentation checker**

Run:

```bash
python3 scripts/check_installation_docs.py
```

Expected after Tasks 4 and 5: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add softwarex evaluation quick start"
```

---

### Task 7: Align Secondary Documentation

**Files:**
- Modify: `docs/guides/deployment.md:89-92`
- Modify: `backend/README.md:23-54`
- Modify: `frontend/README.md:30-45`
- Test: `rg -n "pip install|npm install|seed.py" backend/README.md frontend/README.md docs/guides/deployment.md README.md`

- [ ] **Step 1: Clarify Docker deployment vs demo defaults**

Replace the Docker paragraph in `docs/guides/deployment.md`:

```markdown
A `docker-compose.yml` is provided at the repository root; it brings up the app and a Postgres service together. The same environment variables apply (see the [Configuration reference](../reference/configuration.md#environment--app-settings)). At minimum, set `SECRET_KEY`, `IP_HASH_SALT`, `DATABASE_URL`, and `ALLOWED_ORIGINS` in a `.env` file before `docker compose up`.
```

with:

```markdown
A `docker-compose.yml` is provided at the repository root. For SoftwareX evaluation or local exploration, use the repository defaults through `make demo-up`; they start PostgreSQL, the backend, and the frontend at `http://localhost:3000` with the demo admin account documented in the README.

For production-like Docker deployment, override the development defaults before launch. At minimum, set strong `SECRET_KEY` and `IP_HASH_SALT` values, set `ENVIRONMENT=production`, configure `ALLOWED_ORIGINS`, and point `DATABASE_URL` at the intended PostgreSQL database. See the [Configuration reference](../reference/configuration.md#environment--app-settings).
```

- [ ] **Step 2: Align backend README commands**

Replace the backend setup command:

```bash
pip install -r requirements.txt
```

with:

```bash
uv sync
```

Replace:

```bash
python init_db.py
```

with:

```bash
uv run python init_db.py
```

Replace:

```bash
python seed.py your-study.json
```

with:

```bash
uv run python seed.py your-study.json
```

Replace:

```bash
uvicorn app.main:app --reload
```

with:

```bash
uv run uvicorn app.main:app --reload
```

- [ ] **Step 3: Align frontend README install command**

Replace:

```bash
npm install
```

with:

```bash
npm ci
```

- [ ] **Step 4: Search for stale install instructions**

Run:

```bash
rg -n "pip install|npm install|python init_db.py|uvicorn app.main:app --reload" backend/README.md frontend/README.md docs/guides/deployment.md README.md
```

Expected: no stale setup commands remain in the main evaluation/developer docs. If `npm install` appears in deployment buildpack context outside setup instructions, keep it only when it is describing platform behavior rather than a user command.

- [ ] **Step 5: Commit**

```bash
git add docs/guides/deployment.md backend/README.md frontend/README.md
git commit -m "docs: align installation commands across guides"
```

---

### Task 8: Full Verification Pass

**Files:**
- No new files
- Test: complete install and documentation validation

- [ ] **Step 1: Verify no generated churn**

Run:

```bash
git status --short
```

Expected: only intentional tracked changes are present before final commit, or a clean tree after all task commits.

- [ ] **Step 2: Run static installation checks**

Run:

```bash
python3 scripts/check_installation_docs.py
```

Expected: PASS with `Installation docs are coherent.`

- [ ] **Step 3: Run backend regression test**

Run:

```bash
cd backend && uv run pytest tests/security/wave_6/test_startup_database_url_logging.py -q
```

Expected: PASS.

- [ ] **Step 4: Run deterministic install and lockfile check**

Run:

```bash
make install
git diff --exit-code frontend/package-lock.json
```

Expected: both commands exit 0.

- [ ] **Step 5: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: exits 0. Existing bundle-size or dynamic-import warnings are acceptable if there are no errors.

- [ ] **Step 6: Run fast CI**

Run:

```bash
make ci-fast
```

Expected: exits 0.

- [ ] **Step 7: Run Docker demo path when Docker is available**

Run:

```bash
make demo-up
make demo-seed
make demo-smoke
make demo-down
```

Expected: exits 0. If Docker is not installed in the execution environment, document that `docker --version` failed and run `docker compose config` later on a Docker-enabled machine before submission.

- [ ] **Step 8: Commit final verification notes if any docs changed**

If verification revealed documentation wording gaps, edit the relevant docs and commit:

```bash
git add README.md docs/guides/deployment.md backend/README.md frontend/README.md
git commit -m "docs: polish installation notes"
```

---

## Self-Review

- Spec coverage: the plan covers Docker demo setup, local setup ordering, seed ordering, deterministic install, Docker health, log redaction, documentation alignment, and drift checks.
- Placeholder scan: no placeholder or deferred implementation steps remain.
- Type consistency: script functions use concrete `list[str]` return types and only standard-library imports.
- Risk: Docker cannot be fully verified in environments without Docker. The plan makes this explicit and requires full demo-path verification on a Docker-enabled machine before SoftwareX submission.
