# Qualis Backend

The Qualis backend is a robust ASGI application built with **FastAPI**, **SQLAlchemy (Async)**, and **Pydantic**. It uses **bcrypt** for password hashing and **PyJWT** for secure token handling.

## 📁 Directory Structure

```text
backend/
├── app/
│   ├── main.py         # Entry point & app configuration
│   ├── models.py       # SQLAlchemy database models
│   ├── schemas.py      # Pydantic validation schemas
│   ├── database.py    # DB engine & session management
│   └── routers/        # API endpoint definitions (submissions, etc.)
├── scripts/            # Utility scripts (check_i18n, etc.)
├── tests/              # Pytest suite
├── init_db.py          # Script to create/reset DB tables
└── seed.py             # Script to populate DB with example study
```

## ⚙️ Development Setup

1. **Install Dependencies**:

   ```bash
   uv sync
   ```

2. **Database Initialization**:
   By default, the app uses **PostgreSQL**. Ensure your `DATABASE_URL` is configured in `.env`. This script creates the database schema (via Alembic) and an initial admin user (`admin@example.com`).

   ```bash
   uv run python init_db.py
   ```

3. **Seeding & Updating Content**:
   Populate or update the database with studies defined in JSON files.

   > **Note**: This script uses the API, so **the backend server must be running locally** (e.g., `uv run uvicorn app.main:app`). It uses the default admin credentials or `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars.

   ```bash
   # Create or Update a study
   uv run python seed.py your-study.json
   ```

4. **Utility Scripts**:
   Additional management scripts are located in `scripts/`:
   - `scripts/create_user.py`: Create admin users interactively.
   - `scripts/migrate.py`: Run Alembic migrations to update schema.

5. **Running Locally**:
   ```bash
   uv run uvicorn app.main:app --reload
   ```

## 🧪 Testing

We use `pytest` for backend testing. Detailed instructions can be found in [../docs/guides/contributing/development.md](../docs/guides/contributing/development.md).

```bash
pytest
```

## 🔌 API Documentation

Once the server is running, you can access the interactive API docs at:

- Swagger UI: `http://localhost:8000/docs`
- Redoc: `http://localhost:8000/redoc`
