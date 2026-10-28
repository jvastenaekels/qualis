"""Settings normalises DATABASE_URL for asyncpg (database.py relies on it)."""

import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "postgres://u:p@h/db?sslmode=require",
            "postgresql+asyncpg://u:p@h/db",
        ),
        (
            "postgresql://u:p@h/db?sslmode=require",
            "postgresql+asyncpg://u:p@h/db",
        ),
        (
            "postgresql://u:p@h/db",
            "postgresql+asyncpg://u:p@h/db",
        ),
    ],
)
def test_settings_normalise_database_url(raw: str, expected: str) -> None:
    assert Settings(DATABASE_URL=raw).DATABASE_URL == expected
