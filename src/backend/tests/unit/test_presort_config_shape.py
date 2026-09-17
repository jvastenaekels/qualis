"""presort_config has one shape: ``{"enabled": bool, "fields": {...}}``.

Two shapes coexisted in stored studies — the flat field map the first
versions wrote, and the wrapped form the designer writes since the on/off
switch was added — and three readers told them apart by sniffing keys
(export_service twice, StudyService activation checks), with the same
sniffing repeated in the frontend designer. The rule was always: ``fields``
present → wrapped; else ``enabled`` present → wrapped without fields; else
the whole dict is the field map.

That rule now lives in one place, ``PresortConfig``'s before-validator,
applied to every write path (create, update, import). Stored rows were
rewritten by migration ``normalise_presort_config_shape`` with the same
rule, so readers take ``config["fields"]`` and nothing else.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

import pytest

from app.schemas.studies import PresortConfig, StudyCreate, StudyUpdate

LEGACY = {
    "age": {"type": "number", "label": {"en": "Age"}, "required": True},
    "gender": {"type": "select", "label": {"en": "Gender"}, "options": []},
}
WRAPPED = {"enabled": False, "fields": LEGACY}


@pytest.mark.parametrize(
    "raw, expected",
    [
        (LEGACY, {"enabled": True, "fields": LEGACY}),
        ({}, {"enabled": True, "fields": {}}),
        ({"enabled": False}, {"enabled": False, "fields": {}}),
        ({"fields": LEGACY}, {"enabled": True, "fields": LEGACY}),
        (WRAPPED, WRAPPED),
    ],
)
def test_presort_config_canonicalises_every_known_shape(
    raw: dict[str, Any], expected: dict[str, Any]
) -> None:
    assert PresortConfig.model_validate(raw).model_dump() == expected


def test_presort_config_keeps_unknown_top_level_keys_of_the_wrapped_form() -> None:
    raw = {"enabled": True, "fields": {}, "intro": "Tell us about you"}
    assert PresortConfig.model_validate(raw).model_dump() == raw


def test_study_create_and_update_canonicalise_on_input() -> None:
    created = StudyCreate.model_validate(
        {
            "slug": "abc",
            "grid_config": [],
            "presort_config": LEGACY,
            "postsort_config": {},
            "translations": [],
        }
    )
    assert created.presort_config.model_dump() == {"enabled": True, "fields": LEGACY}

    updated = StudyUpdate.model_validate({"presort_config": {"enabled": False}})
    assert updated.presort_config is not None
    assert updated.presort_config.model_dump() == {"enabled": False, "fields": {}}


def _load_migration_normaliser():
    versions = Path(__file__).resolve().parents[2] / "db_migrations" / "versions"
    (path,) = versions.glob("*_normalise_presort_config_shape.py")
    spec = importlib.util.spec_from_file_location("mig", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.canonical_presort_config


@pytest.mark.parametrize(
    "raw", [LEGACY, {}, {"enabled": False}, {"fields": LEGACY}, WRAPPED]
)
def test_migration_applies_the_same_rule_as_the_schema(raw: dict[str, Any]) -> None:
    """The migration cannot import app code (it must keep working when the
    schema module changes), so it carries its own copy of the rule; this
    pins the two together."""
    canonical = _load_migration_normaliser()
    assert canonical(raw) == PresortConfig.model_validate(raw).model_dump()


def test_no_reader_sniffs_the_shape_any_more() -> None:
    app_dir = Path(__file__).resolve().parents[2] / "app"
    # schemas/studies.py is the one place the rule is allowed to live.
    offenders = [
        str(f.relative_to(app_dir))
        for f in app_dir.rglob("*.py")
        if f.name != "studies.py"
        and '"enabled" not in' in f.read_text(encoding="utf-8")
    ]
    assert offenders == []
