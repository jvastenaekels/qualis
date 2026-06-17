"""Regression tests for the documented demo fixtures.

Covers the three files that back ``seed_demo.py`` / ``make demo-seed``:
the study design, the curated concourse, and the synthetic filled Q-sorts.
"""

import json
from collections import Counter
from copy import deepcopy
from pathlib import Path

from app.models.base import ConcourseItemStatus
from app.schemas.concourses import (
    ConcourseCreate,
    ConcourseItemCommentCreate,
    ConcourseItemCreate,
)
from app.schemas.participants import SubmissionInput
from app.schemas.studies import StudyCreate
from app.utils.script_utils import APIClient

DATA = Path(__file__).resolve().parents[2] / "data"
EXAMPLE_STUDY = DATA / "example-study.json"
EXAMPLE_CONCOURSE = DATA / "example-study.concourse.json"
EXAMPLE_SORTS = DATA / "example-study.sorts.json"
AUDIO_DIR = DATA / "audio"
AUDIO_MANIFEST = AUDIO_DIR / "manifest.json"

BELL_DISTRIBUTION = {-4: 1, -3: 2, -2: 3, -1: 4, 0: 5, 1: 4, 2: 3, 3: 2, 4: 1}


def _load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _study_statement_text(study: dict[str, object]) -> dict[str, dict[str, str]]:
    statements = study["statements"]
    assert isinstance(statements, list)
    return {s["code"]: s["translations"] for s in statements}


# --------------------------------------------------------------------------
# Study design
# --------------------------------------------------------------------------


def test_example_study_is_bioeconomy_futures_demo() -> None:
    study = _load(EXAMPLE_STUDY)
    translations = study["translations"]
    assert isinstance(translations, dict)

    en = translations["en"]
    fr = translations["fr"]
    assert isinstance(en, dict)
    assert isinstance(fr, dict)

    assert study["slug"] == "bioeconomy-futures"
    assert study["default_language"] == "en"
    assert "default_language_code" not in study
    assert en["title"] == "Bioeconomy Futures"
    assert fr["title"] == "Futurs de la bioéconomie"

    searchable = json.dumps(study, ensure_ascii=False).lower()
    for term in ("bioeconomy", "bioéconomie", "jrc"):
        assert term in searchable
    # The demo was rebranded away from the hemp-specific framing.
    assert "hemp" not in searchable
    assert "chanvre" not in searchable


def test_example_study_grid_is_bell_shaped_and_matches_statement_count() -> None:
    study = _load(EXAMPLE_STUDY)
    grid_config = study["grid_config"]
    statements = study["statements"]
    assert isinstance(grid_config, list)
    assert isinstance(statements, list)

    assert [col["score"] for col in grid_config] == list(range(-4, 5))
    assert [col["capacity"] for col in grid_config] == [1, 2, 3, 4, 5, 4, 3, 2, 1]
    assert sum(col["capacity"] for col in grid_config) == len(statements) == 25


def test_example_study_statements_are_bilingual() -> None:
    study = _load(EXAMPLE_STUDY)
    statements = study["statements"]
    assert isinstance(statements, list)

    for statement in statements:
        translations = statement["translations"]
        assert translations["en"]
        assert translations["fr"]


def test_example_study_uses_current_translation_fields() -> None:
    study = _load(EXAMPLE_STUDY)
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


def test_example_study_has_bilingual_presort_questionnaire() -> None:
    study = _load(EXAMPLE_STUDY)
    presort = study["presort_config"]
    assert isinstance(presort, dict)
    assert presort.get("enabled") is True
    fields = presort["fields"]
    assert isinstance(fields, dict)
    assert fields  # at least one pre-sort question
    for field in fields.values():
        label = field["label"]
        assert label["en"] and label["fr"]


def test_example_study_has_text_audio_postsort_question() -> None:
    study = _load(EXAMPLE_STUDY)
    questions = study["postsort_config"]["questions"]
    assert isinstance(questions, dict)
    audio_qs = {k: q for k, q in questions.items() if q.get("type") == "text_audio"}
    assert audio_qs, "demo should expose a text_audio post-sort question"
    for q in audio_qs.values():
        assert q["label"]["en"] and q["label"]["fr"]


def test_example_study_validates_against_create_schema_after_seed_transform() -> None:
    study = _load(EXAMPLE_STUDY)
    transformed = APIClient.transform_study_data(deepcopy(study))
    StudyCreate.model_validate(transformed)


# --------------------------------------------------------------------------
# Concourse
# --------------------------------------------------------------------------


def _concourse_final_state(item: dict[str, object]) -> tuple[str, dict[str, str]]:
    status = item["create_status"]
    translations = item["translations"]
    for rev in item.get("revisions", []):
        if rev.get("status"):
            status = rev["status"]
        if rev.get("translations"):
            translations = rev["translations"]
    return status, translations


def test_example_concourse_items_validate_against_schemas() -> None:
    concourse = _load(EXAMPLE_CONCOURSE)
    ConcourseCreate.model_validate(
        {"title": concourse["title"], "description": concourse.get("description")}
    )
    items = concourse["items"]
    assert isinstance(items, list)
    codes = [item["code"] for item in items]
    assert len(codes) == len(set(codes))  # unique within the concourse

    for item in items:
        ConcourseItemCreate.model_validate(
            {
                "code": item["code"],
                "source": item.get("source"),
                "status": item["create_status"],
                "translations": [
                    {"language_code": lang, "text": text}
                    for lang, text in item["translations"].items()
                ],
            }
        )
        for rev in item.get("revisions", []):
            assert rev["change_comment"]
            assert len(rev["change_comment"]) <= 500
            if rev.get("status"):
                ConcourseItemStatus(rev["status"])
        for body in item.get("comments", []):
            ConcourseItemCommentCreate.model_validate({"body": body})


def test_example_concourse_has_accepted_rejected_and_proposed_items() -> None:
    concourse = _load(EXAMPLE_CONCOURSE)
    items = concourse["items"]
    assert isinstance(items, list)
    statuses = Counter(_concourse_final_state(item)[0] for item in items)
    assert statuses["accepted"] >= 1
    assert statuses["rejected"] >= 1
    assert statuses["proposed"] >= 1
    # The curation history (edits + comments) is what the demo showcases.
    assert sum(len(item.get("revisions", [])) for item in items) >= 1
    assert sum(len(item.get("comments", [])) for item in items) >= 1


def test_example_concourse_accepted_items_match_study_qset() -> None:
    """Every accepted concourse item's final text must equal the study Q-set."""
    study = _load(EXAMPLE_STUDY)
    study_text = _study_statement_text(study)
    concourse = _load(EXAMPLE_CONCOURSE)
    items = concourse["items"]
    assert isinstance(items, list)

    accepted = {}
    for item in items:
        status, translations = _concourse_final_state(item)
        if status == "accepted":
            accepted[item["code"]] = translations

    assert set(accepted) == set(study_text)
    for code, translations in accepted.items():
        for lang in ("en", "fr"):
            assert translations[lang] == study_text[code][lang]


# --------------------------------------------------------------------------
# Filled Q-sorts
# --------------------------------------------------------------------------


def test_example_sorts_cover_every_statement_with_forced_distribution() -> None:
    study = _load(EXAMPLE_STUDY)
    codes = set(_study_statement_text(study))
    sorts = _load(EXAMPLE_SORTS)
    assert len(sorts) >= 9  # a meaningful set for factor analysis

    for pid, participant in sorts.items():
        qsort = participant["qsort"]
        assert set(qsort) == codes, f"{pid} does not cover every statement"
        assert Counter(qsort.values()) == BELL_DISTRIBUTION, (
            f"{pid} breaks the distribution"
        )


def test_example_sorts_answers_match_study_options() -> None:
    study = _load(EXAMPLE_STUDY)
    persp_opts = {
        o["value"]
        for o in study["postsort_config"]["questions"]["q_perspective"]["options"]
    }
    sector_opts = {
        o["value"] for o in study["presort_config"]["fields"]["sector"]["options"]
    }
    codes = set(_study_statement_text(study))
    sorts = _load(EXAMPLE_SORTS)

    for pid, participant in sorts.items():
        assert participant["postsort"]["q_perspective"] in persp_opts, pid
        assert participant["presort"]["sector"] in sector_opts, pid
        assert participant["language"] in ("en", "fr"), pid
        for code in participant.get("card_comments", {}):
            assert code in codes, f"{pid} card comment on unknown code {code}"


def test_example_sorts_are_submission_ready() -> None:
    """Each sort validates against SubmissionInput once codes map to ids."""
    study = _load(EXAMPLE_STUDY)
    codes = sorted(_study_statement_text(study))
    code_to_id = {code: i + 1 for i, code in enumerate(codes)}
    sorts = _load(EXAMPLE_SORTS)

    for participant in sorts.values():
        card_comments = participant.get("card_comments", {})
        qsort = [
            {
                "statement_id": code_to_id[code],
                "grid_score": score,
                "card_comment": card_comments.get(code),
            }
            for code, score in participant["qsort"].items()
        ]
        postsort_answers = {
            "questions_answers": participant["postsort"],
            "card_comments": {
                str(code_to_id[code]): text for code, text in card_comments.items()
            },
            "general_comment": participant.get("general_comment", ""),
            "missing_statement": participant.get("missing_statement", ""),
        }
        SubmissionInput.model_validate(
            {
                "study_slug": study["slug"],
                "session_token": "11111111-1111-1111-1111-111111111111",
                "language_used": participant["language"],
                "status": "completed",
                "presort_answers": participant["presort"],
                "qsort": qsort,
                "postsort_answers": postsort_answers,
            }
        )


# --------------------------------------------------------------------------
# Audio comments
# --------------------------------------------------------------------------


def test_example_audio_manifest_is_consistent_with_clips_study_and_sorts() -> None:
    """Each audio clip references a real file, a real participant, the
    text_audio question, and a language matching that participant's sort."""
    study = _load(EXAMPLE_STUDY)
    audio_questions = {
        k
        for k, q in study["postsort_config"]["questions"].items()
        if q.get("type") == "text_audio"
    }
    sorts = _load(EXAMPLE_SORTS)
    manifest = _load(AUDIO_MANIFEST)
    assert manifest, "audio manifest should not be empty"

    for pid, info in manifest.items():
        assert pid in sorts, f"audio manifest references unknown participant {pid}"
        assert info["question_key"] in audio_questions, pid
        assert info["language"] == sorts[pid]["language"], pid
        assert info["duration_seconds"] > 0
        clip = AUDIO_DIR / info["file"]
        assert clip.is_file(), f"missing audio clip {clip}"
        assert clip.stat().st_size > 0, f"empty audio clip {clip}"
