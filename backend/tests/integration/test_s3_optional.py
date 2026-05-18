"""S3-optional mode: capability flag + audio safety-net guard."""

from io import BytesIO
from unittest.mock import patch

import pytest

from app.core.config import settings


@pytest.mark.asyncio
class TestPublicConfigAudioStorage:
    async def test_reports_unavailable_when_s3_absent(self, client, monkeypatch):
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", None)
        monkeypatch.setattr(settings, "S3_BUCKET_NAME", None)
        monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", None)
        monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", None)
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["audio_storage"] == "unavailable"

    async def test_reports_available_when_s3_configured(self, client, monkeypatch):
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.com")
        monkeypatch.setattr(settings, "S3_BUCKET_NAME", "bucket")
        monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", "key")
        monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", "secret")
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["audio_storage"] == "available"


@pytest.mark.asyncio
class TestAudioStorageGuard:
    async def test_upload_returns_503_not_500_when_s3_absent(
        self, client, monkeypatch
    ):
        # No storage mock on purpose: the guard must fire BEFORE any
        # storage_service attribute is touched (today that path raises
        # AttributeError -> 500).
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", None)
        monkeypatch.setattr(settings, "S3_BUCKET_NAME", None)
        monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", None)
        monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", None)

        files = {"file": ("r.webm", BytesIO(b"x" * 50), "audio/webm")}
        data = {
            "session_token": "00000000-0000-0000-0000-000000000000",
            "question_key": "card_1",
            "duration_seconds": "1.0",
        }
        r = await client.post("/api/audio/upload", files=files, data=data)
        assert r.status_code == 503
        # Error-envelope house convention: the string lands in ["message"].
        assert r.json()["message"] == "audio_storage_unavailable"

    @patch("app.routers.audio.magic.from_buffer")
    async def test_upload_unaffected_when_s3_configured(
        self, mock_magic, client, monkeypatch
    ):
        # Guard must NOT fire when configured: a configured instance with a
        # bogus token still reaches normal validation (404), never 503.
        mock_magic.return_value = "audio/webm"
        monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://s3.example.com")
        monkeypatch.setattr(settings, "S3_BUCKET_NAME", "bucket")
        monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", "key")
        monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", "secret")

        files = {"file": ("r.webm", BytesIO(b"x" * 50), "audio/webm")}
        data = {
            "session_token": "00000000-0000-0000-0000-000000000000",
            "question_key": "card_1",
            "duration_seconds": "1.0",
        }
        r = await client.post("/api/audio/upload", files=files, data=data)
        assert r.status_code != 503
