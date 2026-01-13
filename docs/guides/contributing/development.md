# Development Guide

This guide covers how to set up your local environment to contribute to Open-Q.

## Prerequisites

- **Node.js**: v24.x (see `.nvmrc`)
- **Python**: v3.12+ (managed by `uv`)
- **uv**: [Installation Guide](https://docs.astral.sh/uv/) (Required for Python dependency management)
- **Make**: (Recommended for shortcut commands)

## 📥 Installation

### 1. Clone the repository

```bash
git clone https://github.com/jvastenaekels/open-q.git
cd open-q
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

Initialize the SQLite database (`q_method.db`) with the schema and default seed data (Admin user, Workspace).

```bash
# Initialize DB
cd backend && uv run python init_db.py

# Seed example study (ensure backend is NOT running, or use make seed if it checks api)
# Note: seed.py typically uses the API, so run the backend first.
```

## 🚀 Running Locally

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

## 🛠️ Daily Workflow Tools

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

| Scope    | Command             | Description                             |
| -------- | ------------------- | --------------------------------------- |
| **All**  | `make install`      | Install all dependencies                |
| **Back** | `make lint`         | Run Ruff (Back) & ESLint (Front)        |
| **Back** | `make check`        | Run Deep static analysis (Mypy, Bandie) |
| **Back** | `make test`         | Run Unit Tests (Front & Back)           |
| **API**  | `make check-api`    | Verify Frontend Client matches Backend  |
| **API**  | `make generate-api` | Regenerate Frontend Client              |
| **E2E**  | `make e2e`          | Run Playwright E2E Tests                |
| **CI**   | `make ci`           | Run Fast CI (Lint + Check + Test)       |
| **CI**   | `make ci-full`      | Run Full CI (Fast CI + E2E)             |

### API Client Synchronization

If you modify Backend Routes (e.g., `backend/app/routers/...`):

1.  Run **`make generate-api`** to regenerate the frontend client.
2.  This ensures `frontend/src/api/generated.ts` matches the backend (OpenAPI spec).
3.  Commit the updated client files.

> **Note:** The CI pipeline runs `make check-api` and will fail if the client is out of sync.

## 🏗️ Architecture Checks

We use **Architectural Fitness Functions** to prevent spaghetti code.

- **Backend**: `import-linter` ensures `routers` -> `services` -> `schemas` -> `models`.
- **Frontend**: `dependency-cruiser` banishes circular dependencies and orphan files.

These are run via `make check`.

## 🗄️ Database Maintenance

- **Sync Study Config**: `cd backend && uv run python seed.py data/example-study.json`
  Updates/Creates a study from JSON definition. Requires backend running.
- **Verify Schema**: `cd backend && uv run python scripts/migrate.py`
  Runs database migrations and verifies schema state.
