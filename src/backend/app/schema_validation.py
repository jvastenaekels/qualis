"""Startup schema validation.

Compares the live database against every table and column the models
declare, so a deploy whose migrations did not run (or ran partially) is
named in the log before the first request fails on it.

Two callers, two policies:

* the application lifespan calls ``validate_schema()`` and continues on
  failure — a boot loop on a managed platform is worse than a loud log
  line, and the CI test ``test_migrations_match_models`` is the gate that
  keeps models and migrations from drifting in the first place;
* ``make check`` runs this module as a script with ``strict=True`` and
  exits non-zero on any issue.

Before wave 7 the check covered 9 tables of 23 from a hard-coded list and
logged "validation passed" unconditionally.
"""

import logging
import sys

from sqlalchemy import Connection, inspect
from sqlalchemy.ext.asyncio import AsyncEngine

import app.models  # noqa: F401  — registers every mapper on Base.metadata
from app.database import Base, engine as default_engine

logger = logging.getLogger(__name__)


class SchemaValidationError(Exception):
    """Raised in strict mode when the database lacks a modelled table or column."""


def _collect_issues(connection: Connection) -> list[str]:
    inspector = inspect(connection)
    existing_tables = set(inspector.get_table_names())
    issues: list[str] = []
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            issues.append(f"missing table {table.name}")
            continue
        existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name not in existing_columns:
                issues.append(f"missing column {table.name}.{column.name}")
    return issues


async def validate_schema(
    engine: AsyncEngine | None = None, *, strict: bool = False
) -> list[str]:
    """Return the list of modelled tables and columns the database lacks.

    Logs at ERROR with the remediation when the list is non-empty, and
    raises ``SchemaValidationError`` on top of that when ``strict``.
    """
    target = engine or default_engine
    async with target.connect() as conn:
        issues = await conn.run_sync(_collect_issues)

    if issues:
        lines = ["Database schema is out of sync with the application models:"]
        lines += [f"  - {issue}" for issue in issues]
        lines.append("→ Run the migrations: python src/backend/scripts/migrate.py")
        message = "\n".join(lines)
        logger.error(message)
        if strict:
            raise SchemaValidationError(message)
        return issues

    logger.info("✓ Database schema validation passed")
    return issues


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(validate_schema(strict=True))
    except Exception as e:
        logging.getLogger(__name__).error(e)
        sys.exit(1)
