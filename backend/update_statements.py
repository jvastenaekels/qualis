# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

import asyncio
from sqlalchemy import select
from app.database import SessionLocal
from app.models import Statement, StatementTranslation

async def update_statements():
    print("--- Updating Statement Texts ---")
    
    # Define Lorem ipsum variations
    LOREM_SHORT = " Lorem ipsum dolor sit amet."
    LOREM_MEDIUM = " Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
    LOREM_LONG = " Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur."
    
    async with SessionLocal() as session:
        # Get all statements
        result = await session.execute(select(Statement).order_by(Statement.id))
        statements = result.scalars().all()
        
        if not statements:
            print("No statements found.")
            return
        
        print(f"Found {len(statements)} statements. Updating translations...")
        
        for i, stmt in enumerate(statements):
            # Vary text length based on index - all statements have at least LOREM_SHORT
            if i % 4 == 0:
                extra = LOREM_SHORT
            elif i % 4 == 1:
                extra = LOREM_SHORT
            elif i % 4 == 2:
                extra = LOREM_MEDIUM
            else:
                extra = LOREM_LONG
            
            # Update translations for each language
            result = await session.execute(
                select(StatementTranslation).where(StatementTranslation.statement_id == stmt.id)
            )
            translations = result.scalars().all()
            
            for trans in translations:
                if trans.language_code == "en":
                    trans.text = f"Statement {stmt.code}:{extra}"
                elif trans.language_code == "fr":
                    trans.text = f"Énoncé {stmt.code}:{extra}"
                elif trans.language_code == "fi":
                    trans.text = f"Väittämä {stmt.code}:{extra}"
        
        await session.commit()
        print(f"✓ Updated {len(statements)} statements with new Lorem ipsum text.")
        print("--- Update Complete ---")

if __name__ == "__main__":
    asyncio.run(update_statements())
