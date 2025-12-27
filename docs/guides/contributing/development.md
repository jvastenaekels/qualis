# Development Guide

This guide covers how to set up your local environment to contribute to Open-Q.

## Prerequisites

- **Node.js**: v18 or higher
- **Python**: v3.10 or higher
- **Make** (optional, for shortcut commands)

## 📥 Installation

### 1. Clone the repository

```bash
git clone https://github.com/jvastenaekels/open-q.git
cd open-q
```

### 2. Backend Setup

The backend is built with FastAPI. We recommend using `venv`.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate

# Install application dependencies
pip install -r requirements.txt

# Install development dependencies (linters, testing, etc.)
pip install -r requirements-dev.txt

# Initialize database (SQLite by default)
python init_db.py
python seed.py  # Loads example-study.json
```

### 3. Frontend Setup

The frontend is a React application built with Vite.

```bash
cd frontend
npm install
```

## 🚀 Running Locally

You can run both services in separate terminals:

**Terminal 1 (Backend):**

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

_API available at http://localhost:8000_

**Terminal 2 (Frontend):**

```bash
cd frontend
npm run dev
```

_App available at http://localhost:5173_

---

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

### Code Quality Commands

| Scope     | Command (from root)         | Description                             |
| --------- | --------------------------- | --------------------------------------- |
| **Back**  | `make lint-back`            | Run Ruff (Lint & Format)                |
| **Back**  | `make type-back`            | Run Mypy (Types)                        |
| **Back**  | `make test-back`            | Run Pytest                              |
| **Front** | `npm run lint`              | Run ESLint                              |
| **Front** | `npm run type-check`        | Run TSC                                 |
| **Front** | `npm run lint:duplication`  | Check for copy-pasted code (JSCPD)      |
| **Front** | `npm run lint:architecture` | Check architectural rules (Dep-Cruiser) |

## 🏗️ Architecture Checks

We use **Architectural Fitness Functions** to prevent spaghetti code.

- **Backend**: `import-linter` ensures `routers` -> `services` -> `schemas` -> `models`.
- **Frontend**: `dependency-cruiser` banishes circular dependencies and orphan files.

If your build fails on "Architecture", check the relevant config files (`.importlinter` or `frontend/.dependency-cruiser.js`).

## 🗄️ Database Maintenance

The project includes scripts to manage the database schema and study configurations.

- **Sync Study Config**: `python backend/update_study.py`
  Updates the database to match the JSON definition in `backend/data/example-study.json`.
- **Verify Schema**: `python backend/scripts/ensure_schema.py`
  Checks for missing columns or tables without data loss.
