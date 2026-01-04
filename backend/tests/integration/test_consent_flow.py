"""Integration tests for consent logic."""

import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_study_config_consent_fields(client: AsyncClient, seed_study, db):
    """Test that the study config endpoint returns the correct consent fields."""
    # Ensure seed_study has consent fields set in translation
    # Assuming seed_study fixture creates a study with default translation.
    # We might need to update it or rely on default values.

    # Let's inspect what seed_study provides or just fetch it.
    study = seed_study

    response = await client.get(f"/api/study/{study.slug}?lang=en")
    assert response.status_code == 200
    data = response.json()

    assert "consent" in data
    consent = data["consent"]
    # Verify structure
    assert "title" in consent
    assert "description" in consent
    assert "accept" in consent
    assert "decline" in consent

@pytest.mark.asyncio
async def test_record_consent_integration(client: AsyncClient, seed_study):
    """Verify full consent flow: POST to endpoint."""
    study = seed_study
    token = "123e4567-e89b-12d3-a456-426614174099"

    payload = {
        "study_slug": study.slug,
        "session_token": token,
        "language_code": "en",
        "consent_hash": "test_hash_123"
    }

    response = await client.post(f"/api/study/{study.slug}/consent", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "recorded"
