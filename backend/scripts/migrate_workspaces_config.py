import logging
import sys
import asyncio
from sqlalchemy import text
from app.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_workspaces_config():
    """Add config column to workspaces table and update enum if needed."""
    try:
        async with engine.begin() as conn:
            # Detect dialect
            dialect_name = engine.dialect.name
            logger.info(f"Running migration on dialect: {dialect_name}")

            # Check if config column exists
            column_exists = False
            if dialect_name == "sqlite":
                # JSONB in SQLite is supported as JSON
                result = await conn.execute(text("PRAGMA table_info(workspaces)"))
                rows = result.fetchall()
                # row structure: (cid, name, type, notnull, dflt_value, pk)
                if any(row[1] == "config" for row in rows):
                    column_exists = True
            else:
                # Postgres
                result = await conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name='workspaces' AND column_name='config'"
                    )
                )
                if result.fetchone():
                    column_exists = True

            if not column_exists:
                logger.info("Adding config column to workspaces...")
                # SQLite supports ADD COLUMN. JSON/JSONB maps to TEXT mostly or JSON affinity.
                # We use generic JSON type which SQLAlchemy handles, but raw SQL needs specific type.
                # In SQLite 'JSON' is valid type name. In Postgres 'JSONB'.
                col_type = "JSON" if dialect_name == "sqlite" else "JSONB"
                await conn.execute(
                    text(
                        f"ALTER TABLE workspaces ADD COLUMN config {col_type} DEFAULT '{{}}'"
                    )
                )
                logger.info("Column added successfully.")
            else:
                logger.info("Config column already exists.")

            # Enum update for 'owner' role - Postgres only
            if dialect_name != "sqlite":
                try:
                    await conn.execute(
                        text("ALTER TYPE workspacerole ADD VALUE IF NOT EXISTS 'owner'")
                    )
                    logger.info("Added 'owner' to workspacerole enum.")
                except Exception as e:
                    logger.warning(f"Could not alter Enum: {e}")
            else:
                logger.info("Skipping Enum update (not required/supported on SQLite).")

            logger.info("Migration completed.")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate_workspaces_config())
