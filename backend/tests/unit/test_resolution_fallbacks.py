import pytest
from uuid import uuid4
from app.models import Study, StudyTranslation, StudyState
from app.services.study_service import (
    StudyService,
    DEFAULT_TRANSLATION_CONTENT,
    DEFAULT_PROCESS_STEPS,
)


@pytest.mark.asyncio
async def test_resolved_config_uses_finnish_defaults():
    # Setup: Study with a Finnish translation that has missing fields
    t_fi = StudyTranslation(
        language_code="fi",
        title="Suomalainen tutkimus",
        # Missing: description, instructions, condition_of_instruction, etc.
    )
    study = Study(
        slug="fi-test",
        state=StudyState.draft,
        translations=[t_fi],
        default_language="fi",
        grid_config=[],
        presort_config={},
        postsort_config={},
        statements=[],
    )

    config = await StudyService.get_resolved_study_config(
        study, lang="fi", session_token=uuid4()
    )

    # Verify fallback to DEFAULT_TRANSLATION_CONTENT["fi"]
    assert config["language"] == "fi"
    assert config["title"] == "Suomalainen tutkimus"
    assert config["instructions"] == DEFAULT_TRANSLATION_CONTENT["fi"]["instructions"]
    assert (
        config["condition_of_instruction"]
        == DEFAULT_TRANSLATION_CONTENT["fi"]["condition_of_instruction"]
    )
    assert (
        config["pre_instruction"]
        == DEFAULT_TRANSLATION_CONTENT["fi"]["pre_instruction"]
    )
    assert (
        config["consent"]["title"] == DEFAULT_TRANSLATION_CONTENT["fi"]["consent_title"]
    )
    assert (
        config["consent"]["description"]
        == DEFAULT_TRANSLATION_CONTENT["fi"]["consent_description"]
    )
    assert (
        config["methodology_tips"]
        == DEFAULT_TRANSLATION_CONTENT["fi"]["methodology_tips"]
    )

    # Verify fallback for process_steps
    assert config["process_steps"] == DEFAULT_PROCESS_STEPS["fi"]


@pytest.mark.asyncio
async def test_resolved_config_uses_english_hardcoded_ultimate_fallback_for_condition():
    # Setup: Translation exists but no defaults for this random language
    t_xx = StudyTranslation(
        language_code="xx",
        title="Unknown Language",
    )
    study = Study(
        slug="xx-test",
        state=StudyState.draft,
        translations=[t_xx],
        default_language="xx",
        grid_config=[],
        presort_config={},
        postsort_config={},
        statements=[],
    )

    config = await StudyService.get_resolved_study_config(
        study, lang="xx", session_token=uuid4()
    )

    # Verify that it falls back to English default if lang "xx" not in DEFAULT_TRANSLATION_CONTENT
    assert (
        config["condition_of_instruction"]
        == DEFAULT_TRANSLATION_CONTENT["en"]["condition_of_instruction"]
    )


@pytest.mark.asyncio
async def test_resolved_config_no_translation_uses_default_language_content():
    # Setup: Study with only English translation, but we request Finnish, and study default is Finnish
    # Wait, if study default is fi but only en translation exists, resolve_translation will return "en"
    # as per current logic (Requested -> Default (Study) -> English -> First).

    t_en = StudyTranslation(
        language_code="en",
        title="English Study",
    )
    study = Study(
        slug="en-only",
        state=StudyState.draft,
        translations=[t_en],
        default_language="fi",  # Study default is Finnish
        grid_config=[],
        presort_config={},
        postsort_config={},
        statements=[],
    )

    # Requesting a language that doesn't exist.
    # resolve_translation(study, "de") -> will find nothing, then find "en" as per fallback logic.
    config = await StudyService.get_resolved_study_config(
        study, lang="de", session_token=uuid4()
    )

    assert config["language"] == "en"
    assert config["instructions"] == DEFAULT_TRANSLATION_CONTENT["en"]["instructions"]
