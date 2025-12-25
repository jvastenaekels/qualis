
import asyncio
import os
import sys

# Add backend directory to path so 'from app' works regardless of CWD
script_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(script_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.database import engine
from sqlalchemy import text, inspect

async def migrate():
    print(f"--- Schema Migration Start ---")
    print(f"Connecting to database...")
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        print(f"Detected dialect: {dialect}")
        
        exists = False
        if dialect == 'sqlite':
            result = await conn.execute(text("PRAGMA table_info(studies)"))
            columns = [row.name for row in result.fetchall()]
            exists = 'show_statement_codes' in columns
            print(f"SQLite Columns found: {columns}")
        else:
            # PostgreSQL: information_schema
            # Explicitly check for 'public' schema to avoid confusion
            result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='studies' AND column_name='show_statement_codes' "
                "AND table_schema='public'"
            ))
            row = result.fetchone()
            exists = row is not None
            print(f"Postgres check result: {row}")

        if exists:
            print("Column 'show_statement_codes' already exists. Skipping.")
        else:
            print("Column 'show_statement_codes' is missing. Attempting to add...")
            if dialect == 'sqlite':
                await conn.execute(text("ALTER TABLE studies ADD COLUMN show_statement_codes BOOLEAN DEFAULT 0"))
            else:
                # PostgreSQL
                await conn.execute(text("ALTER TABLE studies ADD COLUMN show_statement_codes BOOLEAN DEFAULT FALSE"))
            
            print("Column 'show_statement_codes' added successfully.")
    print("--- Schema Migration End ---")

if __name__ == "__main__":
    asyncio.run(migrate())
