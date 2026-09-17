"""End-to-end check of migration ``normalise_presort_config_shape``.

Same strategy as ``test_memo_migration.py``: drive Alembic as a subprocess
against the isolated test database, seed rows at the previous revision
with raw SQL, upgrade, assert with raw SQL. This exercises the migration's
own SQL and JSON handling, not the Pydantic model.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import asyncpg
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_BIN = BACKEND_DIR / ".venv" / "bin" / "alembic"
PREV_REVISION = "d2a989f21f92"
RAW_TEST_DSN = TEST_DATABASE_URL.replace("+asyncpg", "")

LEGACY_FIELDS = {
    "age": {"type": "number", "label": {"en": "Age"}, "required": True},
    "gender": {"type": "select", "label": {"en": "Gender"}, "options": []},
}


def _alembic(*args: str) -> None:
    env = {**os.environ, "DATABASE_URL": TEST_DATABASE_URL}
    result = subprocess.run(
        [str(ALEMBIC_BIN), *args],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.returncode == 0, (
        f"alembic {' '.join(args)} failed\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )


async def _reset_schema() -> None:
    engine = create_async_engine(TEST_DATABASE_URL)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
            await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
    finally:
        await engine.dispose()


async def _seed_studies(configs: dict[str, dict | None]) -> None:
    conn = await asyncpg.connect(RAW_TEST_DSN)
    try:
        user_id = await conn.fetchval(
            "INSERT INTO users (email, hashed_password, is_active, is_superuser, "
            "is_totp_enabled) VALUES ('m@example.org', 'x', TRUE, FALSE, FALSE) RETURNING id"
        )
        project_id = await conn.fetchval(
            "INSERT INTO projects (title, slug, config) "
            "VALUES ('P', 'p', '{}'::json) RETURNING id"
        )
        await conn.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')",
            project_id,
            user_id,
        )
        for slug, cfg in configs.items():
            await conn.execute(
                "INSERT INTO studies (slug, project_id, state, grid_config, presort_config, "
                "postsort_config, show_statement_codes, randomize_statement_order, "
                "symmetry_lock, rough_sort_enabled, distribution_mode) "
                "VALUES ($1, $2, 'draft', '[]'::json, $3::json, '{}'::json, "
                "FALSE, FALSE, TRUE, TRUE, 'forced')",
                slug,
                project_id,
                json.dumps(cfg) if cfg is not None else None,
            )
    finally:
        await conn.close()


async def _read_configs() -> dict[str, dict | None]:
    conn = await asyncpg.connect(RAW_TEST_DSN)
    try:
        rows = await conn.fetch("SELECT slug, presort_config::text FROM studies")
        return {
            r["slug"]: (json.loads(r[1]) if r[1] is not None else None) for r in rows
        }
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_upgrade_rewrites_every_stored_shape_to_the_wrapped_form() -> None:
    await _reset_schema()
    try:
        _alembic("upgrade", PREV_REVISION)
        await _seed_studies(
            {
                "flat": LEGACY_FIELDS,
                "empty": {},
                "switch-only": {"enabled": False},
                "wrapped": {"enabled": True, "fields": LEGACY_FIELDS, "intro": "hi"},
            }
        )

        _alembic("upgrade", "head")

        after = await _read_configs()
        assert after["flat"] == {"enabled": True, "fields": LEGACY_FIELDS}
        assert after["empty"] == {"enabled": True, "fields": {}}
        assert after["switch-only"] == {"enabled": False, "fields": {}}
        assert after["wrapped"] == {
            "enabled": True,
            "fields": LEGACY_FIELDS,
            "intro": "hi",
        }

        # Idempotent: a second pass changes nothing.
        _alembic("downgrade", PREV_REVISION)
        _alembic("upgrade", "head")
        assert await _read_configs() == after
    finally:
        await _reset_schema()
