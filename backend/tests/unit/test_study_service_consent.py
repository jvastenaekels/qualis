"""Tests for record_consent in StudyService."""

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models import Participant, ParticipantStatus
from app.services.study_service import StudyService


@pytest.mark.asyncio
async def test_record_consent_study_not_found(db):
    """Should raise 404 if study does not exist."""
    session_token = uuid.uuid4()
    with pytest.raises(HTTPException) as excinfo:
        await StudyService.record_consent(db, "non-existent-study", session_token, "en")
    assert excinfo.value.status_code == 404
    assert "Study not found" in excinfo.value.detail


@pytest.mark.asyncio
async def test_record_consent_new_participant(db, seed_study):
    """Should create new participant on consent."""
    session_token = uuid.uuid4()
    language = "fr"
    consent_hash = "mock-hash-123"
    ip = "1.2.3.4"

    result = await StudyService.record_consent(
        db, seed_study.slug, session_token, language, consent_hash, ip
    )

    assert result == {"status": "recorded"}

    # Verify DB
    stmt = select(Participant).where(Participant.session_token == session_token)
    res = await db.execute(stmt)
    p = res.scalar_one()

    assert p.study_id == seed_study.id
    assert p.language_used == language
    assert p.consent_hash == consent_hash
    assert p.consented_at is not None
    assert p.status == ParticipantStatus.started
    assert p.ip_address is not None  # Hashed IP


@pytest.mark.asyncio
async def test_record_consent_existing_participant(db, seed_study):
    """Should update existing participant on re-consent."""
    session_token = uuid.uuid4()

    # 1. First consent
    await StudyService.record_consent(
        db, seed_study.slug, session_token, "en", "hash-1"
    )

    # 2. Second consent (update)
    language = "fi"
    consent_hash = "hash-2"
    ip = "5.6.7.8"

    await StudyService.record_consent(
        db, seed_study.slug, session_token, language, consent_hash, ip
    )

    # Verify update
    stmt = select(Participant).where(Participant.session_token == session_token)
    res = await db.execute(stmt)
    p = res.scalar_one()

    assert p.language_used == language
    assert p.consent_hash == consent_hash
    assert p.ip_address is not None
