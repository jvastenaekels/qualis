"""Tests for record_consent in StudyService."""

import uuid

import pytest
from sqlalchemy import select

from app.exceptions import NotFoundError
from app.models import Participant, ParticipantStatus
from app.services.study_service import StudyService


@pytest.mark.asyncio
async def test_record_consent_study_not_found(db):
    """Should raise 404 if study does not exist."""
    session_token = uuid.uuid4()
    with pytest.raises(NotFoundError, match="Study not found"):
        await StudyService.record_consent(db, "non-existent-study", session_token, "en")


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

    assert result["status"] == "recorded"
    assert isinstance(result["resume_code"], str)
    assert len(result["resume_code"]) > 0

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
    assert p.resume_code == result["resume_code"]


@pytest.mark.asyncio
async def test_record_consent_existing_participant(db, seed_study):
    """Re-consent updates language/ip/ua, but consent_hash and consented_at are
    first-consent-wins (audit C1): they must not change on a re-POST, so the
    duration-metric anchor and legal consent record stay stable and coherent."""
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

    assert p.language_used == language  # mutable: still updated on re-consent
    assert p.consent_hash == "hash-1"  # first-consent-wins: NOT overwritten
    assert p.ip_address is not None
