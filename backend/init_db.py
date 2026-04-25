# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Database initialization script."""

import asyncio
import os
import sys

# Add the parent directory to sys.path to allow imports from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select

from app.database import SessionLocal, engine
from app.models import User


async def reset_schema():
    """Drop and recreate public schema (required for clean PostgreSQL reset)."""
    print("DEBUG: Starting reset_schema...")
    print("0. Dropping all existing tables (--reset flag)...")

    async with engine.begin() as conn:
        print(f"DEBUG: Engine connected. Connection: {conn}")
        from sqlalchemy import text

        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        print("   Tables dropped.")

    await engine.dispose()


def run_migrations():
    """Run database migrations via Alembic.

    This function must be run synchronously and OUTSIDE of any existing asyncio loop,
    because Alembic's env.py invokes asyncio.run() internally.
    """
    print("1. Running database migrations (Alembic)...")
    try:
        from alembic.config import Config
        from alembic import command

        # Ensure we are in the directory containing alembic.ini (backend/)
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        os.chdir(backend_dir)

        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        print("✓ Database migrations completed successfully.")
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        sys.exit(1)


async def seed_data():
    """Seed the database with initial user and project."""
    print("1. Tables verified/created (by migrations side-effect).")

    async with SessionLocal() as session:
        # Check if we already have users
        result = await session.execute(select(User))
        existing_user = result.scalars().first()

        if existing_user:
            print(
                "2. Database already initialized (User found). Skipping content seeding."
            )
            return

        print(
            "2. No users found. Initializing superuser account and default project..."
        )

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

        # 2. Create Default Project
        from app.models import Project, ProjectMember, ProjectRole

        default_project = Project(
            title="Example Project",
            slug="example-project",
        )
        session.add(default_project)
        await session.flush()  # get ID

        # 3. Add Owner to Project
        member = ProjectMember(
            project_id=default_project.id,
            user_id=owner.id,
            role=ProjectRole.owner,
        )
        session.add(member)

        await session.commit()
        print(f"3. Superuser created: {admin_email}")
        print("   (Project Owner role assigned)")
        print(f"4. Default project created: {default_project.title}")
        print("\nNote: To seed a study, use: python seed.py data/example-study.json")
        print("--- Initialization Complete ---")
    await engine.dispose()


def main():
    print("--- Initializing Database Infrastructure ---")
    reset_flag = "--reset" in sys.argv
    # When called from postdeploy, migrations have already run via
    # scripts/migrate.py — passing --skip-migrations avoids running
    # `alembic upgrade head` a second time on every deploy
    # (audit F-09-007).
    skip_migrations = "--skip-migrations" in sys.argv

    if reset_flag:
        print("⚠️  WARNING: This will drop all existing data!")
        # 1. Reset Schema (Async)
        asyncio.run(reset_schema())

    if not skip_migrations:
        # 2. Run Migrations (Sync - creates new loop internally)
        run_migrations()
    else:
        print(
            "1. Skipping migrations (--skip-migrations); assuming caller "
            "already ran `alembic upgrade head`."
        )

    # 3. Seed Data (Async)
    asyncio.run(seed_data())


if __name__ == "__main__":
    main()
