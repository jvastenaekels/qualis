"""Audio recording schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AudioRecordingBase(BaseModel):
    """Base schema for audio recordings."""

    question_key: str
    mime_type: str
    file_size_bytes: int
    duration_seconds: float | None = None


class AudioRecordingRead(AudioRecordingBase):
    """Schema for reading audio recording metadata."""

    id: int
    s3_key: str
    created_at: datetime
    presigned_url: str | None = None
    url_expires_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AudioUploadResponse(BaseModel):
    """Schema for audio upload response."""

    recording_id: int
    s3_key: str
    file_size_bytes: int
    presigned_url: str
    message: str = "Audio uploaded successfully"


class ParticipantAudioRecording(AudioRecordingRead):
    """Audio recording with the owning participant's id, used in admin
    multi-participant fetches (e.g., the per-factor voice panel in the
    analysis page).
    """

    participant_db_id: int
