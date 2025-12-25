
import asyncio
import os
import sys

# Add project root to path
sys.path.append(os.getcwd())

from app.database import engine
from sqlalchemy import text, inspect

async def migrate():
    print("Checking database schema for 'show_statement_codes'...")
    async with engine.begin() as conn:
        # We need to inspect table asynchronously? 
        # SQLAlchemy AsyncEngine doesn't support inspection directly in same way.
        # simpler: try to select the column, if error, add it.
        
        try:
            await conn.execute(text("SELECT show_statement_codes FROM studies LIMIT 1"))
            print("Column 'show_statement_codes' already exists.")
        except Exception:
            print("Column missing. Adding 'show_statement_codes'...")
            # Detect dialect
            dialect = conn.dialect.name
            print(f"Detected dialect: {dialect}")
            
            if dialect == 'sqlite':
                # SQLite doesn't support TRUE/FALSE literals in default clause in all versions easily without check constraints
                # typically DEFAULT 0 is safer
                await conn.execute(text("ALTER TABLE studies ADD COLUMN show_statement_codes BOOLEAN DEFAULT 0"))
            else:
                # PostgreSQL
                await conn.execute(text("ALTER TABLE studies ADD COLUMN IF NOT EXISTS show_statement_codes BOOLEAN DEFAULT FALSE"))
            
            print("Column added successfully.")

if __name__ == "__main__":
    asyncio.run(migrate())
