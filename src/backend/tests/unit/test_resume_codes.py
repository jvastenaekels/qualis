"""Tests for the resume_codes module."""

import re
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.resume_codes import WORD_LISTS, _generate_code, generate_unique_resume_code

CODE_PATTERN = re.compile(r"^[a-z]+-[a-z]+-\d{3}$")
FALLBACK_PATTERN = re.compile(r"^[a-z]+-[a-z]+-\d{3}-\d{4}$")


class TestWordLists:
    """Validate word list integrity."""

    @pytest.mark.parametrize("lang", ["en", "fr", "fi"])
    def test_no_duplicates_adjectives(self, lang: str):
        words = WORD_LISTS[lang]["adjectives"]
        assert len(words) == len(set(words)), f"{lang} adjectives has duplicates"

    @pytest.mark.parametrize("lang", ["en", "fr", "fi"])
    def test_no_duplicates_nouns(self, lang: str):
        words = WORD_LISTS[lang]["nouns"]
        assert len(words) == len(set(words)), f"{lang} nouns has duplicates"

    @pytest.mark.parametrize("lang", ["en", "fr", "fi"])
    def test_all_ascii(self, lang: str):
        for kind in ("adjectives", "nouns"):
            for word in WORD_LISTS[lang][kind]:
                assert word.isascii(), f"{lang}/{kind}: non-ASCII word '{word}'"

    @pytest.mark.parametrize("lang", ["en", "fr", "fi"])
    def test_minimum_list_size(self, lang: str):
        assert len(WORD_LISTS[lang]["adjectives"]) >= 90
        assert len(WORD_LISTS[lang]["nouns"]) >= 90

    @pytest.mark.parametrize("lang", ["en", "fr", "fi"])
    def test_no_adjective_noun_overlap(self, lang: str):
        overlap = set(WORD_LISTS[lang]["adjectives"]) & set(WORD_LISTS[lang]["nouns"])
        assert not overlap, f"{lang} adj/noun overlap: {overlap}"


class TestGenerateCode:
    """Tests for _generate_code."""

    def test_format_matches_pattern(self):
        for _ in range(20):
            code = _generate_code("en")
            assert CODE_PATTERN.match(code), f"Bad format: {code}"

    def test_number_range(self):
        numbers = set()
        for _ in range(500):
            code = _generate_code("en")
            num = int(code.rsplit("-", 1)[1])
            numbers.add(num)
            assert 100 <= num <= 999
        # With 500 samples from 900 options, we should see variety
        assert len(numbers) > 50

    def test_unsupported_language_falls_back_to_english(self):
        code = _generate_code("xx")
        parts = code.split("-")
        adj, noun = parts[0], parts[1]
        assert adj in WORD_LISTS["en"]["adjectives"]
        assert noun in WORD_LISTS["en"]["nouns"]

    @pytest.mark.parametrize("lang", ["en", "fr", "fi"])
    def test_uses_correct_language(self, lang: str):
        code = _generate_code(lang)
        parts = code.split("-")
        adj, noun = parts[0], parts[1]
        assert adj in WORD_LISTS[lang]["adjectives"]
        assert noun in WORD_LISTS[lang]["nouns"]


class TestGenerateUniqueResumeCode:
    """Tests for generate_unique_resume_code (with mocked DB)."""

    @pytest.mark.asyncio
    async def test_returns_unique_code_on_first_try(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        code = await generate_unique_resume_code(db, "en")
        assert CODE_PATTERN.match(code)
        db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_retries_on_collision(self):
        collision = MagicMock()
        collision.scalar_one_or_none.return_value = 1  # exists

        available = MagicMock()
        available.scalar_one_or_none.return_value = None

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[collision, available])

        code = await generate_unique_resume_code(db, "en")
        assert CODE_PATTERN.match(code)
        assert db.execute.call_count == 2

    @pytest.mark.asyncio
    async def test_fallback_after_max_attempts(self):
        """After max_attempts collisions, returns extended code."""
        collision = MagicMock()
        collision.scalar_one_or_none.return_value = 1

        available = MagicMock()
        available.scalar_one_or_none.return_value = None

        # 5 collisions + 1 fallback check (passes)
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[collision, collision, collision, collision, collision, available]
        )

        code = await generate_unique_resume_code(db, "en", max_attempts=5)
        assert FALLBACK_PATTERN.match(code), f"Expected fallback format, got: {code}"

    @pytest.mark.asyncio
    async def test_fallback_with_collision_adds_more_entropy(self):
        """If even the fallback code collides, appends extra digits."""
        collision = MagicMock()
        collision.scalar_one_or_none.return_value = 1

        # 5 collisions + fallback collision
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[collision, collision, collision, collision, collision, collision]
        )

        code = await generate_unique_resume_code(db, "en", max_attempts=5)
        # Format: adj-noun-NNN-NNNN-NNNN (double fallback)
        parts = code.split("-")
        assert len(parts) == 5, f"Expected 5 parts, got: {code}"
