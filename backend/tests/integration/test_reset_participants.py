import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Participant, Study, ParticipantStatus


@pytest.mark.asyncio
async def test_reset_participants(
    client: AsyncClient,
    active_study: Study,
    db: AsyncSession,
    test_user,
    auth_token_factory,
):
    """Test that the reset endpoint deletes all participants."""
    auth_headers = auth_token_factory(test_user)

    # 1. Add a participant
    participant = Participant(
        study_id=active_study.id,
        session_token=uuid.uuid4(),
        language_used="en",
        status=ParticipantStatus.completed,
    )
    db.add(participant)
    await db.commit()

    # Verify participant exists
    result = await db.execute(
        select(Participant).where(Participant.study_id == active_study.id)
    )
    assert len(result.scalars().all()) == 1

    # 2. Call reset endpoint
    response = await client.post(
        f"/api/admin/studies/{active_study.slug}/reset",
        headers=auth_headers,
    )
    assert response.status_code == 204

    # 3. Verify participant is gone
    result = await db.execute(
        select(Participant).where(Participant.study_id == active_study.id)
    )
    assert len(result.scalars().all()) == 0
