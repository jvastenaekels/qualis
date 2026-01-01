"""Tests for resolve_translation in StudyService."""

from app.models import Study, StudyTranslation
from app.services.study_service import StudyService


def test_resolve_translation_found_requested():
    """Should return requested language if available."""
    t_en = StudyTranslation(language_code="en", title="English")
    t_fr = StudyTranslation(language_code="fr", title="French")
    study = Study(translations=[t_en, t_fr], default_language="en")

    lang, trans = StudyService.resolve_translation(study, "fr")
    assert lang == "fr"
    assert trans == t_fr


def test_resolve_translation_use_default():
    """Should fallback to study default if requested not found."""
    t_en = StudyTranslation(language_code="en", title="English")
    study = Study(translations=[t_en], default_language="en")

    lang, trans = StudyService.resolve_translation(study, "fr")
    assert lang == "en"
    assert trans == t_en


def test_resolve_translation_use_english():
    """Should fallback to English if requested and default not found."""
    t_en = StudyTranslation(language_code="en", title="English")
    t_fi = StudyTranslation(language_code="fi", title="Finnish")
    # Case: Requested 'de' (NONE) -> Default 'it' (NONE) -> 'en' (FOUND)
    study_no_default_match = Study(translations=[t_en, t_fi], default_language="it")
    lang, trans = StudyService.resolve_translation(study_no_default_match, "de")
    assert lang == "en"
    assert trans == t_en


def test_resolve_translation_use_first_available():
    """Should fallback to first translation if English not found."""
    t_fi = StudyTranslation(language_code="fi", title="Finnish")
    study = Study(translations=[t_fi], default_language="it")

    lang, trans = StudyService.resolve_translation(study, "de")
    assert lang == "fi"
    assert trans == t_fi


def test_resolve_translation_none():
    """Should return 'en', None if no translations exist."""
    study = Study(translations=[], default_language="en")

    lang, trans = StudyService.resolve_translation(study, "fr")
    assert lang == "en"
    assert trans is None
