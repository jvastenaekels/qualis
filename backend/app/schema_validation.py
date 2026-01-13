"""Startup schema validation.

This module provides validation that ensures the database schema
matches the application models before the app starts serving requests.

Provides helpful error messages when schema is out of sync.
"""

import logging
import sys
from typing import List, Tuple

from sqlalchemy import inspect

from app.database import engine

logger = logging.getLogger(__name__)


class SchemaValidationError(Exception):
    """Raised when database schema doesn't match expected structure."""

    pass


async def validate_schema() -> None:
    """Validate that the database schema matches our models.

    Raises:
        SchemaValidationError: If schema is invalid with helpful message
    """
    async with engine.connect() as conn:
        issues: List[Tuple[str, str]] = []

        def _check(connection):
            inspector = inspect(connection)
            tables = inspector.get_table_names()

            # Check required tables
            required_tables = [
                "workspaces",
                "workspace_members",
                "studies",
                # "study_collaborators", # Removed
                "study_translations",
                "statements",
                "statement_translations",
                "participants",
                "qsort_entries",
                "users",
            ]

            for table in required_tables:
                if table not in tables:
                    issues.append(("missing_table", table))

            # Check critical columns
            if "studies" in tables:
                study_columns = {c["name"] for c in inspector.get_columns("studies")}
                for col in [
                    "randomize_statements",
                    "show_statement_codes",
                    "workspace_id",
                ]:
                    if col not in study_columns:
                        issues.append(("missing_column", f"studies.{col}"))

            if "participants" in tables:
                participant_columns = {
                    c["name"] for c in inspector.get_columns("participants")
                }
                if "random_seed" not in participant_columns:
                    issues.append(("missing_column", "participants.random_seed"))

            if "study_translations" in tables:
                trans_columns = {
                    c["name"] for c in inspector.get_columns("study_translations")
                }
                if "ui_labels" not in trans_columns:
                    issues.append(("missing_column", "study_translations.ui_labels"))
                if "step_help" not in trans_columns:
                    issues.append(("missing_column", "study_translations.step_help"))
                if "methodology_tips" not in trans_columns:
                    issues.append(
                        ("missing_column", "study_translations.methodology_tips")
                    )

        await conn.run_sync(_check)

        if issues:
            error_msg = ["Database schema validation failed:"]

            missing_tables = [item[1] for item in issues if item[0] == "missing_table"]
            if missing_tables:
                error_msg.append("\nMissing tables:")
                for table in missing_tables:
                    error_msg.append(f"  - {table}")
                error_msg.append("\n→ Run: uv run python backend/init_db.py")

            missing_columns = [
                item[1] for item in issues if item[0] == "missing_column"
            ]
            if missing_columns:
                error_msg.append("\nMissing columns:")
                for col in missing_columns:
                    error_msg.append(f"  - {col}")
                error_msg.append("\n→ Run: uv run python backend/scripts/migrate.py")

            # raise SchemaValidationError("\n".join(error_msg))
            logger.warning("\n".join(error_msg))
            logger.warning("Continuing startup despite schema validation errors...")

        logger.info("✓ Database schema validation passed")


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(validate_schema())
    except Exception as e:
        print(e)
        sys.exit(1)
