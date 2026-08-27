from pathlib import Path


def test_startup_does_not_log_raw_database_url() -> None:
    source = Path("app/main.py").read_text(encoding="utf-8")

    assert "settings.DATABASE_URL" not in source
    assert "DATABASE_URL is" not in source
