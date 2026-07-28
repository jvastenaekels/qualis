"""Demo mode: the capability flag, and the gate that keeps it off in production.

The failure that matters here is not a missing banner. It is a real deployment
telling every visitor there is a demo account to try — so most of these assert
the *absence* of the flag.
"""

import pytest

from app.core.config import settings


@pytest.mark.asyncio
class TestPublicConfigDemoMode:
    async def test_defaults_to_false(self, client):
        """Nobody has to opt out. An instance that never heard of DEMO_MODE
        must report False."""
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["demo_mode"] is False

    async def test_reports_true_for_the_compose_demo_stack(self, client, monkeypatch):
        monkeypatch.setattr(settings, "DEMO_MODE", True)
        monkeypatch.setattr(settings, "ENVIRONMENT", "development")
        r = await client.get("/api/config")
        assert r.json()["demo_mode"] is True

    async def test_production_overrides_the_flag(self, client, monkeypatch):
        """The second gate. A production deployment that inherits DEMO_MODE=true
        — copied .env, stale compose override, an evaluation image promoted to
        real use — must not advertise a demo account. ENVIRONMENT wins."""
        monkeypatch.setattr(settings, "DEMO_MODE", True)
        monkeypatch.setattr(settings, "ENVIRONMENT", "production")
        r = await client.get("/api/config")
        assert r.json()["demo_mode"] is False

    async def test_never_returns_a_credential(self, client, monkeypatch):
        """The endpoint is unauthenticated. Even in demo mode its whole payload
        must stay capability flags — the sign-in page carries the published demo
        constants itself precisely so this response cannot leak anything."""
        monkeypatch.setattr(settings, "DEMO_MODE", True)
        monkeypatch.setattr(settings, "ENVIRONMENT", "development")
        body = await client.get("/api/config")
        payload = body.json()

        assert set(payload) == {"email_delivery", "audio_storage", "demo_mode"}
        serialised = body.text.lower()
        for secret in ("password", "admin123", "secret", "token"):
            assert secret not in serialised
