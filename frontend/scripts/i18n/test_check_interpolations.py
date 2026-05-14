"""Tests for the interpolation parity validator."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from check_interpolations import (  # noqa: E402
    check_locale,
    extract_placeholders,
    walk,
)


class TestExtractPlaceholders:
    def test_no_placeholders(self):
        assert extract_placeholders("Hello world") == frozenset()

    def test_single_placeholder(self):
        assert extract_placeholders("Hello {{name}}") == frozenset({"name"})

    def test_multiple_placeholders(self):
        assert extract_placeholders("{{count}} of {{total}}") == frozenset(
            {"count", "total"}
        )

    def test_with_whitespace(self):
        assert extract_placeholders("Hi {{ name }}") == frozenset({"name"})

    def test_non_string_returns_empty(self):
        assert extract_placeholders(None) == frozenset()
        assert extract_placeholders(42) == frozenset()
        assert extract_placeholders(["a"]) == frozenset()


class TestWalk:
    def test_flat_dict(self):
        result = dict(walk({"a": "1", "b": "2"}))
        assert result == {"a": "1", "b": "2"}

    def test_nested_dict(self):
        result = dict(walk({"a": {"b": "v"}}))
        assert result == {"a.b": "v"}

    def test_deeply_nested(self):
        result = dict(walk({"x": {"y": {"z": "v"}}}))
        assert result == {"x.y.z": "v"}

    def test_skips_non_string_leaves(self):
        result = dict(walk({"a": 42, "b": None, "c": "ok"}))
        assert result == {"c": "ok"}


class TestCheckLocale:
    def test_perfect_match_returns_no_errors(self):
        en = {"msg": "Hello {{name}}"}
        target = {"msg": "Hola {{name}}"}
        assert check_locale(en, target) == []

    def test_missing_placeholder_is_error(self):
        en = {"msg": "Hello {{name}}"}
        target = {"msg": "Hola"}
        errors = check_locale(en, target)
        assert len(errors) == 1
        assert errors[0]["key"] == "msg"
        assert errors[0]["expected"] == ["name"]
        assert errors[0]["found"] == []

    def test_renamed_placeholder_is_error(self):
        en = {"msg": "Hello {{name}}"}
        target = {"msg": "Hola {{nombre}}"}
        errors = check_locale(en, target)
        assert len(errors) == 1
        assert errors[0]["expected"] == ["name"]
        assert errors[0]["found"] == ["nombre"]

    def test_extra_placeholder_is_error(self):
        en = {"msg": "Hello {{name}}"}
        target = {"msg": "Hola {{name}} {{extra}}"}
        errors = check_locale(en, target)
        assert len(errors) == 1

    def test_no_placeholders_in_en_is_skipped(self):
        en = {"msg": "Hello world"}
        target = {"msg": "Hola {{rogue}}"}
        assert check_locale(en, target) == []

    def test_missing_target_key_is_skipped(self):
        en = {"msg": "Hello {{name}}", "other": "x"}
        target = {"other": "y"}
        assert check_locale(en, target) == []

    def test_multiple_keys_reported_independently(self):
        en = {"a": "{{x}}", "b": "{{y}}"}
        target = {"a": "no var", "b": "{{y}}"}
        errors = check_locale(en, target)
        assert len(errors) == 1
        assert errors[0]["key"] == "a"
