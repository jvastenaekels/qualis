# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Participant audio recordings: the rules, the lookup and the storage dance.

Extracted from ``routers/audio.py``, whose upload handler applied every
rule inline in 184 lines. Rules are small pure functions here; the
orchestration (``upload``, ``delete_recording``, ``recording_for``) takes
the session and talks to the database and object storage.

Each rejection carries the HTTP status the route always answered with —
400 / 403 / 404 / 413 / 507 — so the router stays a one-line translation
and the wire contract is unchanged.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from uuid import UUID

import magic
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AudioRecording, Participant, Study, StudyState
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

_QUESTION_KEY = re.compile(r"^[a-zA-Z0-9_-]+$")


class AudioUploadRejected(Exception):
    """A request the audio routes refuse; ``status_code`` is what they answer."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# --- Pure rules -------------------------------------------------------------


def validate_question_key(question_key: str) -> None:
    """Alphanumerics, underscores and hyphens: the key becomes part of an S3 key."""
    if not _QUESTION_KEY.match(question_key):
        raise AudioUploadRejected(400, "Invalid question_key format")


def sniff_mime(content: bytes) -> str:
    """Size cap, then the MIME type from magic bytes — never from the client.

    The client-supplied content type is unverified input; the sniffed value
    is what gets stored as the S3 Content-Type, so a renderer can never be
    steered to a different decoder by a header/body mismatch (F-06-005).
    """
    if len(content) > settings.AUDIO_MAX_FILE_SIZE_MB * 1024 * 1024:
        raise AudioUploadRejected(
            413, f"File too large. Max: {settings.AUDIO_MAX_FILE_SIZE_MB}MB"
        )
    mime: str = magic.from_buffer(content, mime=True)
    if mime not in settings.AUDIO_ALLOWED_MIME_TYPES:
        allowed = ", ".join(settings.AUDIO_ALLOWED_MIME_TYPES)
        raise AudioUploadRejected(400, f"Invalid file type: {mime}. Allowed: {allowed}")
    return mime


def assert_audio_allowed(postsort_config: dict[str, Any], question_key: str) -> None:  # type: ignore[explicit-any]  # open-ended study JSON
    """The study's audio switch, or a text_audio question for this key."""
    audio_config = postsort_config.get("audio", {})
    if audio_config.get("enabled", False):
        return
    if question_key.startswith("question_"):
        q_key = question_key[len("question_") :]
        q_cfg = postsort_config.get("questions", {}).get(q_key, {})
        if q_cfg.get("type") == "text_audio":
            return
    raise AudioUploadRejected(403, "Audio recording not enabled for this study")


def validate_duration(  # type: ignore[explicit-any]  # open-ended study JSON
    audio_config: dict[str, Any], duration_seconds: float | None
) -> None:
    """The study's cap, defaulting to settings.AUDIO_MAX_DURATION_SECONDS
    (F-06-005a: a study that omits the key must not get a looser ceiling)."""
    if duration_seconds is None:
        return
    max_allowed = audio_config.get(
        "max_duration_seconds", settings.AUDIO_MAX_DURATION_SECONDS
    )
    if duration_seconds <= 0:
        raise AudioUploadRejected(400, "Invalid duration")
    if duration_seconds > max_allowed:
        raise AudioUploadRejected(
            400,
            f"Recording duration ({duration_seconds:.0f}s) exceeds maximum ({max_allowed}s)",
        )


# --- Database-backed steps --------------------------------------------------


async def participant_and_study(
    db: AsyncSession, session_token: UUID
) -> tuple[Participant, Study]:
    result = await db.execute(
        select(Participant, Study)
        .join(Study)
        .where(Participant.session_token == session_token)
    )
    row = result.first()
    if not row:
        raise AudioUploadRejected(404, "Participant not found")
    participant, study = row
    return participant, study


def assert_can_record(participant: Participant, study: Study) -> None:
    if study.state != StudyState.active:
        raise AudioUploadRejected(
            403,
            f"Study is not active (state: {study.state.value}). Audio upload not allowed.",
        )
    if participant.submitted_at:
        raise AudioUploadRejected(400, "Cannot upload after submission")


async def check_storage_quota(
    db: AsyncSession, study: Study, new_file_size: int
) -> None:
    audio_config = study.postsort_config.get("audio", {})
    quota_mb = audio_config.get("max_storage_mb", 100)
    quota_bytes = quota_mb * 1024 * 1024
    result = await db.execute(
        select(func.coalesce(func.sum(AudioRecording.file_size_bytes), 0))
        .join(Participant)
        .where(Participant.study_id == study.id)
    )
    current_usage = result.scalar() or 0
    if current_usage + new_file_size > quota_bytes:
        raise AudioUploadRejected(
            507,
            f"Storage quota exceeded. Used: {current_usage / 1024 / 1024:.2f}MB / {quota_mb}MB",
        )


async def store_recording(
    db: AsyncSession,
    participant: Participant,
    study: Study,
    *,
    question_key: str,
    content: bytes,
    sniffed_mime: str,
    duration_seconds: float | None,
) -> AudioRecording:
    """Replace-safe upload: the old S3 object is deleted only after the new
    row is committed (#5), and a failed commit removes the new object so
    storage never holds an orphan the database does not know about."""
    existing = (
        await db.execute(
            select(AudioRecording).where(
                AudioRecording.participant_id == participant.id,
                AudioRecording.question_key == question_key,
            )
        )
    ).scalar_one_or_none()

    old_s3_object: str | None = None
    if existing:
        old_s3_object = existing.s3_key
        await db.delete(existing)
        await db.flush()  # free the (participant, question) unique slot

    s3_metadata = await storage_service.upload_audio(
        content=content,
        content_type=sniffed_mime,
        study_slug=study.slug,
        participant_token=participant.session_token,
        question_key=question_key,
    )
    recording = AudioRecording(
        participant_id=participant.id,
        question_key=question_key,
        s3_bucket=s3_metadata["s3_bucket"],
        s3_key=s3_metadata["s3_key"],
        file_size_bytes=s3_metadata["file_size_bytes"],
        mime_type=s3_metadata["mime_type"],
        duration_seconds=duration_seconds,
    )
    db.add(recording)
    try:
        await db.commit()
    except Exception:
        await storage_service.delete_audio(s3_metadata["s3_key"])
        raise
    await db.refresh(recording)

    if old_s3_object is not None and old_s3_object != recording.s3_key:
        # Best-effort: the new audio is durably saved; a 500 here would
        # wrongly tell the participant their replacement was lost.
        try:
            await storage_service.delete_audio(old_s3_object)
        except Exception:
            logger.warning(
                "Failed to delete orphaned old audio object %s after successful "
                "re-upload for participant %s question %s",
                old_s3_object,
                participant.id,
                question_key,
                exc_info=True,
            )
    return recording


async def upload(
    db: AsyncSession,
    *,
    session_token: UUID,
    question_key: str,
    content: bytes,
    duration_seconds: float | None,
) -> AudioRecording:
    """Every rule in the order the route applied them, then the storage dance."""
    validate_question_key(question_key)
    sniffed_mime = sniff_mime(content)
    participant, study = await participant_and_study(db, session_token)
    assert_can_record(participant, study)
    assert_audio_allowed(study.postsort_config, question_key)
    validate_duration(study.postsort_config.get("audio", {}), duration_seconds)
    if len(content) == 0:
        raise AudioUploadRejected(400, "Empty audio file")
    await check_storage_quota(db, study, len(content))
    return await store_recording(
        db,
        participant,
        study,
        question_key=question_key,
        content=content,
        sniffed_mime=sniffed_mime,
        duration_seconds=duration_seconds,
    )


def playback_url(recording: AudioRecording) -> str:
    """Presigned URL for the stored object (valid one hour)."""
    return storage_service.generate_presigned_url(recording.s3_key)


async def recording_for(
    db: AsyncSession, recording_id: int, session_token: UUID
) -> tuple[AudioRecording, Participant]:
    """The recording, only for the session that owns it (403 otherwise)."""
    result = await db.execute(
        select(AudioRecording, Participant)
        .join(Participant)
        .where(AudioRecording.id == recording_id)
    )
    row = result.first()
    if not row:
        raise AudioUploadRejected(404, "Recording not found")
    recording, participant = row
    if participant.session_token != session_token:
        raise AudioUploadRejected(403, "Not authorized")
    return recording, participant


async def delete_recording(
    db: AsyncSession, recording_id: int, session_token: UUID
) -> None:
    """Row first, object second: a storage failure after the commit leaves
    at worst an orphan object, never a row pointing at nothing."""
    recording, participant = await recording_for(db, recording_id, session_token)
    if participant.submitted_at:
        raise AudioUploadRejected(400, "Cannot delete after submission")
    stored_object = recording.s3_key
    await db.delete(recording)
    await db.commit()
    try:
        await storage_service.delete_audio(stored_object)
    except Exception:
        logger.warning(
            "Failed to delete S3 object %s after deleting AudioRecording %s",
            stored_object,
            recording_id,
            exc_info=True,
        )
