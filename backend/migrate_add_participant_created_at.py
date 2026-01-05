# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Migration script to add created_at column to participants table."""

import asyncio
import os
import sys

# Add the parent directory to sys.path to allow imports from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text

from app.database import engine


async def migrate():
    """Add created_at column to participants table if it doesn't exist."""
    print("--- Adding created_at column to participants table ---")

    async with engine.begin() as conn:
        # Check which database we're using
        dialect = conn.dialect.name

        if dialect == "postgresql":
            # Check if column already exists
            result = await conn.execute(
                text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'participants'
                    AND column_name = 'created_at'
                """)
            )
            exists = result.fetchone() is not None

            if exists:
                print("✓ Column 'created_at' already exists. Nothing to do.")
            else:
                # Add the column with a default value
                await conn.execute(
                    text("""
                        ALTER TABLE participants
                        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE
                        DEFAULT CURRENT_TIMESTAMP NOT NULL
                    """)
                )
                print("✓ Column 'created_at' added successfully.")

        elif dialect == "sqlite":
            # SQLite doesn't have a simple way to check if column exists
            # Try to add it and catch the error if it already exists
            try:
                await conn.execute(
                    text("""
                        ALTER TABLE participants
                        ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
                    """)
                )
                print("✓ Column 'created_at' added successfully.")
            except Exception as e:
                if "duplicate column name" in str(e).lower():
                    print("✓ Column 'created_at' already exists. Nothing to do.")
                else:
                    raise
        else:
            print(f"⚠️  Unsupported database dialect: {dialect}")
            return

    print("--- Migration Complete ---")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
