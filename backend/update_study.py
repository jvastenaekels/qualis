
import asyncio
import json
import os
import sys

# Add project root to path for imports
sys.path.append(os.getcwd())

from app.database import SessionLocal, engine
from sqlalchemy import select, delete, update
from app.models import Study, StudyTranslation, Statement, StatementTranslation

async def update_study():
    # Relative path from where we run it (backend dir)
    json_path = 'data/example-study.json'
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    async with SessionLocal() as session:
        slug = data["slug"]
        result = await session.execute(select(Study).filter(Study.slug == slug))
        study = result.scalars().first()

        if not study:
            print(f"Study {slug} not found. Cannot update.")
            return

        print(f"Updating study '{slug}'...")
        
        # 1. Update main fields explicitly using UPDATE statement to bypass ORM dirty checking issues
        # We use a direct update statement to ensure JSON fields are written
        stmt = (
            update(Study)
            .where(Study.id == study.id)
            .values(
                default_language=data.get("default_language", "en"),
                grid_config=data["grid_config"],
                presort_config=data["presort_config"],
                postsort_config=data["postsort_config"],
                show_statement_codes=data.get("show_statement_codes", False)
            )
        )
        await session.execute(stmt)
        
        # 2. DELETE existing relations explicitly
        
        # 2. DELETE existing relations explicitly
        # We delete Translation and Statements (cascade will handle StatementTranslation usually)
        # But to be safe with ORM, we let DB handle cascade or do it manually if needed.
        # Models showing ondelete="CASCADE", so DB level cascade should work if supported.
        # SQLite supports FK constraints on by default in modern versions (or needs pragma).
        # Assuming environment is standard.
        
        print("Clearing old translations and statements...")
        # Explicitly delete children first because SQLite cascade might not be enabled
        await session.execute(delete(StatementTranslation).where(
            StatementTranslation.statement_id.in_(
                select(Statement.id).where(Statement.study_id == study.id)
            )
        ))
        
        await session.execute(delete(StudyTranslation).where(StudyTranslation.study_id == study.id))
        await session.execute(delete(Statement).where(Statement.study_id == study.id))
        
        # Refresh study so relationships are reloaded (empty) and attributes are available
        await session.refresh(study)
        
        # 3. Add New Translations
        # We need to access collection. Accessing it triggers reload (empty).
        # Or we can just append to the empty collection.
        # study.translations is implicitly empty after expire and reload?
        # Actually session.expire clears attributes. Accessing them re-queries DB.
        
        for lang, t_data in data["translations"].items():
            translation = StudyTranslation(
                study_id=study.id,
                language_code=lang,
                title=t_data["title"],
                description=t_data.get("description", ""),
                instructions=t_data["instructions"],
                subtitle=t_data.get("subtitle"),
                objective=t_data.get("objective"),
                consent_title=t_data.get("consent_title"),
                consent_description=t_data.get("consent_description", ""),
                consent_accept=t_data.get("consent_accept", "I agree"),
                consent_decline=t_data.get("consent_decline", "I do not agree"),
                ui_labels=t_data.get("ui_labels", {})
            )
            session.add(translation) 
            # We can associate via relation or just add to session if we provided study_id.
            # providing study_id is enough if we add to session.
        
        # 4. Add New Statements
        for s_data in data["statements"]:
            stmt = Statement(study_id=study.id, code=s_data["code"]) 
            session.add(stmt)
            await session.flush() # Need ID for translations
            
            # translations for statement
            for lang, text in s_data["translations"].items():
                s_trans = StatementTranslation(
                    statement_id=stmt.id,
                    language_code=lang,
                    text=text
                )
                session.add(s_trans)
            
        await session.commit()
        print("Update complete.")

if __name__ == "__main__":
    asyncio.run(update_study())
