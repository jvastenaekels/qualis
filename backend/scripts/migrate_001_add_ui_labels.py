"""Migration script to add `ui_labels` column to `study_translations` table.

Usage: python backend/scripts/migrate_001_add_ui_labels.py.
"""

import asyncio
import os
import sys

# Ensure backend/ is in python path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text

from app.database import engine


async def run_migration():
    """Add ui_labels column to study_translations table if missing."""
    print("--- 🚀 Starting Migration: Add ui_labels column ---")
    async with engine.begin() as conn:
        print("Checking if column exists...")
        # Check logic varies by DB, but safe ALTER ADD works for Postgres generally
        # For SQLite, ADD COLUMN IF NOT EXISTS requires simple ALTER

        try:
            full_db_url = str(engine.url)
            print(
                f"Database Type: {'PostgreSQL' if 'postgresql' in full_db_url else 'SQLite'}"
            )

            if "postgresql" in full_db_url:
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN IF NOT EXISTS ui_labels JSON DEFAULT '{}'"
                    )
                )
            else:
                # SQLite - Check pragma first to avoid error
                # Note: SQLite ALER TABLE ... ADD COLUMN works, but IF NOT EXISTS syntax depends on version
                # Simple try/catch is robust
                try:
                    await conn.execute(
                        text(
                            "ALTER TABLE study_translations ADD COLUMN ui_labels JSON DEFAULT '{}'"
                        )
                    )
                except Exception as e:
                    if "duplicate column name" in str(e).lower():
                        print("Column already exists (SQLite). Skipping.")
                    else:
                        raise e

            print("✅ Column `ui_labels` added (or already existed).")
        except Exception as e:
            print(f"❌ Migration Failed: {e}")
            sys.exit(1)

    print("--- 🎉 Migration Complete ---")


if __name__ == "__main__":
    asyncio.run(run_migration())
