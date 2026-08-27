"""End-to-end policy tests: participant strict, admin best-effort.

Copies the real locales tree to tmpdir, mutates it to simulate failure
modes, and runs check_i18n() programmatically (no subprocess).
"""
import json
import shutil
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "frontend" / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "frontend" / "scripts" / "i18n"))

import check_i18n  # noqa: E402

SRC_LOCALES = REPO_ROOT / "frontend" / "public" / "locales"


@pytest.fixture
def locales_copy(tmp_path):
    dst = tmp_path / "locales"
    shutil.copytree(SRC_LOCALES, dst)
    return dst


def remove_key_from(json_path: Path, dotted_key: str) -> None:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    parts = dotted_key.split(".")
    node = data
    for p in parts[:-1]:
        node = node[p]
    del node[parts[-1]]
    json_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=4) + "\n", encoding="utf-8"
    )


def test_baseline_passes(locales_copy):
    """Untouched locale tree should pass."""
    rc = check_i18n.check_i18n(str(locales_copy))
    assert rc == 0


def test_missing_admin_key_warns_but_passes(locales_copy, capsys):
    """Removing an admin key in fr produces a warning, exit 0."""
    remove_key_from(locales_copy / "fr" / "admin.json", "admin.hub.title")
    rc = check_i18n.check_i18n(str(locales_copy))
    captured = capsys.readouterr()
    assert rc == 0
    assert "⚠️" in captured.out
    assert "admin.hub.title" in captured.out


def test_missing_participant_key_fails(locales_copy, capsys):
    """Removing a participant key in fr fails (exit 1)."""
    remove_key_from(locales_copy / "fr" / "participant.json", "common.next")
    rc = check_i18n.check_i18n(str(locales_copy))
    captured = capsys.readouterr()
    assert rc == 1
    assert "❌" in captured.out
    assert "common.next" in captured.out


def test_missing_admin_file_warns_but_passes(locales_copy, capsys):
    """Deleting fr/admin.json entirely warns but passes."""
    (locales_copy / "fr" / "admin.json").unlink()
    rc = check_i18n.check_i18n(str(locales_copy))
    captured = capsys.readouterr()
    assert rc == 0
    assert "⚠️" in captured.out
    assert "missing (best-effort" in captured.out


def test_missing_participant_file_fails(locales_copy, capsys):
    """Deleting fr/participant.json fails."""
    (locales_copy / "fr" / "participant.json").unlink()
    rc = check_i18n.check_i18n(str(locales_copy))
    captured = capsys.readouterr()
    assert rc == 1
    assert "❌" in captured.out
    assert "missing (required)" in captured.out
