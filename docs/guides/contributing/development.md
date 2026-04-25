# Development Guide

This guide covers how to set up your local environment to contribute to Qualis.

## Prerequisites

- **Node.js**: v24.x (see `.nvmrc`)
- **Python**: v3.13+ (managed by `uv`)
- **uv**: [Installation Guide](https://docs.astral.sh/uv/) (Required for Python dependency management)
- **PostgreSQL**: v15+
- **Make**: (Recommended for shortcut commands)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/jvastenaekels/qualis.git
cd qualis
```

### 2. Install Dependencies

We use a unified `Makefile` to handle installation for both frontend and backend.

```bash
make install
```

This will:

- Set up the Python virtual environment via `uv sync`.
- Install Node.js dependencies via `npm install`.

### 3. Initialize Database

Initialize the PostgreSQL database with the schema and the default admin user.

```bash
# Run Alembic migrations to create the schema
make migrate

# Or initialize with a default admin account
cd backend && uv run python init_db.py
```

> [!IMPORTANT]
> Ensure your `DATABASE_URL` is set in `backend/.env` before running this. Example: `DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/libreq_dev`

## Running Locally

You can run both services in separate terminals using `make`:

**Terminal 1 (Backend):**

```bash
make run-backend
```

_API available at http://localhost:8000_
_Docs available at http://localhost:8000/docs_

**Terminal 2 (Frontend):**

```bash
make run-frontend
```

_App available at http://localhost:5173_

## Daily Workflow Tools

We enforce high code quality standards. Please install the pre-commit hooks to catch issues early.

### Pre-commit Hooks

This project uses `pre-commit` to ensure code quality (Linting, Types, Complexity) before you commit.

```bash
# Install hooks
pre-commit install

# (Optional) Run manually on all files
pre-commit run --all-files
```

### Code Quality Commands (Make)

| Scope    | Command             | Description                              |
| -------- | ------------------- | ---------------------------------------- |
| **All**  | `make install`      | Install all dependencies                 |
| **All**  | `make lint`         | Run Ruff (Python) and Biome (TypeScript) |
| **All**  | `make check`        | Deep static analysis (Mypy, Bandit, etc.)|
| **All**  | `make test`         | Run unit tests (Frontend and Backend)    |
| **API**  | `make check-api`    | Verify frontend client matches backend   |
| **API**  | `make generate-api` | Regenerate frontend API client           |
| **E2E**  | `make e2e`          | Run Playwright E2E tests                 |
| **CI**   | `make ci`           | Run fast CI (Lint + Check + Test + Build)|
| **CI**   | `make ci-full`      | Run full CI (Fast CI + DB Reset + E2E)   |

### API Client Synchronization

If you modify Backend Routes (e.g., `backend/app/routers/...`):

1. Run **`make generate-api`** to regenerate the frontend client.
2. This ensures `frontend/src/api/generated.ts` matches the backend (OpenAPI spec).
3. Commit the updated client files.

> **Note:** The CI pipeline runs `make check-api` and will fail if the client is out of sync.

## Architecture Checks

We use **Architectural Fitness Functions** to prevent spaghetti code.

- **Backend**: `import-linter` ensures `routers` -> `services` -> `schemas` -> `models`.
- **Frontend**: `dependency-cruiser` banishes circular dependencies and orphan files.

These are run via `make check`.

## Database Maintenance

- **Run Migrations**: `make migrate`
  Executes `alembic upgrade head` to ensure your local database is up to date.
- **Create New Migration**: `make migration-new`
  Generates a new Alembic revision after you modify models in `backend/app/models.py`.
- **Reset Database**: `make db-reset`
  Drops and recreates all tables. **Warning**: destroys all local data.
- **Sync Study Config**: `cd backend && uv run python seed.py data/example-study.json`
  Updates/Creates a study from JSON definition. Requires backend running.
