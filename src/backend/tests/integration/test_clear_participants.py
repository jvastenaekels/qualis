import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models import Study, StudyState, Participant, ParticipantStatus


@pytest.mark.asyncio
async def test_clear_participants_draft_study(
    client: AsyncClient,
    db: AsyncSession,
    auth_token_factory,
    test_user,
    seed_study: Study,
):
    # Setup auth
    auth_headers = auth_token_factory(test_user)

    # Ensure study is in draft
    seed_study.state = StudyState.draft
    await db.commit()
    await db.refresh(seed_study)

    # Add some participants
    p1 = Participant(
        study_id=seed_study.id, status=ParticipantStatus.completed, language_used="en"
    )
    p2 = Participant(
        study_id=seed_study.id, status=ParticipantStatus.started, language_used="en"
    )
    db.add_all([p1, p2])
    await db.commit()

    # Call DELETE
    response = await client.delete(
        f"/api/admin/studies/{seed_study.slug}/participants", headers=auth_headers
    )
    assert response.status_code == 204

    # Verify count is 0
    stmt = select(func.count(Participant.id)).where(
        Participant.study_id == seed_study.id
    )
    result = await db.execute(stmt)
    count = result.scalar()
    assert count == 0


@pytest.mark.asyncio
async def test_clear_participants_active_study_fails(
    client: AsyncClient,
    db: AsyncSession,
    auth_token_factory,
    test_user,
    seed_study: Study,
):
    # Setup auth
    auth_headers = auth_token_factory(test_user)

    # Set study to active
    seed_study.state = StudyState.active
    await db.commit()
    await db.refresh(seed_study)

    # Add a participant
    p1 = Participant(
        study_id=seed_study.id, status=ParticipantStatus.started, language_used="en"
    )
    db.add(p1)
    await db.commit()

    # Call DELETE
    response = await client.delete(
        f"/api/admin/studies/{seed_study.slug}/participants", headers=auth_headers
    )
    assert response.status_code == 400

    data = response.json()
    # Handle custom error format if present, else standard FastAPI
    if "message" in data:
        assert "draft" in data["message"].lower()
    else:
        assert "detail" in data
        assert "draft" in data["detail"].lower()

    # Verify participant still exists
    stmt = select(func.count(Participant.id)).where(
        Participant.study_id == seed_study.id
    )
    result = await db.execute(stmt)
    count = result.scalar()
    assert count == 1
