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

from sqlalchemy import text, inspect
from app.database import engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


class MigrationEngine:
    """Wrapper for database operations during migration with safety features."""

    def __init__(self, engine):
        self.engine = engine
        self._lock_file = None

    async def __aenter__(self):
        # 1. Acquire File Lock
        lock_file_path = Path(__file__).parent / "migration.lock"
        self._lock_fh = open(lock_file_path, "w")
        if sys.platform != "win32":
            import fcntl

            try:
                fcntl.flock(self._lock_fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                logger.error("✗ Another migration is already in progress. Exiting.")
                self._lock_fh.close()
                sys.exit(1)

        # 2. Add Timeouts to the connection
        # We don't modify the global engine, we just ensure we use it carefully
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if sys.platform != "win32":
            import fcntl

            fcntl.flock(self._lock_fh, fcntl.LOCK_UN)
        self._lock_fh.close()


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
            dialect = conn.dialect.name
            default_val = "FALSE" if dialect == "postgresql" else "0"
            await conn.execute(
                text(
                    f"ALTER TABLE studies ADD COLUMN randomize_statements BOOLEAN DEFAULT {default_val}"
                )
            )
            migrations_applied = True
            logger.info("  Added 'randomize_statements' column")

        # show_statement_codes
        if not await check_column_exists(conn, "studies", "show_statement_codes"):
            logger.info("  Adding 'show_statement_codes' column...")
            dialect = conn.dialect.name
            default_val = "FALSE" if dialect == "postgresql" else "0"
            await conn.execute(
                text(
                    f"ALTER TABLE studies ADD COLUMN show_statement_codes BOOLEAN DEFAULT {default_val}"
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

        # access_password
        if not await check_column_exists(conn, "studies", "access_password"):
            logger.info("  Adding 'access_password' column...")
            await conn.execute(
                text("ALTER TABLE studies ADD COLUMN access_password VARCHAR")
            )
            migrations_applied = True

        # start_date
        if not await check_column_exists(conn, "studies", "start_date"):
            logger.info("  Adding 'start_date' column...")
            dialect = conn.dialect.name
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE studies ADD COLUMN start_date TIMESTAMP WITH TIME ZONE"
                    )
                )
            else:
                await conn.execute(
                    text("ALTER TABLE studies ADD COLUMN start_date TIMESTAMP")
                )
            migrations_applied = True

        # end_date
        if not await check_column_exists(conn, "studies", "end_date"):
            logger.info("  Adding 'end_date' column...")
            dialect = conn.dialect.name
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE studies ADD COLUMN end_date TIMESTAMP WITH TIME ZONE"
                    )
                )
            else:
                await conn.execute(
                    text("ALTER TABLE studies ADD COLUMN end_date TIMESTAMP")
                )
            migrations_applied = True

        # symmetry_lock
        if not await check_column_exists(conn, "studies", "symmetry_lock"):
            logger.info("  Adding 'symmetry_lock' column...")
            dialect = conn.dialect.name
            default_val = "TRUE" if dialect == "postgresql" else "1"
            await conn.execute(
                text(
                    f"ALTER TABLE studies ADD COLUMN symmetry_lock BOOLEAN DEFAULT {default_val}"
                )
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

        migrations_applied = False

        # ui_labels
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
            migrations_applied = True

        # condition_of_instruction
        if not await check_column_exists(
            conn, "study_translations", "condition_of_instruction"
        ):
            logger.info("  Adding 'condition_of_instruction' column...")
            await conn.execute(
                text(
                    "ALTER TABLE study_translations ADD COLUMN condition_of_instruction VARCHAR"
                )
            )
            migrations_applied = True

        # pre_instruction
        if not await check_column_exists(conn, "study_translations", "pre_instruction"):
            logger.info("  Adding 'pre_instruction' column...")
            await conn.execute(
                text(
                    "ALTER TABLE study_translations ADD COLUMN pre_instruction VARCHAR"
                )
            )
            migrations_applied = True

        # instructions
        if not await check_column_exists(conn, "study_translations", "instructions"):
            logger.info("  Adding 'instructions' column...")
            await conn.execute(
                text("ALTER TABLE study_translations ADD COLUMN instructions VARCHAR")
            )
            migrations_applied = True

        # consent_title
        if not await check_column_exists(conn, "study_translations", "consent_title"):
            logger.info("  Adding 'consent_title' column...")
            await conn.execute(
                text("ALTER TABLE study_translations ADD COLUMN consent_title VARCHAR")
            )
            migrations_applied = True

        # consent_description
        if not await check_column_exists(
            conn, "study_translations", "consent_description"
        ):
            logger.info("  Adding 'consent_description' column...")
            await conn.execute(
                text(
                    "ALTER TABLE study_translations ADD COLUMN consent_description VARCHAR"
                )
            )
            migrations_applied = True

        # consent_accept
        if not await check_column_exists(conn, "study_translations", "consent_accept"):
            logger.info("  Adding 'consent_accept' column...")
            await conn.execute(
                text("ALTER TABLE study_translations ADD COLUMN consent_accept VARCHAR")
            )
            migrations_applied = True

        # consent_decline
        if not await check_column_exists(conn, "study_translations", "consent_decline"):
            logger.info("  Adding 'consent_decline' column...")
            await conn.execute(
                text(
                    "ALTER TABLE study_translations ADD COLUMN consent_decline VARCHAR"
                )
            )
            migrations_applied = True

        # process_steps
        if not await check_column_exists(conn, "study_translations", "process_steps"):
            logger.info("  Adding 'process_steps' column...")
            dialect = conn.dialect.name
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN process_steps JSON DEFAULT '[]'::json"
                    )
                )
            else:
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN process_steps JSON DEFAULT '[]'"
                    )
                )
            migrations_applied = True

        # methodology_tips
        if not await check_column_exists(
            conn, "study_translations", "methodology_tips"
        ):
            logger.info("  Adding 'methodology_tips' column...")
            dialect = conn.dialect.name
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN methodology_tips JSON DEFAULT '[]'::json"
                    )
                )
            else:
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN methodology_tips JSON DEFAULT '[]'"
                    )
                )
            migrations_applied = True
            logger.info("  Added 'methodology_tips' column")

        # step_help
        if not await check_column_exists(conn, "study_translations", "step_help"):
            logger.info("  Adding 'step_help' column...")
            dialect = conn.dialect.name
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN step_help JSON DEFAULT '{}'::json"
                    )
                )
            else:
                await conn.execute(
                    text(
                        "ALTER TABLE study_translations ADD COLUMN step_help JSON DEFAULT '{}'"
                    )
                )
            migrations_applied = True
            logger.info("  Added 'step_help' column")

        if migrations_applied:
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

        # random_seed
        if not await check_column_exists(conn, "participants", "random_seed"):
            logger.info("  Adding 'random_seed' column...")
            await conn.execute(
                text("ALTER TABLE participants ADD COLUMN random_seed VARCHAR")
            )
            migrations_applied = True
            logger.info("  Added 'random_seed' column")

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

        migrations_applied = False

        if not await check_column_exists(conn, "users", "full_name"):
            logger.info("  Adding 'full_name' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR"))
            migrations_applied = True

        # totp_secret
        if not await check_column_exists(conn, "users", "totp_secret"):
            logger.info("  Adding 'totp_secret' column...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN totp_secret VARCHAR"))
            migrations_applied = True

        # is_totp_enabled
        if not await check_column_exists(conn, "users", "is_totp_enabled"):
            logger.info("  Adding 'is_totp_enabled' column...")
            dialect = conn.dialect.name
            default_val = "FALSE" if dialect == "postgresql" else "0"
            await conn.execute(
                text(
                    f"ALTER TABLE users ADD COLUMN is_totp_enabled BOOLEAN DEFAULT {default_val}"
                )
            )
            migrations_applied = True

        if migrations_applied:
            await conn.commit()
            logger.info("✓ Users table updated")
        else:
            logger.info("✓ Users table up to date")


async def migrate_recruitment_invitation_tables():
    """Create recruitment_links and invitations tables."""
    logger.info("Checking Phase 2 tables...")

    async with engine.connect() as conn:
        # recruitment_links
        if not await check_table_exists(conn, "recruitment_links"):
            logger.info("  Creating 'recruitment_links' table...")
            dialect = conn.dialect.name
            bool_default = "TRUE" if dialect == "postgresql" else "1"
            await conn.execute(
                text(
                    f"""
                CREATE TABLE recruitment_links (
                    id INTEGER PRIMARY KEY {"AUTOINCREMENT" if dialect != "postgresql" else ""},
                    study_id INTEGER NOT NULL,
                    type VARCHAR(20) NOT NULL,
                    token VARCHAR NOT NULL UNIQUE,
                    name VARCHAR,
                    capacity INTEGER,
                    usage_count INTEGER DEFAULT 0,
                    start_count INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT {bool_default},
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    FOREIGN KEY(study_id) REFERENCES studies(id) ON DELETE CASCADE
                )
            """
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX ix_recruitment_links_token ON recruitment_links (token)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX ix_recruitment_links_study_id ON recruitment_links (study_id)"
                )
            )
        else:
            # Add start_count if table exists but column doesn't
            if not await check_column_exists(conn, "recruitment_links", "start_count"):
                logger.info("  Adding 'start_count' column to recruitment_links...")
                await conn.execute(
                    text(
                        "ALTER TABLE recruitment_links ADD COLUMN start_count INTEGER DEFAULT 0"
                    )
                )
                await conn.commit()

        # invitations
        if not await check_table_exists(conn, "invitations"):
            logger.info("  Creating 'invitations' table...")
            dialect = conn.dialect.name
            await conn.execute(
                text(
                    f"""
                CREATE TABLE invitations (
                    id INTEGER PRIMARY KEY {"AUTOINCREMENT" if dialect != "postgresql" else ""},
                    email VARCHAR NOT NULL,
                    study_id INTEGER NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    token VARCHAR NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    accepted_at TIMESTAMP,
                    FOREIGN KEY(study_id) REFERENCES studies(id) ON DELETE CASCADE
                )
            """
                )
            )
            await conn.execute(
                text("CREATE INDEX ix_invitations_token ON invitations (token)")
            )
            await conn.execute(
                text("CREATE INDEX ix_invitations_email ON invitations (email)")
            )

        await conn.commit()
        logger.info("✓ Phase 2 tables verified")


async def verify_workspace_tables():
    """Verify workspace architecture tables exist."""
    logger.info("Verifying workspace architecture...")

    async with engine.connect() as conn:
        required_tables = ["workspaces", "workspace_members"]

        for table in required_tables:
            if not await check_table_exists(conn, table):
                logger.warning(f"  Missing required table: {table}")
                return False

        logger.info("✓ Workspace tables verified")
        return True


async def run_all_migrations():
    """Run all migrations in order."""
    logger.info("=" * 60)
    logger.info("Starting database migrations...")
    logger.info("=" * 60)

    try:
        async with MigrationEngine(engine):
            # First verify core tables exist
            if not await verify_workspace_tables():
                logger.warning(
                    "Skipping migrations: Workspace tables missing (init_db will create them)."
                )
                return

            # Then apply column migrations
            await migrate_studies_table()
            await migrate_translations_table()
            await migrate_participants_table()
            await migrate_users_table()
            await migrate_recruitment_invitation_tables()

        logger.info("=" * 60)
        logger.info("✓ All migrations completed successfully!")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"✗ Migration failed: {e}")
        logger.exception(e)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_all_migrations())
