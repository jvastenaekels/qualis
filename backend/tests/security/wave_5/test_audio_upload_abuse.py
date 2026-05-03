# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""F-06-005 — Audio upload abuse-resistance hardening.

This wave-5 audit found two minor gaps in
``backend/app/routers/audio.py:upload_audio``:

**F-06-005a — duration default fell back to a hard-coded 600s when the
study's ``postsort_config["audio"]`` did not carry the
``max_duration_seconds`` key.** ``settings.AUDIO_MAX_DURATION_SECONDS``
defaults to **300s** (`backend/app/core/config.py:109`); a study that
shipped without the key in its postsort config got an effective
upload cap of 600s — twice the intended ceiling. The fix is one line:
default to ``settings.AUDIO_MAX_DURATION_SECONDS`` instead of the
literal ``600``.

**F-06-005b — the S3 ``Content-Type`` was set from
``UploadFile.content_type`` (the client-supplied multipart header)
even though ``magic.from_buffer`` had already sniffed the bytes during
validation.** A client could pass a header that disagreed with the
bytes actually stored. The validator's allowlist was correct (the
sniffed value had to match), so a malicious client could not store
arbitrary payloads — but the persisted MIME could still differ from
the bytes. The fix is to thread the sniffed value out of
``validate_audio_file`` and use it as the storage MIME.

Tests pin both fixes:

1. **F-06-005a:** the duration cap defaults to
   ``settings.AUDIO_MAX_DURATION_SECONDS`` when the study config
   omits ``max_duration_seconds``; the per-study override still
   wins when present.
2. **F-06-005b:** ``upload_audio`` calls
   ``storage_service.upload_audio(content_type=<sniffed>, ...)`` even
   when the client multipart header disagrees with the sniffed value.
3. **Static guards** on ``validate_audio_file`` (returns the sniffed
   MIME) and ``upload_audio`` (uses it as ``content_type``).
"""

from __future__ import annotations

import inspect
import uuid
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Participant, Study, StudyState
from app.routers.audio import upload_audio, validate_audio_file


# ---------------------------------------------------------------------------
# Storage / file fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_storage_service():
    """Mock storage_service so we can read back the content_type passed in."""
    with patch("app.routers.audio.storage_service") as mock:
        mock.upload_audio = AsyncMock(
            return_value={
                "s3_bucket": "test-bucket",
                "s3_key": "audio/hashprefix/123_q.webm",
                "file_size_bytes": 1024,
                "mime_type": "audio/webm",
            }
        )
        mock.generate_presigned_url = MagicMock(
            return_value="https://s3.example.com/p"
        )
        mock.delete_audio = AsyncMock(return_value=None)
        yield mock


async def _make_participant(
    db: AsyncSession,
    test_user,
    test_project,
    *,
    audio_max_duration: int | None,
) -> tuple[uuid.UUID, Participant, Study]:
    """Seed a participant on an audio-enabled study; ``audio_max_duration``
    is left out of the postsort_config when None (the F-06-005a path)."""
    audio_cfg: dict = {"enabled": True, "max_storage_mb": 100}
    if audio_max_duration is not None:
        audio_cfg["max_duration_seconds"] = audio_max_duration

    study = Study(
        slug=f"audio-study-{uuid.uuid4().hex[:6]}",
        project_id=test_project.id,
        state=StudyState.active,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={"extreme_columns": [-1, 1], "audio": audio_cfg},
    )
    db.add(study)
    await db.flush()

    token = uuid.uuid4()
    participant = Participant(
        study_id=study.id,
        session_token=token,
        language_used="en",
        status="started",
    )
    db.add(participant)
    await db.commit()
    await db.refresh(study)
    await db.refresh(participant)
    return token, participant, study


# ---------------------------------------------------------------------------
# F-06-005a — duration default uses settings, not hard-coded 600s
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestDurationDefault:
    """When postsort_config["audio"]["max_duration_seconds"] is missing,
    the cap must fall back to settings.AUDIO_MAX_DURATION_SECONDS (300s
    by default), not the prior hard-coded 600s."""

    @patch("app.routers.audio.magic.from_buffer")
    async def test_default_uses_settings_value(
        self,
        mock_magic,
        client: AsyncClient,
        db: AsyncSession,
        test_user,
        test_project,
        mock_storage_service,
    ) -> None:
        """A duration just above settings.AUDIO_MAX_DURATION_SECONDS but
        below the prior 600s default must be rejected with 400."""
        mock_magic.return_value = "audio/webm"
        token, _, _ = await _make_participant(
            db, test_user, test_project, audio_max_duration=None
        )

        # Default is 300s; pick 350s — within the prior 600s default,
        # but above the settings ceiling. Must be rejected.
        too_long = settings.AUDIO_MAX_DURATION_SECONDS + 50
        files = {"file": ("r.webm", BytesIO(b"x" * 100), "audio/webm")}
        data = {
            "session_token": str(token),
            "question_key": "q",
            "duration_seconds": str(float(too_long)),
        }
        r = await client.post("/api/audio/upload", files=files, data=data)
        assert r.status_code == 400, (
            f"Duration above settings.AUDIO_MAX_DURATION_SECONDS must be "
            f"rejected; got {r.status_code} body={r.text!r}"
        )

    @patch("app.routers.audio.magic.from_buffer")
    async def test_per_study_override_still_wins(
        self,
        mock_magic,
        client: AsyncClient,
        db: AsyncSession,
        test_user,
        test_project,
        mock_storage_service,
    ) -> None:
        """A study that explicitly sets max_duration_seconds=120 must
        cap at 120s — the per-study override wins over the settings
        default."""
        mock_magic.return_value = "audio/webm"
        token, _, _ = await _make_participant(
            db, test_user, test_project, audio_max_duration=120
        )

        files = {"file": ("r.webm", BytesIO(b"x" * 100), "audio/webm")}
        # 200 > per-study 120 cap
        data = {
            "session_token": str(token),
            "question_key": "q",
            "duration_seconds": "200",
        }
        r = await client.post("/api/audio/upload", files=files, data=data)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# F-06-005b — sniffed MIME wins over client-supplied content_type
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSniffedMimeAuthoritative:
    """The S3 Content-Type must come from magic.from_buffer (the bytes),
    not from the client's multipart header."""

    @patch("app.routers.audio.magic.from_buffer")
    async def test_storage_uses_sniffed_mime(
        self,
        mock_magic,
        client: AsyncClient,
        db: AsyncSession,
        test_user,
        test_project,
        mock_storage_service,
    ) -> None:
        """The client claims audio/mp4 in the multipart header; the
        bytes sniff as audio/webm. The storage call must receive the
        sniffed value, not the client claim."""
        mock_magic.return_value = "audio/webm"
        token, _, _ = await _make_participant(
            db, test_user, test_project, audio_max_duration=None
        )

        # Client lies: multipart Content-Type says audio/mp4 (also
        # allowlisted) but magic sniffs audio/webm.
        files = {"file": ("r.bin", BytesIO(b"x" * 100), "audio/mp4")}
        data = {
            "session_token": str(token),
            "question_key": "q",
            "duration_seconds": "5",
        }
        r = await client.post("/api/audio/upload", files=files, data=data)
        assert r.status_code == 200, r.text

        # Verify storage_service.upload_audio was called with the
        # sniffed MIME, not the client-supplied audio/mp4.
        called_kwargs = mock_storage_service.upload_audio.call_args.kwargs
        assert called_kwargs["content_type"] == "audio/webm", (
            "storage_service.upload_audio must receive the magic-sniffed "
            f"content_type, not the client multipart header. Got: "
            f"{called_kwargs['content_type']!r}"
        )


class TestImplementationContract:
    """Static guards on the validation/handler boundary."""

    def test_validate_returns_sniffed_mime(self) -> None:
        sig = inspect.signature(validate_audio_file)
        return_annotation = sig.return_annotation
        # Return must be ``str`` (not ``None``) so the handler can
        # thread the sniffed value through to storage.
        assert return_annotation is str, (
            "validate_audio_file must return the sniffed MIME (str). "
            f"Current return annotation: {return_annotation!r}"
        )

    def test_handler_uses_sniffed_value(self) -> None:
        source = inspect.getsource(upload_audio)
        # The handler must capture the sniffed return value and use it
        # as the storage content_type.
        assert "sniffed_mime" in source, (
            "upload_audio must capture validate_audio_file's return value "
            "as `sniffed_mime` and pass it to storage_service.upload_audio "
            "as content_type. Source preview:\n" + source[:800]
        )
        # And must NOT default content_type back to file.content_type
        # in the storage path. (We allow "file.content_type" in
        # comments / unrelated branches but the upload call site must
        # use sniffed_mime.)
        assert (
            "content_type=content_type" in source
            or "content_type=sniffed_mime" in source
        ), (
            "upload_audio must call storage_service.upload_audio with "
            "content_type derived from sniffed_mime. Source preview:\n"
            + source[:1200]
        )

    def test_handler_uses_settings_for_duration_default(self) -> None:
        source = inspect.getsource(upload_audio)
        assert "AUDIO_MAX_DURATION_SECONDS" in source, (
            "upload_audio must default the duration cap to "
            "settings.AUDIO_MAX_DURATION_SECONDS, not a hard-coded value "
            "(F-06-005a). Source preview:\n" + source[:800]
        )
        # No hard-coded 600s default any more.
        assert ", 600)" not in source, (
            "upload_audio must not hard-code 600s as the duration "
            "default — settings.AUDIO_MAX_DURATION_SECONDS is the "
            "source of truth. Source preview:\n" + source[:800]
        )
