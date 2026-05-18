"""S3-optional mode: capability flag + audio safety-net guard."""

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
