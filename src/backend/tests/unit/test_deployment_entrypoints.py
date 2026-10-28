"""Exercise deployment entrypoints without touching a deployed database."""

import os
import re
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


def test_nginx_body_limit_covers_audio_limit():
    from app.core.config import Settings

    nginx_conf = (BACKEND.parents[1] / "src/frontend/nginx.conf").read_text()
    start = nginx_conf.index("location /api/ {")
    api_block = nginx_conf[start : nginx_conf.index("\n    }", start)]
    match = re.search(r"client_max_body_size\s+(\d+)m;", api_block)
    assert match, "location /api/ must set client_max_body_size (nginx default is 1m)"
    assert int(match.group(1)) >= Settings().AUDIO_MAX_FILE_SIZE_MB + 1


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


@pytest.fixture
def lifespan_without_schema_check(monkeypatch):
    """Run the real lifespan, skipping its database schema check."""
    import app.schema_validation

    async def no_schema_check(*args, **kwargs):
        return None

    monkeypatch.setattr(app.schema_validation, "validate_schema", no_schema_check)


@pytest.mark.asyncio
async def test_production_refuses_default_secret_key(
    monkeypatch, lifespan_without_schema_check
):
    from app.core.config import settings
    from app.main import _INSECURE_DEFAULT_SENTINEL, app, lifespan

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", _INSECURE_DEFAULT_SENTINEL)
    monkeypatch.setattr(settings, "IP_HASH_SALT", "a-real-salt")
    with pytest.raises(
        RuntimeError, match="SECRET_KEY is the published development default"
    ):
        async with lifespan(app):
            pass


@pytest.mark.asyncio
async def test_production_refuses_default_ip_hash_salt(
    monkeypatch, lifespan_without_schema_check
):
    from app.core.config import settings
    from app.main import _INSECURE_DEFAULT_SENTINEL, app, lifespan

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "a-real-secret")
    monkeypatch.setattr(settings, "IP_HASH_SALT", _INSECURE_DEFAULT_SENTINEL)
    with pytest.raises(
        RuntimeError, match="IP_HASH_SALT is the published development default"
    ):
        async with lifespan(app):
            pass


@pytest.mark.asyncio
@pytest.mark.parametrize("environment", ["staging", "test", "development"])
async def test_non_production_keeps_warning_on_default_secrets(
    monkeypatch, lifespan_without_schema_check, environment
):
    from app.core.config import settings
    from app.main import _INSECURE_DEFAULT_SENTINEL, app, lifespan

    monkeypatch.setattr(settings, "ENVIRONMENT", environment)
    monkeypatch.setattr(settings, "SECRET_KEY", _INSECURE_DEFAULT_SENTINEL)
    monkeypatch.setattr(settings, "IP_HASH_SALT", _INSECURE_DEFAULT_SENTINEL)
    async with lifespan(app):
        pass
