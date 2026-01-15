"""
Migration script to reset process_steps for all studies with default localized values.

This script updates all existing studies to have consistent process_steps structure
across all languages (EN, FR, FI) with only the text being translated.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from app.database import SessionLocal
from app.models import Study

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Default process steps from locale files
DEFAULT_PROCESS_STEPS = {
    "en": [
        {
            "id": "profile",
            "title": "Let's meet",
            "description": "A few quick questions to better understand your background.",
            "icon": "User",
            "color": "#3b82f6",
        },
        {
            "id": "rough",
            "title": "First impressions",
            "description": "Discover the statements and give your immediate reaction (agree, neutral, or disagree).",
            "icon": "Zap",
            "color": "#f59e0b",
        },
        {
            "id": "fine",
            "title": "Your perspective",
            "description": "Place the statements onto the grid to refine your point of view, prioritizing what matters most to you.",
            "icon": "Target",
            "color": "#8b5cf6",
        },
        {
            "id": "post",
            "title": "Why",
            "description": "A few words to explain your most significant choices.",
            "icon": "MessageSquare",
            "color": "#10b981",
        },
    ],
    "fr": [
        {
            "id": "profile",
            "title": "Faisons connaissance",
            "description": "Quelques questions rapides pour mieux comprendre votre parcours.",
            "icon": "User",
            "color": "#3b82f6",
        },
        {
            "id": "rough",
            "title": "Premières impressions",
            "description": "Découvrez les énoncés et donnez votre réaction immédiate (d'accord, neutre ou pas d'accord).",
            "icon": "Zap",
            "color": "#f59e0b",
        },
        {
            "id": "fine",
            "title": "Votre perspective",
            "description": "Placez les énoncés sur la grille pour affiner votre point de vue, en priorisant ce qui compte le plus pour vous.",
            "icon": "Target",
            "color": "#8b5cf6",
        },
        {
            "id": "post",
            "title": "Pourquoi",
            "description": "Quelques mots pour expliquer vos choix les plus significatifs.",
            "icon": "MessageSquare",
            "color": "#10b981",
        },
    ],
    "fi": [
        {
            "id": "profile",
            "title": "Tutustutaan",
            "description": "Muutama nopea kysymys taustasi ymmärtämiseksi.",
            "icon": "User",
            "color": "#3b82f6",
        },
        {
            "id": "rough",
            "title": "Ensivaikutelma",
            "description": "Tutustu väittämiin ja anna välitön reaktiosi (samaa mieltä, neutraali tai eri mieltä).",
            "icon": "Zap",
            "color": "#f59e0b",
        },
        {
            "id": "fine",
            "title": "Näkökulmasi",
            "description": "Aseta väittämät ruudukkoon tarkentaaksesi näkökulmaasi, priorisoimalla itsellesi tärkeimmät asiat.",
            "icon": "Target",
            "color": "#8b5cf6",
        },
        {
            "id": "post",
            "title": "Miksi",
            "description": "Muutama sana perustellaksesi merkittävimmät valintasi.",
            "icon": "MessageSquare",
            "color": "#10b981",
        },
    ],
}


async def migrate_process_steps():
    """Reset process_steps for all studies with default localized values."""

    logger.info("Starting process_steps migration...")

    async with SessionLocal() as session:
        # Get all studies
        result = await session.execute(select(Study))
        studies = result.scalars().all()

        logger.info(f"Found {len(studies)} studies to migrate")

        updated_count = 0

        for study in studies:
            logger.info(f"Processing study: {study.slug}")

            # Get all translations for this study
            translations = study.translations or []

            for translation in translations:
                lang_code = translation.language_code

                # Get default steps for this language
                default_steps = DEFAULT_PROCESS_STEPS.get(lang_code)

                if default_steps:
                    # Reset process_steps
                    translation.process_steps = default_steps
                    logger.info(f"  ✓ Reset process_steps for {lang_code}")
                else:
                    logger.warning(
                        f"  ⚠ No default process_steps for language: {lang_code}"
                    )

            updated_count += 1

        # Commit changes
        await session.commit()
        logger.info(f"✓ Successfully migrated {updated_count} studies")
        logger.info("Migration complete!")


if __name__ == "__main__":
    asyncio.run(migrate_process_steps())
