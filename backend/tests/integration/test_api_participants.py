from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, ParticipantStatus


@pytest.mark.asyncio
async def test_record_consent_success(
    client: AsyncClient, db: AsyncSession, seed_study
):
    """Test successful consent recording."""
    study = seed_study
    token_str = "123e4567-e89b-12d3-a456-426614174000"
    payload = {
        "study_slug": study.slug,
        "session_token": token_str,
        "consent_hash": "abc123hash",
        "language_code": "en",
    }

    response = await client.post(f"/api/study/{study.slug}/consent", json=payload)

    # Debug if 404 - check endpoint registration
    assert response.status_code == 200, f"Response: {response.text}"
    data = response.json()
    assert data["status"] == "recorded"

    # Verify DB
    stmt = select(Participant).where(Participant.session_token == UUID(token_str))
    result = await db.execute(stmt)
    participant = result.scalar_one()

    assert participant.study_id == study.id
    assert str(participant.session_token) == token_str
    assert participant.language_used == "en"
    assert participant.consent_hash == "abc123hash"
    assert participant.status == ParticipantStatus.started
    assert participant.ip_address is not None  # Should be hashed


@pytest.mark.asyncio
async def test_record_consent_update_existing(
    client: AsyncClient, db: AsyncSession, seed_study
):
    """Test re-consenting updates the existing participant record."""
    study = seed_study
    token_str = "123e4567-e89b-12d3-a456-426614174000"
    token_uuid = UUID(token_str)

    # Create initial participant
    p = Participant(
        study_id=study.id,
        session_token=token_uuid,
        language_used="fr",
        status=ParticipantStatus.started,
    )
    db.add(p)
    await db.commit()

    payload = {
        "study_slug": study.slug,
        "session_token": token_str,
        "consent_hash": "new_hash",
        "language_code": "en",
    }

    response = await client.post(f"/api/study/{study.slug}/consent", json=payload)
    assert response.status_code == 200

    # Verify Update
    db.expire_all()
    stmt = select(Participant).where(Participant.session_token == token_uuid)
    participant = (await db.execute(stmt)).scalar_one()

    assert participant.language_used == "en"
    assert participant.consent_hash == "new_hash"


@pytest.mark.asyncio
async def test_record_consent_study_not_found(client: AsyncClient):
    payload = {
        "study_slug": "non-existent",
        "session_token": "123e4567-e89b-12d3-a456-426614174000",
        "language_code": "en",
    }
    response = await client.post("/api/study/non-existent/consent", json=payload)

    # Depending on how the router is mounted, this might be 404 from main or 404 from endpoint logic
    assert response.status_code == 404
