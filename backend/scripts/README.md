# Database Scripts

This directory contains utility scripts for database maintenance, migrations, and user management.

## 🚀 Database Migrations (Alembic)

We use **Alembic** to manage database schema versions. The legacy manual migration scripts are preserved for reference but are now superseded by the Alembic workflow.

- **`migrate.py`**: A wrapper that runs `alembic upgrade head`. This is used by the `release` phase in production.
- **`backend/migrations/`**: Contains the actual Alembic migration versions and configuration.

### Managing Schema Changes

1. **Modify Models**: Update `backend/app/models.py`.
2. **Generate Migration**:
   ```bash
   make migration-new
   ```
   (This runs `alembic revision --autogenerate`)
3. **Review**: Check the generated file in `backend/migrations/versions/`.
4. **Apply**:
   ```bash
   make migrate
   ```

---

## 🛠️ Utility Scripts

- **`init_db.py`**: (Located in `backend/`) Initializes the database from scratch. **WARNING**: Use `--reset` with caution as it wipes all data.
- **`create_user.py`**: Manually creates a new user in the database.
- **`check_relationships.py`**: Validates that all SQLAlchemy relationships use async-safe loading strategies (preventing implicit IO errors).
- **`dump_openapi.py`**: Generates the `openapi.json` file from the FastAPI app.

---

## 🛰️ Production (Scalingo)

Migrations run automatically on every deployment via the `release` phase in the `Procfile`.

```bash
# To run migrations manually on Scalingo:
scalingo --app your-app run -- python backend/scripts/migrate.py
```
