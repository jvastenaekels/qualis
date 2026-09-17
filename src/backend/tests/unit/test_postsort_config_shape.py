"""postsort_config always carries its questions under ``questions``.

The oldest studies stored the post-sort question map at the root of the
column; every study since carries settings at the root (``extreme_columns``,
``prompts``, ``audio``, …) and the questions under ``questions``. The export
told the two apart with "no ``extreme_columns`` key → the dict is the
question map", which misreads any settings-only config: the create dialog
writes ``{"email": {...}, "consent": {...}}`` and the export turned those
two settings into question columns.

The rule is now structural and lives in ``PostsortConfig``: a config is a
flat question map only when it is non-empty, has no ``questions`` key, and
every value is a dict carrying a ``type``. Migration
``normalise_postsort_config_shape`` rewrote stored rows with the same rule;
readers take ``config["questions"]``.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

import pytest

from app.schemas.studies import PostsortConfig, StudyCreate

QUESTIONS = {
    "comment": {"type": "text", "label": {"en": "Comment"}},
    "email": {"type": "email", "label": {"en": "E-mail"}},
}
SETTINGS = {"extreme_columns": [-1, 1], "ask_missing": False, "audio": {"enabled": True}}
DIALOG_DEFAULT = {"email": {"enabled": False}, "consent": {"enabled": False}}


@pytest.mark.parametrize(
    "raw, expected",
    [
        (QUESTIONS, {"questions": QUESTIONS}),
        ({}, {"questions": {}}),
        (SETTINGS, {**SETTINGS, "questions": {}}),
        (DIALOG_DEFAULT, {**DIALOG_DEFAULT, "questions": {}}),
        ({"questions": QUESTIONS, **SETTINGS}, {"questions": QUESTIONS, **SETTINGS}),
    ],
)
def test_postsort_config_canonicalises_every_known_shape(
    raw: dict[str, Any], expected: dict[str, Any]
) -> None:
    assert PostsortConfig.model_validate(raw).model_dump() == expected


def test_settings_only_config_never_becomes_questions() -> None:
    """The create dialog's default has dict values without a type; it is
    settings, and the old export rule turned it into two question columns."""
    assert PostsortConfig.model_validate(DIALOG_DEFAULT).model_dump()["questions"] == {}


def test_study_create_canonicalises_on_input() -> None:
    created = StudyCreate.model_validate(
        {
            "slug": "abc",
            "grid_config": [],
            "presort_config": {},
            "postsort_config": QUESTIONS,
            "translations": [],
        }
    )
    assert created.postsort_config.model_dump() == {"questions": QUESTIONS}


def _load_migration_normaliser():
    versions = Path(__file__).resolve().parents[2] / "db_migrations" / "versions"
    (path,) = versions.glob("*_normalise_postsort_config_shape.py")
    spec = importlib.util.spec_from_file_location("mig", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.canonical_postsort_config


@pytest.mark.parametrize(
    "raw", [QUESTIONS, {}, SETTINGS, DIALOG_DEFAULT, {"questions": QUESTIONS, **SETTINGS}]
)
def test_migration_applies_the_same_rule_as_the_schema(raw: dict[str, Any]) -> None:
    canonical = _load_migration_normaliser()
    assert canonical(raw) == PostsortConfig.model_validate(raw).model_dump()


def test_no_reader_sniffs_the_shape_any_more() -> None:
    app_dir = Path(__file__).resolve().parents[2] / "app"
    offenders = [
        str(f.relative_to(app_dir))
        for f in app_dir.rglob("*.py")
        if f.name != "studies.py"
        and (
            '"extreme_columns" not in' in f.read_text(encoding="utf-8")
            or 'if "questions" in config else config' in f.read_text(encoding="utf-8")
        )
    ]
    assert offenders == []
