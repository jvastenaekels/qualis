# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Integration tests for GDPR Art. 17 personal-data erasure.

Two channels:
- Admin-mediated: DELETE /api/admin/studies/{slug}/participants/{id}/personal-data
- Participant self-erasure: DELETE /api/study/{slug}/personal-data?session_token=...
"""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AudioRecording,
    Participant,
    ParticipantStatus,
    QSortEntry,
    Statement,
    Study,
)


@pytest.fixture
async def participant_with_pii(
    active_study: Study, db: AsyncSession
) -> Participant:
    """A participant carrying every PII field this audit cares about, plus
    one Q-sort entry and one audio recording.
    """
    # Find an existing statement to attach a Q-sort entry to.
    stmt = (
        await db.execute(select(Statement).where(Statement.study_id == active_study.id))
    ).scalars().first()

    p = Participant(
        study_id=active_study.id,
        session_token=uuid.uuid4(),
        language_used="en",
        status=ParticipantStatus.completed,
        ip_address="203.0.113.42",
        user_agent="TestAgent/1.0",
        confirmation_code="ABC12345",
        resume_code="resume-token-xyz",
        consent_hash="hash-of-consent-text",
        consented_at=datetime.now(timezone.utc),
        submitted_at=datetime.now(timezone.utc),
        presort_answers={"age": "42", "free_text": "my favourite colour is blue"},
        postsort_answers={"why_extreme": "personal anecdote with name"},
        draft_responses={"some_field": "draft value"},
    )
    db.add(p)
    await db.flush()

    if stmt is not None:
        db.add(QSortEntry(participant_id=p.id, statement_id=stmt.id, grid_score=2))

    db.add(
        AudioRecording(
            participant_id=p.id,
            question_key="post_sort_overall",
            s3_bucket="test-bucket",
            s3_key=f"audio/{active_study.slug}/{p.id}.webm",
            file_size_bytes=12345,
            duration_seconds=10.0,
            mime_type="audio/webm",
        )
    )
    await db.commit()
    await db.refresh(p)
    return p


@pytest.mark.asyncio
async def test_admin_erase_clears_pii_keeps_qsort(
    client: AsyncClient,
    active_study: Study,
    test_user,
    auth_token_factory,
    db: AsyncSession,
    participant_with_pii: Participant,
):
    """Admin-mediated erasure must null the PII columns, delete audio,
    rotate the session token, set anonymised_at — but preserve the
    Q-sort entries (anonymous research data)."""
    headers = auth_token_factory(test_user)
    p_id = participant_with_pii.id
    original_token = participant_with_pii.session_token

    # Count Q-sorts before
    qsorts_before = (
        await db.execute(
            select(QSortEntry).where(QSortEntry.participant_id == p_id)
        )
    ).scalars().all()
    assert len(qsorts_before) >= 1

    response = await client.delete(
        f"/api/admin/studies/{active_study.slug}/participants/{p_id}/personal-data",
        headers=headers,
    )
    assert response.status_code == 204

    # Re-load
    refreshed = (
        await db.execute(select(Participant).where(Participant.id == p_id))
    ).scalar_one()

    # PII nulled
    assert refreshed.ip_address is None
    assert refreshed.user_agent is None
    assert refreshed.confirmation_code is None
    assert refreshed.resume_code is None
    assert refreshed.consent_hash is None
    assert refreshed.draft_responses is None
    assert refreshed.presort_answers == {}
    assert refreshed.postsort_answers == {}

    # session token rotated
    assert refreshed.session_token != original_token

    # anonymised_at stamped
    assert refreshed.anonymised_at is not None

    # Audio rows gone
    audios = (
        await db.execute(
            select(AudioRecording).where(AudioRecording.participant_id == p_id)
        )
    ).scalars().all()
    assert audios == []

    # Q-sort entries preserved (the research data)
    qsorts_after = (
        await db.execute(
            select(QSortEntry).where(QSortEntry.participant_id == p_id)
        )
    ).scalars().all()
    assert len(qsorts_after) == len(qsorts_before)


@pytest.mark.asyncio
async def test_admin_erase_idempotent(
    client: AsyncClient,
    active_study: Study,
    test_user,
    auth_token_factory,
    db: AsyncSession,
    participant_with_pii: Participant,
):
    """Calling erasure twice on the same participant must be a no-op
    (the second call does not re-stamp anonymised_at)."""
    headers = auth_token_factory(test_user)
    p_id = participant_with_pii.id

    first = await client.delete(
        f"/api/admin/studies/{active_study.slug}/participants/{p_id}/personal-data",
        headers=headers,
    )
    assert first.status_code == 204

    refreshed = (
        await db.execute(select(Participant).where(Participant.id == p_id))
    ).scalar_one()
    first_anon_at = refreshed.anonymised_at

    second = await client.delete(
        f"/api/admin/studies/{active_study.slug}/participants/{p_id}/personal-data",
        headers=headers,
    )
    assert second.status_code == 204

    refreshed2 = (
        await db.execute(select(Participant).where(Participant.id == p_id))
    ).scalar_one()
    assert refreshed2.anonymised_at == first_anon_at  # not re-stamped


@pytest.mark.asyncio
async def test_admin_erase_404_for_other_study(
    client: AsyncClient,
    active_study: Study,
    test_user,
    auth_token_factory,
    db: AsyncSession,
    participant_with_pii: Participant,
):
    """Erasure must be study-scoped — passing a participant id that
    belongs to another study must 404, not leak across studies."""
    headers = auth_token_factory(test_user)
    p_id = participant_with_pii.id

    response = await client.delete(
        f"/api/admin/studies/no-such-slug/participants/{p_id}/personal-data",
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_participant_self_erase_with_session_token(
    client: AsyncClient,
    active_study: Study,
    db: AsyncSession,
    participant_with_pii: Participant,
):
    """Participant self-erasure: holder of the session token can erase
    their own personal data without admin intervention."""
    p_id = participant_with_pii.id
    original_token = participant_with_pii.session_token

    response = await client.delete(
        f"/api/study/{active_study.slug}/personal-data",
        params={"session_token": str(original_token)},
    )
    assert response.status_code == 204

    refreshed = (
        await db.execute(select(Participant).where(Participant.id == p_id))
    ).scalar_one()
    assert refreshed.anonymised_at is not None
    assert refreshed.ip_address is None
    # original token can no longer access (rotated)
    assert refreshed.session_token != original_token


@pytest.mark.asyncio
async def test_participant_self_erase_invalid_token_404(
    client: AsyncClient,
    active_study: Study,
):
    """An invalid or unknown session_token must 404 (no oracle)."""
    response = await client.delete(
        f"/api/study/{active_study.slug}/personal-data",
        params={"session_token": str(uuid.uuid4())},
    )
    assert response.status_code == 404
