# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""API router for audio recording upload and management."""

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from datetime import datetime, timedelta, UTC
import re
import magic

from app.database import get_db
from app.models import Participant, AudioRecording, Study, StudyState
from app.schemas import AudioUploadResponse, AudioRecordingRead
from app.services.storage_service import storage_service
from app.core.config import settings
from app.limiter import limiter

router = APIRouter(prefix="/api/audio", tags=["audio"])


def require_audio_storage() -> None:
    """Reject audio endpoints with a clean 503 when object storage is
    unconfigured. Defence-in-depth: the adaptive UI suppresses the audio
    affordance entirely (see GET /api/config audio_storage), so this is a
    safety net, not the primary path. Without it, storage_service is built
    with skip_init=True and any call raises AttributeError -> 500."""
    if not settings.is_s3_configured:
        raise HTTPException(status_code=503, detail="audio_storage_unavailable")


async def validate_audio_file(file: UploadFile) -> str:
    """
    Validate audio file type and size, return the sniffed MIME type.

    Args:
        file: UploadFile to validate

    Returns:
        The MIME type detected from the file's magic bytes (one of
        ``settings.AUDIO_ALLOWED_MIME_TYPES`` — the function raises
        before returning otherwise). The sniffed value is the
        authoritative content type for downstream storage; the
        client-supplied ``UploadFile.content_type`` is unverified
        attacker-influenced data and must not be persisted as the
        S3 ``Content-Type`` (F-06-005).

    Raises:
        HTTPException: If file is invalid (size or MIME type)
    """
    content = await file.read()

    # Size check
    if len(content) > settings.AUDIO_MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max: {settings.AUDIO_MAX_FILE_SIZE_MB}MB",
        )

    # MIME type check using magic bytes (not just extension)
    mime = magic.from_buffer(content, mime=True)
    if mime not in settings.AUDIO_ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {mime}. Allowed: {', '.join(settings.AUDIO_ALLOWED_MIME_TYPES)}",
        )

    # Reset file pointer for subsequent operations
    await file.seek(0)
    return mime


async def check_storage_quota(
    study: Study, new_file_size: int, db: AsyncSession
) -> None:
    """
    Verify study hasn't exceeded storage quota.

    Args:
        study: Study object
        new_file_size: Size of new file in bytes
        db: Database session

    Raises:
        HTTPException: If quota would be exceeded
    """
    audio_config = study.postsort_config.get("audio", {})
    quota_mb = audio_config.get("max_storage_mb", 100)
    quota_bytes = quota_mb * 1024 * 1024

    # Calculate current usage for this study
    result = await db.execute(
        select(func.coalesce(func.sum(AudioRecording.file_size_bytes), 0))
        .join(Participant)
        .where(Participant.study_id == study.id)
    )
    current_usage = result.scalar() or 0

    if current_usage + new_file_size > quota_bytes:
        raise HTTPException(
            status_code=507,  # Insufficient Storage
            detail=f"Storage quota exceeded. Used: {current_usage / 1024 / 1024:.2f}MB / {quota_mb}MB",
        )


@router.post(
    "/upload",
    response_model=AudioUploadResponse,
    dependencies=[Depends(require_audio_storage)],
)
@limiter.limit("10/minute")
async def upload_audio(
    request: Request,
    file: UploadFile = File(...),
    session_token: UUID = Form(...),
    question_key: str = Form(...),
    duration_seconds: float | None = Form(None),
    db: AsyncSession = Depends(get_db),
) -> AudioUploadResponse:
    """
    Upload audio recording for a participant response.

    Args:
        file: Audio file (WebM or MP4/AAC)
        session_token: Participant session UUID
        question_key: Question identifier (e.g., "card_123", "missing_statement")
        duration_seconds: Optional recording duration

    Returns:
        AudioUploadResponse with recording metadata and presigned URL

    Raises:
        HTTPException: If validation fails, quota exceeded, or upload fails
    """
    # Validate question_key format (alphanumeric, underscores, hyphens only)
    if not re.match(r"^[a-zA-Z0-9_-]+$", question_key):
        raise HTTPException(status_code=400, detail="Invalid question_key format")

    # Validate file. The sniffed MIME is the authoritative content
    # type for storage; the client-supplied UploadFile.content_type
    # is unverified attacker input and must not be persisted as the
    # S3 Content-Type (F-06-005).
    sniffed_mime = await validate_audio_file(file)

    # Get participant and study
    result = await db.execute(
        select(Participant, Study)
        .join(Study)
        .where(Participant.session_token == session_token)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant, study = row

    # Check study is still active
    if study.state != StudyState.active:
        raise HTTPException(
            status_code=403,
            detail=f"Study is not active (state: {study.state.value}). Audio upload not allowed.",
        )

    # Check if already submitted
    if participant.submitted_at:
        raise HTTPException(status_code=400, detail="Cannot upload after submission")

    # Check if audio enabled for this study
    audio_config = study.postsort_config.get("audio", {})
    audio_globally_enabled = audio_config.get("enabled", False)

    # text_audio questions can upload audio even when global audio is disabled
    has_text_audio_question = False
    if question_key.startswith("question_"):
        q_key = question_key[len("question_") :]
        questions = study.postsort_config.get("questions", {})
        q_cfg = questions.get(q_key, {})
        has_text_audio_question = q_cfg.get("type") == "text_audio"

    if not audio_globally_enabled and not has_text_audio_question:
        raise HTTPException(
            status_code=403, detail="Audio recording not enabled for this study"
        )

    # Validate duration against study config. F-06-005a: the default
    # comes from settings.AUDIO_MAX_DURATION_SECONDS so the cap stays
    # consistent when a study's postsort_config["audio"] omits the key
    # (previously defaulted to a hard-coded 600s — twice the configured
    # 300s ceiling).
    max_allowed = audio_config.get(
        "max_duration_seconds", settings.AUDIO_MAX_DURATION_SECONDS
    )
    if duration_seconds is not None and duration_seconds <= 0:
        raise HTTPException(status_code=400, detail="Invalid duration")
    if duration_seconds is not None and duration_seconds > max_allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Recording duration ({duration_seconds:.0f}s) exceeds maximum ({max_allowed}s)",
        )

    # Read file content once for quota check and S3 upload
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")
    # F-06-005b: persist the magic-sniffed MIME, not the client-supplied
    # one. validate_audio_file already enforced that the sniffed value
    # belongs to the allowlist, so the S3 Content-Type matches the bytes
    # actually stored — a future renderer cannot be redirected to a
    # different decoder by a header/body mismatch.
    content_type = sniffed_mime

    # Check storage quota
    await check_storage_quota(study, len(content), db)

    # Check if recording already exists for this question
    existing = await db.execute(
        select(AudioRecording).where(
            AudioRecording.participant_id == participant.id,
            AudioRecording.question_key == question_key,
        )
    )
    existing_recording = existing.scalar_one_or_none()

    # Delete old recording if exists (replace functionality)
    if existing_recording:
        await storage_service.delete_audio(existing_recording.s3_key)
        await db.delete(existing_recording)
        await db.flush()  # Flush deletion before creating new record

    # Upload to S3
    s3_metadata = await storage_service.upload_audio(
        content=content,
        content_type=content_type,
        study_slug=study.slug,
        participant_token=participant.session_token,
        question_key=question_key,
    )

    # Create database record — clean up S3 if commit fails to prevent orphans
    audio_recording = AudioRecording(
        participant_id=participant.id,
        question_key=question_key,
        s3_bucket=s3_metadata["s3_bucket"],
        s3_key=s3_metadata["s3_key"],
        file_size_bytes=s3_metadata["file_size_bytes"],
        mime_type=s3_metadata["mime_type"],
        duration_seconds=duration_seconds,
    )

    db.add(audio_recording)
    try:
        await db.commit()
    except Exception:
        await storage_service.delete_audio(s3_metadata["s3_key"])
        raise
    await db.refresh(audio_recording)

    # Generate presigned URL for immediate playback
    presigned_url = storage_service.generate_presigned_url(audio_recording.s3_key)

    return AudioUploadResponse(
        recording_id=audio_recording.id,
        s3_key=audio_recording.s3_key,
        file_size_bytes=audio_recording.file_size_bytes,
        presigned_url=presigned_url,
    )


@router.delete("/{recording_id}", dependencies=[Depends(require_audio_storage)])
@limiter.limit("10/minute")
async def delete_audio_recording(
    request: Request,
    recording_id: int,
    session_token: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """
    Delete an audio recording (before submission only).

    Args:
        recording_id: ID of the recording to delete
        session_token: Participant session token (query parameter)

    Args:
        recording_id: ID of recording to delete
        session_token: Participant session token for authorization

    Returns:
        Success message

    Raises:
        HTTPException: If not authorized or already submitted
    """
    # Get recording with participant
    result = await db.execute(
        select(AudioRecording, Participant)
        .join(Participant)
        .where(AudioRecording.id == recording_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Recording not found")

    recording, participant = row

    # Verify ownership
    if participant.session_token != session_token:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Check if already submitted
    if participant.submitted_at:
        raise HTTPException(status_code=400, detail="Cannot delete after submission")

    # Delete from S3
    await storage_service.delete_audio(recording.s3_key)

    # Delete from database
    await db.delete(recording)
    await db.commit()

    return {"message": "Audio deleted successfully"}


@router.get(
    "/{recording_id}/url",
    response_model=AudioRecordingRead,
    dependencies=[Depends(require_audio_storage)],
)
@limiter.limit("30/minute")
async def get_audio_url(
    request: Request,
    recording_id: int,
    session_token: UUID,
    db: AsyncSession = Depends(get_db),
) -> AudioRecordingRead:
    """
    Get presigned URL for audio playback.

    Args:
        recording_id: ID of recording
        session_token: Participant session token for authorization

    Returns:
        AudioRecordingRead with presigned URL

    Raises:
        HTTPException: If not found or not authorized
    """
    # Get recording with participant
    result = await db.execute(
        select(AudioRecording, Participant)
        .join(Participant)
        .where(AudioRecording.id == recording_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Recording not found")

    recording, participant = row

    # Verify ownership
    if participant.session_token != session_token:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Generate presigned URL (valid for 1 hour)
    presigned_url = storage_service.generate_presigned_url(recording.s3_key)

    # Build response with expiration timestamp
    recording_data = AudioRecordingRead.model_validate(recording)
    recording_data.presigned_url = presigned_url
    recording_data.url_expires_at = datetime.now(UTC) + timedelta(hours=1)

    return recording_data
