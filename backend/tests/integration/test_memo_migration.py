"""Integration tests for the memo_entries / memo_comments migration.

Tests run against the real test database (qualis_test) using alembic's
Python API for upgrade/downgrade and asyncpg for raw SQL seeding and
assertions.

Strategy
--------
Each test:
  1. Tears down and rebuilds the test DB to a known schema state using
     alembic stamp + downgrade so it sits at revision 8b649314aa4a
     (the revision immediately before the memo migration).
  2. Seeds data via asyncpg at that schema level.
  3. Runs upgrade to the memo migration (db2ad904b167).
  4. Asserts via raw SQL.

This approach avoids the conftest.py Base.metadata.create_all path (which
has no knowledge of migration-specific schema states) and exercises the
actual migration SQL end-to-end.
"""

import os
import subprocess
from pathlib import Path

import asyncpg
import pytest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_BIN = BACKEND_DIR / ".venv" / "bin" / "alembic"

# Previous revision (before the memo migration)
PREV_REVISION = "8b649314aa4a"
# The migration under test
MEMO_REVISION = "db2ad904b167"

# Raw asyncpg DSN (no driver prefix)
RAW_TEST_DSN = os.getenv(
    "TEST_ASYNCPG_DSN",
    "postgresql://julien:xK7mQ9vR2pLw@localhost/qualis_test",
)

# SQLAlchemy-compatible URL for alembic subprocess
SQLALCHEMY_TEST_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://julien:xK7mQ9vR2pLw@localhost/qualis_test",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_alembic(*args: str) -> None:
    """Run an alembic command against the test database.

    The alembic env.py reads SQLALCHEMY_DATABASE_URL from app.database,
    which is assembled from the DATABASE_URL pydantic-settings field.
    We override DATABASE_URL so that alembic points at the test DB.
    """
    env = {**os.environ, "DATABASE_URL": SQLALCHEMY_TEST_URL}
    result = subprocess.run(
        [str(ALEMBIC_BIN), *args],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"alembic {' '.join(args)} failed:\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )


async def _get_conn() -> asyncpg.Connection:
    return await asyncpg.connect(RAW_TEST_DSN)


async def _wipe_application_data() -> None:
    """Truncate all application data tables (FK-safe via CASCADE).

    Called while the DB is at PREV_REVISION (concourses has construction_memo,
    studies has methodology_memo; memo_entries / memo_comments do not exist).
    """
    conn = await _get_conn()
    try:
        await conn.execute("TRUNCATE concourses CASCADE")
        await conn.execute("TRUNCATE studies CASCADE")
        await conn.execute("TRUNCATE projects CASCADE")
        await conn.execute("TRUNCATE users CASCADE")
    finally:
        await conn.close()


async def _seed_minimal_project_user(conn: asyncpg.Connection) -> tuple[int, int]:
    """Insert a minimal user and project; return (user_id, project_id)."""
    user_id: int = await conn.fetchval(
        """
        INSERT INTO users (email, hashed_password, is_active, is_superuser, is_totp_enabled)
        VALUES ($1, 'x', TRUE, FALSE, FALSE)
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
        RETURNING id
        """,
        "migtest@example.com",
    )
    project_id: int = await conn.fetchval(
        """
        INSERT INTO projects (title, slug, config)
        VALUES ('Mig Test Project', 'mig-test-project', '{}'::json)
        ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
        RETURNING id
        """,
    )
    await conn.execute(
        """
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT DO NOTHING
        """,
        project_id,
        user_id,
    )
    return user_id, project_id


async def _seed_concourse(
    conn: asyncpg.Connection, project_id: int, memo: str | None
) -> int:
    """Insert a concourse with the given construction_memo; return id."""
    return await conn.fetchval(
        """
        INSERT INTO concourses (project_id, title, description, construction_memo)
        VALUES ($1, 'Test Concourse', 'desc', $2)
        RETURNING id
        """,
        project_id,
        memo,
    )


async def _seed_study(
    conn: asyncpg.Connection, project_id: int, memo: str | None
) -> int:
    """Insert a study with the given methodology_memo; return id."""
    import uuid

    study_id: int = await conn.fetchval(
        """
        INSERT INTO studies (
            slug, project_id, state, grid_config,
            presort_config, postsort_config, methodology_memo,
            show_statement_codes, randomize_statement_order, symmetry_lock
        )
        VALUES (
            $1, $2, 'draft',
            '[]'::json, '{}'::json, '{}'::json, $3,
            FALSE, FALSE, FALSE
        )
        RETURNING id
        """,
        f"mig-test-study-{uuid.uuid4()}",
        project_id,
        memo,
    )
    return study_id


def _schema_has_users_table() -> bool:
    """Return True if the 'users' table exists in the test DB (sync, via psql subprocess)."""
    result = subprocess.run(
        [
            "psql",
            RAW_TEST_DSN,
            "-tAc",
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name='users'",
        ],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() == "1"


def _reset_schema_to_prev_revision() -> None:
    """Ensure the DB schema is at exactly PREV_REVISION.

    Handles two starting states:
      A. Schema is intact (DB is at some alembic revision with real tables):
         upgrade to head (idempotent if already there) then downgrade.
      B. Schema was wiped by conftest drop_all (only alembic_version remains,
         alembic_version is stale): stamp base, upgrade head from scratch,
         then downgrade.
    """
    if _schema_has_users_table():
        # Intact schema: upgrade then downgrade.
        _run_alembic("upgrade", "head")
        _run_alembic("downgrade", PREV_REVISION)
    else:
        # Wiped schema: reset alembic tracking and rebuild from scratch.
        _run_alembic("stamp", "base")
        _run_alembic("upgrade", "head")
        _run_alembic("downgrade", PREV_REVISION)


def _upgrade_to_memo_revision() -> None:
    _run_alembic("upgrade", MEMO_REVISION)


def _restore_to_prev_revision() -> None:
    """Downgrade back to PREV_REVISION after each test.

    Leaves the DB without memo_entries / memo_comments so that the conftest
    Base.metadata.drop_all used by other integration tests does not trip on
    FK constraints from tables not yet in the SQLAlchemy model registry.
    """
    _run_alembic("downgrade", PREV_REVISION)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upgrade_migrates_concourse_memo_into_entry() -> None:
    """Non-empty construction_memo → exactly one memo_entries row (Notes, pos 0)."""
    _reset_schema_to_prev_revision()
    await _wipe_application_data()

    conn = await _get_conn()
    try:
        _, project_id = await _seed_minimal_project_user(conn)
        concourse_id = await _seed_concourse(conn, project_id, "Captured rationale.")
    finally:
        await conn.close()

    _upgrade_to_memo_revision()

    conn = await _get_conn()
    try:
        rows = await conn.fetch(
            """
            SELECT parent_type, parent_id, title, body, position
            FROM memo_entries
            WHERE parent_type = 'concourse' AND parent_id = $1
            """,
            concourse_id,
        )
        assert len(rows) == 1, f"Expected 1 memo_entries row, got {len(rows)}"
        row = rows[0]
        assert row["parent_type"] == "concourse"
        assert row["parent_id"] == concourse_id
        assert row["title"] == "Notes"
        assert row["body"] == "Captured rationale."
        assert row["position"] == 0
    finally:
        await conn.close()
        _restore_to_prev_revision()


@pytest.mark.asyncio
async def test_upgrade_skips_empty_study_memo() -> None:
    """Empty / whitespace-only methodology_memo → no memo_entries row for that study."""
    _reset_schema_to_prev_revision()
    await _wipe_application_data()

    conn = await _get_conn()
    try:
        _, project_id = await _seed_minimal_project_user(conn)
        study_id = await _seed_study(conn, project_id, "   ")  # whitespace only
    finally:
        await conn.close()

    _upgrade_to_memo_revision()

    conn = await _get_conn()
    try:
        count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM memo_entries
            WHERE parent_type = 'study' AND parent_id = $1
            """,
            study_id,
        )
        assert count == 0, (
            f"Expected 0 memo_entries for study with whitespace memo, got {count}"
        )
    finally:
        await conn.close()
        _restore_to_prev_revision()


@pytest.mark.asyncio
async def test_upgrade_aborts_on_oversized_memo() -> None:
    """A 10001-char construction_memo causes upgrade to abort with the cap message."""
    _reset_schema_to_prev_revision()
    await _wipe_application_data()

    oversized = "x" * 10001
    conn = await _get_conn()
    try:
        _, project_id = await _seed_minimal_project_user(conn)
        await _seed_concourse(conn, project_id, oversized)
    finally:
        await conn.close()

    with pytest.raises(RuntimeError, match="10000-char cap"):
        _upgrade_to_memo_revision()

    # The migration rolled back (PostgreSQL DDL is transactional).
    # Remove the oversized concourse before restoring to head so the next
    # upgrade succeeds on clean data.
    await _wipe_application_data()
    _restore_to_prev_revision()
