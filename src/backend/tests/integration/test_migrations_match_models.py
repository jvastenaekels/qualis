"""The Alembic chain must produce exactly the schema the models declare.

Every other test builds its schema with ``Base.metadata.create_all`` and
never touches a migration, so a column added to a model without a
migration — or a migration that drifts from the model — passed the whole
suite green. Production, which only ever runs ``alembic upgrade head``,
was the first place to notice. Startup schema validation was meant to
catch this and could not: its table list was hard-coded (9 of 23) and its
failure path logged a warning (wave 7 rewrote it, see
``app/schema_validation.py``).

This test upgrades an empty database to head and asks Alembic's own
autogenerate comparison what it would still want to change. The answer
must be nothing.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Connection, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.database import Base
from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_BIN = BACKEND_DIR / ".venv" / "bin" / "alembic"


def _alembic_upgrade_head() -> None:
    env = {**os.environ, "DATABASE_URL": TEST_DATABASE_URL}
    result = subprocess.run(
        [str(ALEMBIC_BIN), "upgrade", "head"],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, (
        f"alembic upgrade head failed\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )


def _diffs(sync_conn: Connection) -> list[str]:
    ctx = MigrationContext.configure(sync_conn)
    raw = compare_metadata(ctx, Base.metadata)
    out: list[str] = []
    for diff in raw:
        entry = diff[0] if isinstance(diff, list) else diff
        kind = entry[0]
        # Alembic's own bookkeeping table is not a model.
        if kind == "remove_table" and entry[1].name == "alembic_version":
            continue
        out.append(repr(entry))
    return out


@pytest.mark.asyncio
async def test_alembic_head_matches_models() -> None:
    engine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))

        _alembic_upgrade_head()

        async with engine.connect() as conn:
            diffs = await conn.run_sync(_diffs)

        assert diffs == [], (
            "The models and the migration head disagree. Either write the "
            "missing migration (`make migration-new`, then prune it to the "
            "intended change) or fix the model:\n  " + "\n  ".join(diffs)
        )
    finally:
        # Leave the empty slate the other fixtures assume.
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        await engine.dispose()
