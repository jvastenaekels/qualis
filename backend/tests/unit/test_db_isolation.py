# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression guard for per-process test-database isolation.

Root cause of the recurring "passes in isolation, fails under the full
suite" flake: every test isolates via ``DROP SCHEMA public CASCADE`` on a
single shared database, so two concurrent ``pytest`` processes drop each
other's schema mid-test. ``conftest._derive_isolated_db`` namespaces the
database per process to make concurrent runs collision-proof. These tests
fail if that namespacing is reverted or broken.
"""

import os

from sqlalchemy.engine import make_url

from tests.conftest import (
    TEST_DATABASE_URL,
    _BASE_TEST_DATABASE_URL,
    _derive_isolated_db,
)


def test_active_url_is_namespaced_per_process() -> None:
    """The live URL must carry this process's pid, not the bare base name."""
    base_db = make_url(_BASE_TEST_DATABASE_URL).database or "qualis_test"
    active_db = make_url(TEST_DATABASE_URL).database
    assert active_db is not None
    assert active_db != base_db, "shared DB name — concurrent runs would collide"
    assert active_db.endswith(f"_{os.getpid()}")
    # And the process-wide env mirrors it (subprocess Alembic inherits this).
    assert os.environ["TEST_DATABASE_URL"] == TEST_DATABASE_URL


def test_derive_uses_base_db_for_maintenance() -> None:
    """CREATE/DROP runs over the base URL (no extra-privilege assumptions)."""
    _, maintenance_url, db_name = _derive_isolated_db()
    base_db = make_url(_BASE_TEST_DATABASE_URL).database
    assert make_url(maintenance_url).database == base_db
    # The per-process DB must differ from the base it is created from.
    assert db_name is not None and db_name != base_db


def test_opt_out_restores_shared_db(monkeypatch) -> None:
    """QUALIS_TEST_DB_ISOLATION=0 must fall back to the unnamespaced base."""
    monkeypatch.setenv("QUALIS_TEST_DB_ISOLATION", "0")
    test_url, maintenance_url, db_name = _derive_isolated_db()
    assert test_url == _BASE_TEST_DATABASE_URL
    assert maintenance_url == _BASE_TEST_DATABASE_URL
    assert db_name is None
