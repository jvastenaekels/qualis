"""Script to verify and display database schema status."""

import asyncio
import os
import sys

# Add backend directory to path so 'from app' works regardless of CWD
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy import text  # noqa: E402

from app.database import engine  # noqa: E402


async def check_schema():
    """Verify database schema and report status."""
    print("--- Schema Status Check ---")
    print("Connecting to database...")

    async with engine.begin() as conn:
        dialect = conn.dialect.name
        print(f"Dialect: {dialect}")

        if dialect == "postgresql":
            # List all tables in public schema
            result = await conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' ORDER BY table_name"
                )
            )
            tables = [row[0] for row in result.fetchall()]
        else:
            # SQLite
            result = await conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            )
            tables = [row[0] for row in result.fetchall()]

        if tables:
            print(f"Tables found ({len(tables)}): {', '.join(tables)}")
        else:
            print("No tables found. Database may need initialization.")
            print("Run: python backend/init_db.py")
            return

        # Check key tables exist
        required_tables = ["users", "studies", "workspaces", "participants"]
        missing = [t for t in required_tables if t not in tables]

        if missing:
            print(f"⚠️  Missing tables: {', '.join(missing)}")
            print("Run: python backend/init_db.py")
        else:
            print("✅ All required tables present.")

    print("--- Schema Status Check Complete ---")


if __name__ == "__main__":
    asyncio.run(check_schema())
