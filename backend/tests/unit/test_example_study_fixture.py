"""Regression tests for the documented demo study fixture."""

import json
from copy import deepcopy
from pathlib import Path

from app.schemas.studies import StudyCreate
from app.utils.script_utils import APIClient


EXAMPLE_STUDY = Path(__file__).resolve().parents[2] / "data" / "example-study.json"


def _load_example_study() -> dict[str, object]:
    return json.loads(EXAMPLE_STUDY.read_text(encoding="utf-8"))


def test_example_study_is_hemp_bioeconomy_demo() -> None:
    study = _load_example_study()
    translations = study["translations"]
    assert isinstance(translations, dict)

    en = translations["en"]
    fr = translations["fr"]
    assert isinstance(en, dict)
    assert isinstance(fr, dict)

    assert study["slug"] == "hemp-bioeconomy-futures"
    assert study["default_language"] == "en"
    assert "default_language_code" not in study
    assert en["title"] == "Hemp Bioeconomy Futures"
    assert fr["title"] == "Futurs de la bioéconomie du chanvre"

    searchable = json.dumps(study, ensure_ascii=False).lower()
    for term in ("hemp", "bioeconomy", "chanvre", "bioéconomie"):
        assert term in searchable


def test_example_study_grid_is_bell_shaped_and_matches_statement_count() -> None:
    study = _load_example_study()
    grid_config = study["grid_config"]
    statements = study["statements"]
    assert isinstance(grid_config, list)
    assert isinstance(statements, list)

    assert [col["score"] for col in grid_config] == list(range(-4, 5))
    assert [col["capacity"] for col in grid_config] == [1, 2, 3, 4, 5, 4, 3, 2, 1]
    assert sum(col["capacity"] for col in grid_config) == len(statements) == 25


def test_example_study_statements_are_bilingual() -> None:
    study = _load_example_study()
    statements = study["statements"]
    assert isinstance(statements, list)

    for statement in statements:
        translations = statement["translations"]
        assert translations["en"]
        assert translations["fr"]


def test_example_study_uses_current_translation_fields() -> None:
    study = _load_example_study()
    translations = study["translations"]
    assert isinstance(translations, dict)

    legacy_keys = {"instruction", "consent_text", "thank_you_text"}
    for translation in translations.values():
        assert isinstance(translation, dict)
        assert legacy_keys.isdisjoint(translation)
        assert translation["instructions"]
        assert translation["condition_of_instruction"]
        assert translation["consent_title"]
        assert translation["consent_description"]


def test_example_study_validates_against_create_schema_after_seed_transform() -> None:
    study = _load_example_study()
    transformed = APIClient.transform_study_data(deepcopy(study))

    StudyCreate.model_validate(transformed)
