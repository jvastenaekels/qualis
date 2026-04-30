"""Unit tests for the rough-sort-aware study defaults builders."""

from app.services.study_defaults import (
    DEFAULT_PROCESS_STEPS,
    DEFAULT_TRANSLATION_CONTENT,
    build_process_steps,
    build_step_help,
)


def test_process_steps_excludes_rough_when_disabled_en() -> None:
    steps = build_process_steps(rough_sort_enabled=False, locale="en")
    ids = [s["id"] for s in steps]
    assert "rough" not in ids
    assert ids == ["profile", "fine", "post"]


def test_process_steps_includes_rough_when_enabled_fr() -> None:
    steps = build_process_steps(rough_sort_enabled=True, locale="fr")
    ids = [s["id"] for s in steps]
    assert "rough" in ids


def test_process_steps_unknown_locale_falls_back_to_en() -> None:
    steps = build_process_steps(rough_sort_enabled=True, locale="zz")
    ids = [s["id"] for s in steps]
    expected_ids = [s["id"] for s in DEFAULT_PROCESS_STEPS["en"]]
    assert ids == expected_ids


def test_process_steps_returns_copies_not_references() -> None:
    steps = build_process_steps(rough_sort_enabled=True, locale="en")
    steps[0]["title"] = "MUTATED"
    # Original constant must not be affected
    assert DEFAULT_PROCESS_STEPS["en"][0]["title"] != "MUTATED"


def test_step_help_excludes_rough_key_when_disabled_en() -> None:
    help_dict = build_step_help(rough_sort_enabled=False, locale="en")
    assert "rough" not in help_dict
    assert "fine" in help_dict
    assert "post" in help_dict
    assert "presort" in help_dict
    assert "welcome" in help_dict


def test_step_help_includes_rough_key_when_enabled_fi() -> None:
    help_dict = build_step_help(rough_sort_enabled=True, locale="fi")
    assert "rough" in help_dict
    assert "what" in help_dict["rough"]
    assert "why" in help_dict["rough"]


def test_step_help_returns_copies_not_references() -> None:
    help_dict = build_step_help(rough_sort_enabled=True, locale="en")
    help_dict["rough"]["what"] = "MUTATED"
    original = DEFAULT_TRANSLATION_CONTENT["en"]["step_help"]["rough"]["what"]
    assert original != "MUTATED"


def test_step_help_unknown_locale_falls_back_to_en() -> None:
    help_dict = build_step_help(rough_sort_enabled=True, locale="zz")
    en = DEFAULT_TRANSLATION_CONTENT["en"]["step_help"]
    assert set(help_dict.keys()) == set(en.keys())


def test_all_three_locales_supported_in_both_modes() -> None:
    for locale in ("en", "fr", "fi"):
        for rough_enabled in (True, False):
            steps = build_process_steps(
                rough_sort_enabled=rough_enabled, locale=locale
            )
            help_dict = build_step_help(
                rough_sort_enabled=rough_enabled, locale=locale
            )
            # Every step in the result must have a non-empty title and id
            for s in steps:
                assert s["id"]
                assert s["title"]
            # step_help keys are non-empty
            for k, v in help_dict.items():
                assert v["what"]
                assert v["why"]
