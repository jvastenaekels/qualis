"""Integration tests for audio recording endpoints."""

import uuid
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AudioRecording, Participant, Study, StudyState


@pytest.fixture(autouse=True)
def _configure_s3_for_audio_tests(monkeypatch):
    """The audio routes now guard on settings.is_s3_configured (503
    safety-net when object storage is unconfigured, Task 4). Every test in
    this module exercises an audio route and either mocks the
    storage_service singleton or asserts pre-storage validation/auth
    behaviour, so configure S3 module-wide to keep the guard from firing
    before the code under test is reached."""
    monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.com")
    monkeypatch.setattr(settings, "S3_BUCKET_NAME", "bucket")
    monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", "key")
    monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", "secret")


@pytest.fixture
def mock_storage_service():
    """Mock the StorageService for testing without real S3."""
    with patch("app.routers.audio.storage_service") as mock:
        # Mock upload_audio
        mock.upload_audio = AsyncMock(
            return_value={
                "s3_bucket": "test-bucket",
                "s3_key": "audio/test-study/test-token/123_card_1.webm",
                "file_size_bytes": 1024,
                "mime_type": "audio/webm",
            }
        )

        # Mock generate_presigned_url
        mock.generate_presigned_url = MagicMock(
            return_value="https://s3.example.com/presigned-url"
        )

        # Mock delete_audio
        mock.delete_audio = AsyncMock(return_value=None)

        yield mock


@pytest_asyncio.fixture
async def audio_enabled_study(db: AsyncSession, test_user, test_project) -> Study:
    """Create a study with audio recording enabled."""
    study = Study(
        slug="audio-study",
        project_id=test_project.id,
        state=StudyState.active,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={
            "extreme_columns": [-1, 1],
            "audio": {
                "enabled": True,
                "max_duration_seconds": 180,
                "max_storage_mb": 100,
            },
        },
    )
    db.add(study)
    await db.commit()
    await db.refresh(study)
    return study


@pytest_asyncio.fixture
async def participant_token(
    db: AsyncSession, audio_enabled_study: Study
) -> tuple[uuid.UUID, Participant]:
    """Create a participant with a session token."""
    token = uuid.uuid4()
    participant = Participant(
        study_id=audio_enabled_study.id,
        session_token=token,
        language_used="en",
        status="started",
    )
    db.add(participant)
    await db.commit()
    await db.refresh(participant)
    return token, participant


@pytest.mark.asyncio
class TestAudioUpload:
    """Tests for audio upload endpoint."""

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_audio_success(
        self,
        mock_magic,
        client: AsyncClient,
        db: AsyncSession,
        participant_token: tuple[uuid.UUID, Participant],
        mock_storage_service,
    ):
        """Test successful audio upload."""
        # Mock magic to return correct MIME type
        mock_magic.return_value = "audio/webm"

        token, participant = participant_token

        # Create fake audio file
        audio_data = b"fake webm audio data" * 50  # ~1KB
        files = {"file": ("recording.webm", BytesIO(audio_data), "audio/webm")}
        data = {
            "session_token": str(token),
            "question_key": "card_123",
            "duration_seconds": "45.5",
        }

        response = await client.post("/api/audio/upload", files=files, data=data)

        assert response.status_code == 200
        result = response.json()
        assert result["recording_id"] is not None
        assert result["s3_key"] == "audio/test-study/test-token/123_card_1.webm"
        assert result["file_size_bytes"] == 1024
        assert "presigned_url" in result

        # Verify database record
        stmt = select(AudioRecording).where(
            AudioRecording.participant_id == participant.id
        )
        recordings = await db.execute(stmt)
        recording = recordings.scalar_one()
        assert recording.question_key == "card_123"
        assert recording.duration_seconds == 45.5

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_audio_participant_not_found(
        self, mock_magic, client: AsyncClient, mock_storage_service
    ):
        """Test upload fails with invalid session token."""
        mock_magic.return_value = "audio/webm"

        audio_data = b"fake audio"
        files = {"file": ("recording.webm", BytesIO(audio_data), "audio/webm")}
        data = {
            "session_token": str(uuid.uuid4()),  # Non-existent token
            "question_key": "card_123",
        }

        response = await client.post("/api/audio/upload", files=files, data=data)
        assert response.status_code == 404
        assert "not found" in response.json()["message"].lower()

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_audio_disabled_study(
        self,
        mock_magic,
        client: AsyncClient,
        db: AsyncSession,
        test_user,
        test_project,
    ):
        """Test upload fails when audio is disabled for study."""
        mock_magic.return_value = "audio/webm"
        # Create study without audio enabled
        study = Study(
            slug="no-audio-study",
            project_id=test_project.id,
            state=StudyState.active,
            grid_config=[],
            presort_config={},
            postsort_config={},  # No audio config
        )
        db.add(study)
        await db.commit()

        token = uuid.uuid4()
        participant = Participant(
            study_id=study.id, session_token=token, language_used="en", status="started"
        )
        db.add(participant)
        await db.commit()

        audio_data = b"fake audio"
        files = {"file": ("recording.webm", BytesIO(audio_data), "audio/webm")}
        data = {"session_token": str(token), "question_key": "card_123"}

        response = await client.post("/api/audio/upload", files=files, data=data)
        assert response.status_code == 403
        assert "not enabled" in response.json()["message"].lower()

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_replaces_existing_recording(
        self,
        mock_magic,
        client: AsyncClient,
        db: AsyncSession,
        participant_token: tuple[uuid.UUID, Participant],
        mock_storage_service,
    ):
        """Test that uploading to same question replaces old recording."""
        mock_magic.return_value = "audio/webm"

        token, participant = participant_token

        # Create existing recording
        existing = AudioRecording(
            participant_id=participant.id,
            question_key="card_123",
            s3_bucket="old-bucket",
            s3_key="old-key",
            file_size_bytes=500,
            mime_type="audio/webm",
        )
        db.add(existing)
        await db.commit()

        # Upload new recording
        audio_data = b"new audio data"
        files = {"file": ("new.webm", BytesIO(audio_data), "audio/webm")}
        data = {"session_token": str(token), "question_key": "card_123"}

        response = await client.post("/api/audio/upload", files=files, data=data)
        assert response.status_code == 200

        # Verify old recording was deleted
        mock_storage_service.delete_audio.assert_called_once_with("old-key")

        # Verify only one recording exists
        stmt = select(AudioRecording).where(
            AudioRecording.participant_id == participant.id,
            AudioRecording.question_key == "card_123",
        )
        recordings = await db.execute(stmt)
        all_recordings = recordings.scalars().all()
        assert len(all_recordings) == 1
        assert all_recordings[0].s3_key == "audio/test-study/test-token/123_card_1.webm"

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_after_submission_fails(
        self,
        mock_magic,
        client: AsyncClient,
        db: AsyncSession,
        participant_token: tuple[uuid.UUID, Participant],
        mock_storage_service,
    ):
        """Test that upload fails after participant has submitted."""
        mock_magic.return_value = "audio/webm"

        token, participant = participant_token

        # Mark participant as submitted
        from datetime import datetime, timezone

        participant.submitted_at = datetime.now(timezone.utc)
        await db.commit()

        audio_data = b"audio after submit"
        files = {"file": ("recording.webm", BytesIO(audio_data), "audio/webm")}
        data = {"session_token": str(token), "question_key": "card_123"}

        response = await client.post("/api/audio/upload", files=files, data=data)
        assert response.status_code == 400
        assert "after submission" in response.json()["message"].lower()


@pytest.mark.asyncio
class TestAudioValidation:
    """Tests for audio file validation."""

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_invalid_mime_type(
        self,
        mock_magic,
        client: AsyncClient,
        participant_token: tuple[uuid.UUID, Participant],
    ):
        """Test that invalid MIME types are rejected."""
        token, _ = participant_token
        mock_magic.return_value = "application/pdf"  # Wrong type

        audio_data = b"not really audio"
        files = {"file": ("fake.webm", BytesIO(audio_data), "audio/webm")}
        data = {"session_token": str(token), "question_key": "card_123"}

        response = await client.post("/api/audio/upload", files=files, data=data)
        assert response.status_code == 400
        assert "Invalid file type" in response.json()["message"]

    async def test_upload_rejects_invalid_question_key(
        self,
        client: AsyncClient,
        participant_token: tuple[uuid.UUID, Participant],
    ):
        """Test that question_key with path traversal characters is rejected."""
        token, _ = participant_token
        audio_data = b"fake audio"
        files = {"file": ("recording.webm", BytesIO(audio_data), "audio/webm")}
        data = {"session_token": str(token), "question_key": "../../etc/passwd"}

        response = await client.post("/api/audio/upload", files=files, data=data)
        assert response.status_code == 400
        assert "question_key" in response.json()["message"].lower()

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_rejects_empty_file(
        self,
        mock_magic,
        client: AsyncClient,
        participant_token: tuple[uuid.UUID, Participant],
        mock_storage_service,
    ):
        """Test that empty audio files are rejected."""
        mock_magic.return_value = "audio/webm"
        token, _ = participant_token
        files = {"file": ("empty.webm", BytesIO(b""), "audio/webm")}
        data = {"session_token": str(token), "question_key": "card_1"}

        response = await client.post("/api/audio/upload", files=files, data=data)
        assert response.status_code == 400
        assert "empty" in response.json()["message"].lower()

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_file_too_large(
        self,
        mock_magic,
        client: AsyncClient,
        participant_token: tuple[uuid.UUID, Participant],
    ):
        """Test that files exceeding size limit are rejected."""
        mock_magic.return_value = "audio/webm"

        token, _ = participant_token

        # Create 11MB file (exceeds 10MB limit)
        large_data = b"x" * (11 * 1024 * 1024)
        files = {"file": ("large.webm", BytesIO(large_data), "audio/webm")}
        data = {"session_token": str(token), "question_key": "card_123"}

        response = await client.post("/api/audio/upload", files=files, data=data)
        assert response.status_code == 413
        assert "too large" in response.json()["message"].lower()


@pytest.mark.asyncio
class TestAudioDeletion:
    """Tests for audio deletion endpoint."""

    async def test_delete_audio_success(
        self,
        client: AsyncClient,
        db: AsyncSession,
        participant_token: tuple[uuid.UUID, Participant],
        mock_storage_service,
    ):
        """Test successful audio deletion."""
        token, participant = participant_token

        # Create recording
        recording = AudioRecording(
            participant_id=participant.id,
            question_key="card_123",
            s3_bucket="test-bucket",
            s3_key="test-key",
            file_size_bytes=1024,
            mime_type="audio/webm",
        )
        db.add(recording)
        await db.commit()
        await db.refresh(recording)

        response = await client.delete(
            f"/api/audio/{recording.id}", params={"session_token": str(token)}
        )

        assert response.status_code == 200
        assert "deleted successfully" in response.json()["message"]

        # Verify S3 deletion was called
        mock_storage_service.delete_audio.assert_called_once_with("test-key")

        # Verify database record is gone
        stmt = select(AudioRecording).where(AudioRecording.id == recording.id)
        result = await db.execute(stmt)
        assert result.scalar_one_or_none() is None

    async def test_delete_audio_wrong_participant(
        self,
        client: AsyncClient,
        db: AsyncSession,
        participant_token: tuple[uuid.UUID, Participant],
        audio_enabled_study: Study,
    ):
        """Test that deletion fails if session token doesn't match."""
        token, participant = participant_token

        # Create recording
        recording = AudioRecording(
            participant_id=participant.id,
            question_key="card_123",
            s3_bucket="test-bucket",
            s3_key="test-key",
            file_size_bytes=1024,
            mime_type="audio/webm",
        )
        db.add(recording)
        await db.commit()

        # Try to delete with different session token
        wrong_token = uuid.uuid4()
        response = await client.delete(
            f"/api/audio/{recording.id}", params={"session_token": str(wrong_token)}
        )

        assert response.status_code == 403
        assert "not authorized" in response.json()["message"].lower()

    async def test_delete_after_submission_fails(
        self,
        client: AsyncClient,
        db: AsyncSession,
        participant_token: tuple[uuid.UUID, Participant],
    ):
        """Test that deletion fails after submission."""
        token, participant = participant_token

        # Create recording
        recording = AudioRecording(
            participant_id=participant.id,
            question_key="card_123",
            s3_bucket="test-bucket",
            s3_key="test-key",
            file_size_bytes=1024,
            mime_type="audio/webm",
        )
        db.add(recording)
        await db.commit()

        # Mark as submitted
        from datetime import datetime, timezone

        participant.submitted_at = datetime.now(timezone.utc)
        await db.commit()

        response = await client.delete(
            f"/api/audio/{recording.id}", params={"session_token": str(token)}
        )

        assert response.status_code == 400
        assert "after submission" in response.json()["message"].lower()


@pytest.mark.asyncio
class TestStorageUsage:
    """Tests for storage usage endpoint."""

    async def test_get_storage_usage(
        self,
        client: AsyncClient,
        db: AsyncSession,
        audio_enabled_study: Study,
        test_user,
        auth_token_factory,
    ):
        """Test storage usage calculation."""
        # Create participants with audio recordings
        p1 = Participant(
            study_id=audio_enabled_study.id,
            session_token=uuid.uuid4(),
            language_used="en",
            status="completed",
        )
        p2 = Participant(
            study_id=audio_enabled_study.id,
            session_token=uuid.uuid4(),
            language_used="en",
            status="completed",
        )
        db.add_all([p1, p2])
        await db.commit()

        # Add recordings (2MB + 3MB = 5MB total)
        r1 = AudioRecording(
            participant_id=p1.id,
            question_key="card_1",
            s3_bucket="test",
            s3_key="key1",
            file_size_bytes=2 * 1024 * 1024,  # 2MB
            mime_type="audio/webm",
        )
        r2 = AudioRecording(
            participant_id=p2.id,
            question_key="card_2",
            s3_bucket="test",
            s3_key="key2",
            file_size_bytes=3 * 1024 * 1024,  # 3MB
            mime_type="audio/webm",
        )
        db.add_all([r1, r2])
        await db.commit()

        # Get storage usage
        headers = auth_token_factory(test_user)
        response = await client.get(
            f"/api/admin/studies/{audio_enabled_study.slug}/storage-usage",
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_mb"] == 5.0
        assert data["file_count"] == 2
        assert data["quota_mb"] == 100
        assert data["usage_percent"] == 5.0

    async def test_storage_usage_empty_study(
        self,
        client: AsyncClient,
        audio_enabled_study: Study,
        test_user,
        auth_token_factory,
    ):
        """Test storage usage for study with no recordings."""
        headers = auth_token_factory(test_user)
        response = await client.get(
            f"/api/admin/studies/{audio_enabled_study.slug}/storage-usage",
            headers=headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_mb"] == 0
        assert data["file_count"] == 0
        assert data["usage_percent"] == 0
