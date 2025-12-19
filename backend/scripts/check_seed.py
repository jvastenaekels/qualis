# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

import sys
import os
# Add parent directory to path to allow importing app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from sqlalchemy import select
from app.database import SessionLocal
from app.models import Study

async def check_study():
    async with SessionLocal() as session:
        result = await session.execute(select(Study).where(Study.slug == "complex-study"))
        study = result.scalar_one_or_none()
        if study:
            print(f"FOUND: Study '{study.slug}' (ID: {study.id})")
        else:
            print("NOT_FOUND")

if __name__ == "__main__":
    asyncio.run(check_study())
