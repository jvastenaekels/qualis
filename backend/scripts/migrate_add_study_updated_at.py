import asyncio
import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine


async def migrate():
    print(f"Migrating database: {engine.url}")
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        print(f"Dialect: {dialect}")

        if dialect == "sqlite":
            # Check using PRAGMA
            cursor = await conn.execute(text("PRAGMA table_info(studies)"))
            columns = [row[1] for row in cursor.fetchall()]
            if "updated_at" in columns:
                print("Column 'updated_at' already exists.")
            else:
                print("Adding column 'updated_at'...")
                await conn.execute(
                    text(
                        "ALTER TABLE studies ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"
                    )
                )
                print("Column 'updated_at' added successfully.")
        else:
            # Postgres logic
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='studies' AND column_name='updated_at'"
                )
            )
            if result.scalar():
                print("Column 'updated_at' already exists.")
            else:
                print("Adding column 'updated_at'...")
                await conn.execute(
                    text(
                        "ALTER TABLE studies ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP"
                    )
                )
                print("Column 'updated_at' added successfully.")


if __name__ == "__main__":
    asyncio.run(migrate())
