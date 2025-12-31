# Open-Q Backend

The Open-Q backend is a robust ASGI application built with **FastAPI**, **SQLAlchemy (Async)**, and **Pydantic**. It uses **bcrypt** for password hashing and **PyJWT** for secure token handling.

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
   pip install -r requirements.txt
   ```

2. **Database Initialization**:
   By default, the app uses **SQLite** (`q_method.db`). This script creates the database schema and an initial admin user.

   ```bash
   python init_db.py
   ```

3. **Seeding**:
   Populate the database with studies defined in JSON files. **Requires the API server to be running** (use default admin credentials or set `ADMIN_EMAIL`/`ADMIN_PASSWORD`).

   ```bash
   python seed.py data/example-study.json
   ```

   ```bash
   python seed.py data/example-study.json
   ```

4. **Updating Study Configuration**:
   To update an existing study (translations, statements, etc.) from a JSON file:

   ```bash
   python update_study.py data/example-study.json
   ```

5. **Utility Scripts**:
   Additional management scripts are located in `scripts/`:
   - `scripts/create_user.py`: Create admin users interactively.
   - `scripts/ensure_schema.py`: Verify database schema consistency.

6. **Running Locally**:
   ```bash
   uvicorn app.main:app --reload
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
