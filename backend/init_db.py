# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Database initialization script."""

import asyncio
import os
import sys

# Add the parent directory to sys.path to allow imports from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import User


async def init_db(reset: bool = False):
    """Initialize the database tables."""
    print("DEBUG: Starting init_db...")
    print("--- Initializing Database Infrastructure ---")

    async with engine.begin() as conn:
        print(f"DEBUG: Engine connected. Connection: {conn}")
        if reset:
            print("0. Dropping all existing tables (--reset flag)...")
            # Use raw SQL with CASCADE for PostgreSQL compatibility
            dialect = conn.dialect.name
            if dialect == "postgresql":
                from sqlalchemy import text

                # Drop and recreate public schema (must be separate statements for asyncpg)
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))
            else:
                # SQLite doesn't need CASCADE
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
            print(
                "2. Database already initialized (User found). Skipping content seeding."
            )
            return

        print("2. No users found. Initializing admin account and default workspace...")

        # 1. Create Initial Admin User
        from app.utils.security import get_password_hash

        admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")

        owner = User(
            email=admin_email,
            hashed_password=get_password_hash(admin_password),
            is_active=True,
            is_superuser=True,
        )
        session.add(owner)
        await session.flush()  # get ID

        # 2. Defaults (Workspaces)
        # (Disabled per user request: "don't install example workspace")
        # from app.models import Workspace, WorkspaceMember, WorkspaceRole
        #
        # default_workspace = Workspace(
        #     title="Example Workspace",
        #     slug="example-workspace",
        # )
        # session.add(default_workspace)
        # await session.flush()  # get ID
        #
        # # 3. Add Admin to Workspace
        # member = WorkspaceMember(
        #     workspace_id=default_workspace.id,
        #     user_id=owner.id,
        #     role=WorkspaceRole.admin,
        # )
        # session.add(member)

        await session.commit()
        print(f"3. Admin user created: {admin_email}")
        # print(f"4. Default workspace created: {default_workspace.title}")
        print("\nNote: To seed a study, use: python seed.py data/example-study.json")
        print("--- Initialization Complete ---")
    await engine.dispose()


if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    if reset_flag:
        print("⚠️  WARNING: This will drop all existing data!")
    asyncio.run(init_db(reset=reset_flag))
