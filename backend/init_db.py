# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

import asyncio
import os
import sys
from sqlalchemy import select
from app.database import engine, Base, SessionLocal
from app.models import User

async def init_db(reset: bool = False):
    print("--- Initializing Database Infrastructure ---")
    
    async with engine.begin() as conn:
        if reset:
            print("0. Dropping all existing tables (--reset flag)...")
            await conn.run_sync(Base.metadata.drop_all)
            print("   Tables dropped.")
        
        # Create tables if they don't exist
        await conn.run_sync(Base.metadata.create_all)
    print("1. Tables verified/created.")

    async with SessionLocal() as session:
        # Check if we already have users
        result = await session.execute(select(User))
        existing_user = result.scalars().first()
        
        if existing_user:
            print("2. Database already initialized (User found). Skipping content seeding.")
            return

        print("2. No users found. Initializing admin account...")

        # 1. Create Initial Admin User
        admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "hashed_secret")
        
        owner = User(email=admin_email, hashed_password=admin_password, is_active=True)
        session.add(owner)
        await session.commit()
        print(f"3. Admin user created: {admin_email}")
        print("\nNote: To seed a study, use: python seed.py data/example-study.json")
        print("--- Initialization Complete ---")

if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    if reset_flag:
        print("⚠️  WARNING: This will drop all existing data!")
    asyncio.run(init_db(reset=reset_flag))
