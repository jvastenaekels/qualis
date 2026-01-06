"""Consolidated database migration script.

Runs all necessary migrations in the correct order to ensure
the database schema matches the application models.

This script is designed to be idempotent - safe to run multiple times.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text, inspect, select
from app.database import engine, SessionLocal
from app.models import Study, StudyCollaborator, StudyRole, WorkspaceMember

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


async def check_column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""

    def _check(connection):
        inspector = inspect(connection)
        columns = [c["name"] for c in inspector.get_columns(table_name)]
        return column_name in columns

    return await conn.run_sync(_check)


async def check_table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""

    def _check(connection):
        inspector = inspect(connection)
        return table_name in inspector.get_table_names()

    return await conn.run_sync(_check)


async def migrate_studies_table():
    """Add missing columns to studies table."""
    logger.info("Checking 'studies' table...")

    async with engine.connect() as conn:
        if not await check_table_exists(conn, "studies"):
            logger.warning("Studies table doesn't exist - skipping migration")
            return

        migrations_applied = False

        # randomize_statements
        if not await check_column_exists(conn, "studies", "randomize_statements"):
            logger.info("  Adding 'randomize_statements' column...")
            await conn.execute(
                text(
                    "ALTER TABLE studies ADD COLUMN randomize_statements BOOLEAN DEFAULT 0"
                )
            )
            migrations_applied = True

        # show_statement_codes
        if not await check_column_exists(conn, "studies", "show_statement_codes"):
            logger.info("  Adding 'show_statement_codes' column...")
            await conn.execute(
                text(
                    "ALTER TABLE studies ADD COLUMN show_statement_codes BOOLEAN DEFAULT 0"
                )
            )
            migrations_applied = True

        # branding
        if not await check_column_exists(conn, "studies", "branding"):
            logger.info("  Adding 'branding' column...")
            dialect = conn.dialect.name
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE studies ADD COLUMN branding JSON DEFAULT '{}'::json"
                    )
                )
            else:
                await conn.execute(
                    text("ALTER TABLE studies ADD COLUMN branding JSON DEFAULT '{}'")
                )
            migrations_applied = True

        if migrations_applied:
            await conn.commit()
            logger.info("✓ Studies table updated")
        else:
            logger.info("✓ Studies table up to date")


async def migrate_translations_table():
    """Add missing columns to study_translations table."""
    logger.info("Checking 'study_translations' table...")

    async with engine.connect() as conn:
        if not await check_table_exists(conn, "study_translations"):
            logger.warning("Translations table doesn't exist - skipping migration")
            return

        if not await check_column_exists(conn, "study_translations", "ui_labels"):
            logger.info("  Adding 'ui_labels' column...")
            dialect = conn.dialect.name
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN ui_labels JSON DEFAULT '{}'::json"
                    )
                )
            else:
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN ui_labels JSON DEFAULT '{}'"
                    )
                )
            await conn.commit()
            logger.info("✓ Translations table updated")
        else:
            logger.info("✓ Translations table up to date")


async def migrate_participants_table():
    """Add missing columns to participants table."""
    logger.info("Checking 'participants' table...")

    async with engine.connect() as conn:
        if not await check_table_exists(conn, "participants"):
            logger.warning("Participants table doesn't exist - skipping migration")
            return

        migrations_applied = False

        if not await check_column_exists(conn, "participants", "random_seed"):
            logger.info("  Adding 'random_seed' column...")
            await conn.execute(
                text("ALTER TABLE participants ADD COLUMN random_seed VARCHAR")
            )
            migrations_applied = True

        # created_at
        if not await check_column_exists(conn, "participants", "created_at"):
            logger.info("  Adding 'created_at' column...")
            dialect = conn.dialect.name
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE participants ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL"
                    )
                )
            else:
                await conn.execute(
                    text(
                        "ALTER TABLE participants ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL"
                    )
                )
            migrations_applied = True

        if migrations_applied:
            await conn.commit()
            logger.info("✓ Participants table updated")
        else:
            logger.info("✓ Participants table up to date")


async def migrate_users_table():
    """Add missing columns to users table."""
    logger.info("Checking 'users' table...")

    async with engine.connect() as conn:
        if not await check_table_exists(conn, "users"):
            logger.warning("Users table doesn't exist - skipping migration")
            return

        if not await check_column_exists(conn, "users", "full_name"):
            logger.info("  Adding 'full_name' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR"))
            await conn.commit()
            logger.info("✓ Users table updated")
        else:
            logger.info("✓ Users table up to date")


async def verify_workspace_tables():
    """Verify workspace architecture tables exist."""
    logger.info("Verifying workspace architecture...")

    async with engine.connect() as conn:
        required_tables = ["workspaces", "workspace_members", "study_collaborators"]

        for table in required_tables:
            if not await check_table_exists(conn, table):
                logger.error(f"✗ Missing required table: {table}")
                logger.error("  Run 'uv run python init_db.py' to initialize database")
                sys.exit(1)

        logger.info("✓ Workspace tables verified")


async def migrate_data_collaborators():
    """Migrate workspace members to study collaborators."""
    logger.info("Checking for necessary data migration (Workspace -> Collaborators)...")

    # Map WorkspaceRole to StudyRole
    ROLE_MAP = {
        "admin": StudyRole.owner,
        "researcher": StudyRole.editor,
        "viewer": StudyRole.viewer,
    }

    async with SessionLocal() as db:
        # Check if we have workspace members but no collaborators (or need to sync)
        # This is a bit naive, but safe since we check for existence before adding.

        # Verify tables exist first to avoid crashing if schema is broken
        try:
            await db.execute(select(WorkspaceMember).limit(1))
            await db.execute(select(StudyCollaborator).limit(1))
        except Exception:
            logger.warning("Skipping data migration: Tables not ready")
            return

        members_result = await db.execute(select(WorkspaceMember))
        members = members_result.scalars().all()

        member_migrated_count = 0
        for member in members:
            # Find all studies in this workspace
            studies_in_ws_result = await db.execute(
                select(Study).where(Study.workspace_id == member.workspace_id)
            )
            studies_in_ws = studies_in_ws_result.scalars().all()

            for study in studies_in_ws:
                # Check if collaborator already exists
                existing = await db.execute(
                    select(StudyCollaborator).where(
                        StudyCollaborator.study_id == study.id,
                        StudyCollaborator.user_id == member.user_id,
                    )
                )
                if not existing.scalar_one_or_none():
                    collab = StudyCollaborator(
                        study_id=study.id,
                        user_id=member.user_id,
                        role=ROLE_MAP.get(member.role, StudyRole.viewer),
                    )
                    db.add(collab)
                    member_migrated_count += 1

        if member_migrated_count > 0:
            await db.commit()
            logger.info(
                f"✓ Migrated {member_migrated_count} workspace memberships to collaborators"
            )
        else:
            logger.info("✓ Data migration up to date (no new collaborators to migrate)")


async def run_all_migrations():
    """Run all migrations in order."""
    logger.info("=" * 60)
    logger.info("Starting database migrations...")
    logger.info("=" * 60)

    try:
        # First verify core tables exist
        await verify_workspace_tables()

        # Then apply column migrations
        await migrate_studies_table()
        await migrate_translations_table()
        await migrate_participants_table()
        await migrate_users_table()

        # Then run data migrations
        await migrate_data_collaborators()

        logger.info("=" * 60)
        logger.info("✓ All migrations completed successfully!")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"✗ Migration failed: {e}")
        logger.exception(e)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_all_migrations())
