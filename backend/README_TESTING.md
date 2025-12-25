# Backend Testing

The backend uses `pytest` for testing.

## Prerequisites

Ensure you have the virtual environment activated and dependencies installed:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install pytest httpx pytest-asyncio
```

## Running Tests

Run all tests from the `backend/` directory:

```bash
# Using the module invocation (recommended for path resolution)
./venv/bin/python3 -m pytest tests
```

## Database Maintenance & Migrations

The project uses automated scripts for schema validation and study updates. These are safe to run against production databases (PostgreSQL) or local dev databases (SQLite).

- **`scripts/ensure_schema.py`**: Robustly checks the database for missing columns or tables and applies necessary `ALTER` statements.
- **`update_study.py`**: Synchronizes the database with the JSON study definition in `data/example-study.json`.

**Testing Migrations Locally:**

```bash
# Test schema check against your local SQLite database
python3 scripts/ensure_schema.py
```

## Test Structure

- `tests/conftest.py`: Sets up the test environment, including:
  - In-memory SQLite database (`StaticPool` for async support)
  - `seed_study` fixture for populating a test study
  - `client` fixture for async API requests
- `tests/test_api.py`: Contains test cases for all API endpoints.
- `tests/test_models.py`: Verifies SQLAlchemy model relationships and constraints.
