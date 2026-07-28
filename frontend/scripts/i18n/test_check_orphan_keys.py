"""Unit tests for the orphan-key gate.

Builds a synthetic src/ + locales/ tree in tmpdir and runs
check_orphan_keys() programmatically (no subprocess), so the tests state
exactly which call-site shapes the scanner is expected to see and to miss.
"""
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "frontend" / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "frontend" / "scripts" / "i18n"))

import check_orphan_keys  # noqa: E402


@pytest.fixture
def tree(tmp_path):
    """Return (write_src, write_locale, run)."""
    src = tmp_path / "src"
    src.mkdir()
    locales = tmp_path / "locales"

    def write_src(name: str, body: str) -> None:
        (src / name).write_text(body, encoding="utf-8")

    def write_locale(lang: str, namespace: str, data: dict) -> None:
        d = locales / lang
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{namespace}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=4), encoding="utf-8"
        )

    def run() -> int:
        return check_orphan_keys.check_orphan_keys(str(src), str(locales))

    write_locale("en", "participant", {"common": {"next": "Next"}})
    write_locale("en", "admin", {"admin": {"x": {"y": "Y"}}})
    return write_src, write_locale, run


def test_resolvable_key_passes(tree):
    write_src, _, run = tree
    write_src("A.tsx", "export const A = () => <p>{t('admin.x.y', 'Y')}</p>;")
    assert run() == 0


def test_orphan_key_fails(tree):
    write_src, _, run = tree
    write_src("A.tsx", "export const A = () => <p>{t('admin.x.gone', 'Gone')}</p>;")
    assert run() == 1


def test_key_only_in_a_non_en_locale_still_resolves(tree):
    """The gate asks 'does this resolve anywhere', not 'is en complete'."""
    write_src, write_locale, run = tree
    write_locale("fr", "admin", {"admin": {"only_fr": "Seulement"}})
    write_src("A.tsx", "export const A = () => <p>{t('admin.only_fr')}</p>;")
    assert run() == 0


def test_plural_stem_resolves(tree):
    write_src, write_locale, run = tree
    write_locale(
        "en", "admin", {"admin": {"n_items_one": "1 item", "n_items_other": "{{count}} items"}}
    )
    write_src("A.tsx", "export const A = () => <p>{t('admin.n_items', { count: 2 })}</p>;")
    assert run() == 0


def test_template_literal_key_resolves_as_a_glob(tree):
    write_src, write_locale, run = tree
    write_locale("en", "admin", {"admin": {"tabs": {"grid": "Grid", "list": "List"}}})
    write_src("A.tsx", "export const A = () => <p>{t(`admin.tabs.${which}`)}</p>;")
    assert run() == 0


def test_template_literal_key_with_no_match_fails(tree):
    write_src, _, run = tree
    write_src("A.tsx", "export const A = () => <p>{t(`admin.nope.${which}`)}</p>;")
    assert run() == 1


def test_t_inside_a_comment_is_not_a_call_site(tree):
    write_src, _, run = tree
    write_src(
        "A.tsx",
        "// the t('admin.x.ghost') call below was removed\n"
        "/* also t('admin.x.ghost2') */\n"
        "export const A = () => <p>{t('admin.x.y')}</p>;",
    )
    assert run() == 0


def test_dotted_t_is_not_a_call_site(tree):
    write_src, _, run = tree
    write_src("A.tsx", "export const A = () => i18n.t('admin.x.ghost');")
    assert run() == 0


def test_test_files_are_skipped(tree):
    write_src, _, run = tree
    write_src("A.test.tsx", "it('x', () => { t('admin.x.ghost'); });")
    assert run() == 0


def test_deferred_key_does_not_fail_but_is_reported(tree, capsys, monkeypatch):
    write_src, _, run = tree
    monkeypatch.setitem(check_orphan_keys.DEFERRED, "admin.x.gone", "test reason")
    write_src("A.tsx", "export const A = () => <p>{t('admin.x.gone', 'Gone')}</p>;")
    assert run() == 0
    out = capsys.readouterr().out
    assert "admin.x.gone" in out
    assert "test reason" in out


def test_non_literal_first_arg_is_reported_as_blind(tree, capsys):
    write_src, _, run = tree
    write_src("A.tsx", "export const A = () => <p>{t(dynamicKey, fallback)}</p>;")
    assert run() == 0
    out = capsys.readouterr().out
    assert "BLIND to 1 call sites" in out
    assert "A.tsx:1" in out
