# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Participant audio endpoints: upload, delete and playback URL.

Every rule lives in ``app.services.audio_service``; each handler reads
the request, calls the service, and turns an ``AudioUploadRejected`` into
the HTTPException the route always answered with.
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database import get_db
from app.limiter import limiter
from app.schemas import AudioRecordingRead, AudioUploadResponse
from app.services import audio_service
from app.services.audio_service import AudioUploadRejected

router = APIRouter(prefix="/api/audio", tags=["audio"])


def require_audio_storage() -> None:
    """Reject audio endpoints with a clean 503 when object storage is
    unconfigured. Defence-in-depth: the adaptive UI suppresses the audio
    affordance entirely (see GET /api/config audio_storage), so this is a
    safety net, not the primary path. Without it, storage_service is built
    with skip_init=True and any call raises AttributeError -> 500."""
    if not settings.is_s3_configured:
        raise HTTPException(status_code=503, detail="audio_storage_unavailable")


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
    """Upload an audio recording for a participant response.

    The file's MIME type is sniffed from its bytes by the service and is
    what gets stored; the client-supplied content type is never trusted
    (F-06-005). Rejections: 400 (format, duration, empty, after submission),
    403 (study not active, audio not enabled), 404 (participant), 413
    (size), 507 (study storage quota).
    """
    content = await file.read()
    try:
        recording = await audio_service.upload(
            db,
            session_token=session_token,
            question_key=question_key,
            content=content,
            duration_seconds=duration_seconds,
        )
    except AudioUploadRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    return AudioUploadResponse(
        recording_id=recording.id,
        s3_key=recording.s3_key,
        file_size_bytes=recording.file_size_bytes,
        presigned_url=audio_service.playback_url(recording),
    )


@router.delete("/{recording_id}", dependencies=[Depends(require_audio_storage)])
@limiter.limit("10/minute")
async def delete_audio_recording(
    request: Request,
    recording_id: int,
    session_token: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Delete an audio recording (before submission only; owner session only)."""
    try:
        await audio_service.delete_recording(db, recording_id, session_token)
    except AudioUploadRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
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
    """Presigned playback URL (valid one hour) for the owner session."""
    try:
        recording, _participant = await audio_service.recording_for(
            db, recording_id, session_token
        )
    except AudioUploadRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    recording_data = AudioRecordingRead.model_validate(recording)
    recording_data.presigned_url = audio_service.playback_url(recording)
    recording_data.url_expires_at = datetime.now(UTC) + timedelta(hours=1)
    return recording_data
