"""The rules the audio upload handler applied inline, now addressable.

upload_audio was 184 lines: question-key format, magic-byte MIME sniffing
against the allowlist, size cap, study state, submission state, the
per-study audio switch with its text_audio exception, the duration cap,
the storage quota, and the replace-atomicity dance with S3. Each rule
answered with its own status (400 / 403 / 404 / 413 / 507). The service
raises AudioUploadRejected with that status and detail; the router turns
it into the same HTTPException as before.
"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.audio_service import (
    AudioUploadRejected,
    assert_audio_allowed,
    sniff_mime,
    validate_duration,
    validate_question_key,
)


def _rejected(fn, *args, **kwargs) -> AudioUploadRejected:
    with pytest.raises(AudioUploadRejected) as exc:
        fn(*args, **kwargs)
    return exc.value


def test_question_key_allows_word_characters_and_hyphens() -> None:
    validate_question_key("card_123")
    validate_question_key("missing-statement")
    assert _rejected(validate_question_key, "card 123").status_code == 400
    assert _rejected(validate_question_key, "../x").status_code == 400


def test_sniff_mime_rejects_oversized_content_with_413() -> None:
    too_big = b"\x00" * (settings.AUDIO_MAX_FILE_SIZE_MB * 1024 * 1024 + 1)
    err = _rejected(sniff_mime, too_big)
    assert err.status_code == 413
    assert "too large" in err.detail.lower()


def test_sniff_mime_rejects_content_that_is_not_audio_with_400() -> None:
    err = _rejected(sniff_mime, b"%PDF-1.4 not audio at all" + b"\x00" * 32)
    assert err.status_code == 400
    assert "Invalid file type" in err.detail


def test_sniff_mime_returns_what_libmagic_detected_when_allowlisted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # libmagic needs a real container header; the integration tests mock it
    # the same way. What matters here is that the sniffed value, not any
    # client header, is what comes back.
    monkeypatch.setattr(
        "app.services.audio_service.magic.from_buffer", lambda *_a, **_k: "audio/webm"
    )
    assert sniff_mime(b"x" * 100) == "audio/webm"


def test_audio_allowed_when_globally_enabled() -> None:
    assert_audio_allowed({"audio": {"enabled": True}}, "card_1")


def test_audio_allowed_for_a_text_audio_question_even_when_globally_off() -> None:
    cfg = {"audio": {"enabled": False}, "questions": {"why": {"type": "text_audio"}}}
    assert_audio_allowed(cfg, "question_why")


def test_audio_refused_with_403_otherwise() -> None:
    cfg = {"audio": {"enabled": False}, "questions": {"why": {"type": "text"}}}
    assert _rejected(assert_audio_allowed, cfg, "question_why").status_code == 403
    assert _rejected(assert_audio_allowed, {}, "card_1").status_code == 403


def test_duration_cap_defaults_to_settings_when_the_study_omits_it() -> None:
    validate_duration({}, settings.AUDIO_MAX_DURATION_SECONDS)
    err = _rejected(validate_duration, {}, settings.AUDIO_MAX_DURATION_SECONDS + 1)
    assert err.status_code == 400
    assert "exceeds maximum" in err.detail


def test_duration_uses_the_study_cap_and_rejects_non_positive() -> None:
    validate_duration({"max_duration_seconds": 10}, 10)
    assert (
        _rejected(validate_duration, {"max_duration_seconds": 10}, 11).status_code
        == 400
    )
    assert _rejected(validate_duration, {}, 0).status_code == 400
    validate_duration({}, None)  # optional
