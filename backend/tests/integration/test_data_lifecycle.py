# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Integration tests for the admin data-lifecycle endpoints."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AudioRecording,
    Participant,
    ParticipantStatus,
    Study,
)


@pytest.fixture
async def study_with_mixed_participants(
    active_study: Study, db: AsyncSession
) -> Study:
    """Seed an active study with a known mix of participants for inventory
    testing: 1 started, 5 completed (one >1y old, one recent, one
    discarded, one recent en, one already-anonymised). 6 total."""
    now = datetime.now(timezone.utc)

    db.add_all(
        [
            Participant(
                study_id=active_study.id,
                session_token=uuid.uuid4(),
                language_used="en",
                status=ParticipantStatus.started,
            ),
            Participant(
                study_id=active_study.id,
                session_token=uuid.uuid4(),
                language_used="en",
                status=ParticipantStatus.completed,
                submitted_at=now - timedelta(days=400),  # > 1y old
            ),
            Participant(
                study_id=active_study.id,
                session_token=uuid.uuid4(),
                language_used="fr",
                status=ParticipantStatus.completed,
                submitted_at=now - timedelta(days=10),
            ),
            Participant(
                study_id=active_study.id,
                session_token=uuid.uuid4(),
                language_used="fr",
                status=ParticipantStatus.completed,
                is_discarded=True,
                submitted_at=now - timedelta(days=5),
            ),
            Participant(
                study_id=active_study.id,
                session_token=uuid.uuid4(),
                language_used="en",
                status=ParticipantStatus.completed,
                submitted_at=now - timedelta(days=3),
            ),
            Participant(
                study_id=active_study.id,
                session_token=uuid.uuid4(),
                language_used="fi",
                status=ParticipantStatus.completed,
                submitted_at=now - timedelta(days=200),
                anonymised_at=now - timedelta(days=10),
            ),
        ]
    )
    await db.flush()

    # Add one audio recording on the recent fr participant for size accounting
    recent_fr = (
        await db.execute(
            select(Participant).where(
                Participant.study_id == active_study.id,
                Participant.language_used == "fr",
                Participant.is_discarded.is_(False),
            )
        )
    ).scalars().first()
    if recent_fr is not None:
        db.add(
            AudioRecording(
                participant_id=recent_fr.id,
                question_key="post_sort",
                s3_bucket="test-bucket",
                s3_key=f"audio/{active_study.slug}/p{recent_fr.id}.webm",
                file_size_bytes=2 * 1024 * 1024,  # 2 MB
                duration_seconds=30.0,
                mime_type="audio/webm",
            )
        )
    await db.commit()
    return active_study


@pytest.mark.asyncio
async def test_data_inventory_returns_correct_buckets(
    client: AsyncClient,
    test_user,
    auth_token_factory,
    study_with_mixed_participants: Study,
):
    headers = auth_token_factory(test_user)
    slug = study_with_mixed_participants.slug

    response = await client.get(
        f"/api/admin/studies/{slug}/data-inventory", headers=headers
    )
    assert response.status_code == 200
    data = response.json()

    # 6 participants total per fixture
    assert data["participants"]["total"] == 6
    assert data["participants"]["started"] == 1
    assert data["participants"]["completed"] == 5  # status==completed
    assert data["participants"]["discarded"] == 1
    assert data["participants"]["anonymised"] == 1

    # 1 audio of 2 MB
    assert data["audio"]["count"] == 1
    assert data["audio"]["total_mb"] == 2.0

    # Locale breakdown: en=3, fr=2, fi=1
    assert data["locales"]["en"] == 3
    assert data["locales"]["fr"] == 2
    assert data["locales"]["fi"] == 1

    # Timeline: at least one completed older than 1y (the 400-day one);
    # but the 200-day fi one is already anonymised (excluded from
    # older_than_*).
    assert data["timeline"]["completed_older_than_1y"] >= 1
    assert data["timeline"]["last_anonymisation_at"] is not None


@pytest.mark.asyncio
async def test_bulk_anonymise_only_targets_old_completed(
    client: AsyncClient,
    test_user,
    auth_token_factory,
    db: AsyncSession,
    study_with_mixed_participants: Study,
):
    headers = auth_token_factory(test_user)
    slug = study_with_mixed_participants.slug
    now = datetime.now(timezone.utc)

    # Cutoff: 1 year ago. Should anonymise the 400-day completed
    # participant; the already-anonymised 200-day one is skipped.
    cutoff = (now - timedelta(days=365)).isoformat()
    response = await client.post(
        f"/api/admin/studies/{slug}/anonymise-bulk",
        json={"submitted_before": cutoff},
        headers=headers,
    )
    assert response.status_code == 200
    result = response.json()
    assert result["candidates"] == 1  # only the 400-day participant qualifies
    assert result["anonymised"] == 1
    assert result["skipped_already_anonymous"] == 0

    # Re-running with the same cutoff should now find the same row but
    # skip it as already anonymous.
    response2 = await client.post(
        f"/api/admin/studies/{slug}/anonymise-bulk",
        json={"submitted_before": cutoff},
        headers=headers,
    )
    assert response2.status_code == 200
    result2 = response2.json()
    assert result2["candidates"] == 1
    assert result2["anonymised"] == 0
    assert result2["skipped_already_anonymous"] == 1


@pytest.mark.asyncio
async def test_data_inventory_unauthenticated(
    client: AsyncClient,
    active_study: Study,
):
    response = await client.get(
        f"/api/admin/studies/{active_study.slug}/data-inventory"
    )
    assert response.status_code == 401
