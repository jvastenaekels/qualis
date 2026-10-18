"""Exercise deployment entrypoints without touching a deployed database."""

import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest


BACKEND = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    "url, accepted",
    [
        ("postgres://user:password@localhost/db", True),
        ("postgresql://user:password@localhost/db", True),
        ("postgresql+asyncpg://user:password@localhost/db", True),
        ("", False),
        ("sqlite:///postgresql.db", False),
        ("mysql://user:postgresql@localhost/db", False),
    ],
)
def test_postdeploy_checks_database_scheme_before_migrating(tmp_path, url, accepted):
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    shutil.copy(BACKEND / "scripts/postdeploy.py", scripts)
    (scripts / "migrate.py").write_text("print('MIGRATION_REACHED')\n")
    (tmp_path / "init_db.py").write_text("print('BOOTSTRAP_REACHED')\n")
    result = subprocess.run(
        [sys.executable, str(scripts / "postdeploy.py")],
        env={**os.environ, "DATABASE_URL": url},
        capture_output=True,
        text=True,
    )
    assert result.returncode == (0 if accepted else 1), result.stdout + result.stderr
    assert ("MIGRATION_REACHED" in result.stdout) == accepted
    assert ("BOOTSTRAP_REACHED" in result.stdout) == accepted


def test_alembic_accepts_percent_encoded_password():
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "8e32439881ce", "--sql"],
        cwd=BACKEND,
        env={
            **os.environ,
            "DATABASE_URL": "postgresql://user:pass%25word%40host@localhost/db",
        },
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "CREATE TABLE" in result.stdout
