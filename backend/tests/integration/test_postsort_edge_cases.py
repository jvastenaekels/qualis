"""Integration tests for post-sort survey edge cases that could cause 500 errors."""

import pytest
from uuid import uuid4

from app.models import (
    Participant,
    ParticipantStatus,
    Statement,
    StatementTranslation,
    Study,
    StudyState,
    StudyTranslation,
    User,
    Workspace,
)


@pytest.mark.asyncio
async def test_submit_with_none_postsort_answers(client, db):
    """Test submission with None postsort_answers (should be converted to {})."""
    # Setup
    owner = User(email="postsort_none@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    ws = Workspace(title="Test WS", slug="test-ws-postsort")
    db.add(ws)
    await db.flush()

    study = Study(
        slug="test-postsort-none",
        workspace_id=ws.id,
        state=StudyState.active,
        default_language="en",
        grid_config=[{"score": -1, "capacity": 1}, {"score": 1, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    translation = StudyTranslation(
        study_id=study.id,
        language_code="en",
        title="Test Study",
        description="Test",
        instructions="Test",
    )
    db.add(translation)

    stmt1 = Statement(study_id=study.id, code="S1")
    stmt2 = Statement(study_id=study.id, code="S2")
    db.add_all([stmt1, stmt2])
    await db.flush()

    st1 = StatementTranslation(
        statement_id=stmt1.id, language_code="en", text="Statement 1"
    )
    st2 = StatementTranslation(
        statement_id=stmt2.id, language_code="en", text="Statement 2"
    )
    db.add_all([st1, st2])
    await db.commit()

    # Submit with None postsort_answers
    session_token = uuid4()
    response = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-postsort-none",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "completed",
            "presort_answers": {},
            "postsort_answers": None,  # This is the edge case
            "qsort": [
                {"statement_id": stmt1.id, "grid_score": -1, "card_comment": None},
                {"statement_id": stmt2.id, "grid_score": 1, "card_comment": None},
            ],
        },
    )

    # Should succeed with 200, not 500
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "confirmation_code" in data


@pytest.mark.asyncio
async def test_submit_with_none_presort_answers(client, db):
    """Test submission with None presort_answers (should be converted to {})."""
    # Setup
    owner = User(email="presort_none@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    ws = Workspace(title="Test WS", slug="test-ws-presort")
    db.add(ws)
    await db.flush()

    study = Study(
        slug="test-presort-none",
        workspace_id=ws.id,
        state=StudyState.active,
        default_language="en",
        grid_config=[{"score": -1, "capacity": 1}, {"score": 1, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    translation = StudyTranslation(
        study_id=study.id,
        language_code="en",
        title="Test Study",
        description="Test",
        instructions="Test",
    )
    db.add(translation)

    stmt1 = Statement(study_id=study.id, code="S1")
    stmt2 = Statement(study_id=study.id, code="S2")
    db.add_all([stmt1, stmt2])
    await db.flush()

    st1 = StatementTranslation(
        statement_id=stmt1.id, language_code="en", text="Statement 1"
    )
    st2 = StatementTranslation(
        statement_id=stmt2.id, language_code="en", text="Statement 2"
    )
    db.add_all([st1, st2])
    await db.commit()

    # Submit with None presort_answers
    session_token = uuid4()
    response = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-presort-none",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "completed",
            "presort_answers": None,  # This is the edge case
            "postsort_answers": {},
            "qsort": [
                {"statement_id": stmt1.id, "grid_score": -1, "card_comment": None},
                {"statement_id": stmt2.id, "grid_score": 1, "card_comment": None},
            ],
        },
    )

    # Should succeed with 200, not 500
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"


@pytest.mark.asyncio
async def test_submit_with_none_qsort(client, db):
    """Test submission with None qsort (should fail with 422/400, not 500)."""
    # Setup
    owner = User(email="qsort_none@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    ws = Workspace(title="Test WS", slug="test-ws-qsort")
    db.add(ws)
    await db.flush()

    study = Study(
        slug="test-qsort-none",
        workspace_id=ws.id,
        state=StudyState.active,
        default_language="en",
        grid_config=[{"score": -1, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.commit()

    # Submit with None qsort
    session_token = uuid4()
    response = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-qsort-none",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "completed",
            "presort_answers": {},
            "postsort_answers": {},
            "qsort": None,  # This is the edge case
        },
    )

    # Should fail with validation error (422), not 500
    assert response.status_code == 422  # Pydantic validation error


@pytest.mark.asyncio
async def test_submit_with_invalid_grid_config_none(client, db):
    """Test submission when study has None grid_config (should fail gracefully)."""
    # Setup
    owner = User(email="grid_none@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    ws = Workspace(title="Test WS", slug="test-ws-grid")
    db.add(ws)
    await db.flush()

    # Create study with None grid_config (malformed)
    study = Study(
        slug="test-grid-none",
        workspace_id=ws.id,
        state=StudyState.active,
        default_language="en",
        grid_config=None,  # Edge case: None grid_config
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    stmt1 = Statement(study_id=study.id, code="S1")
    db.add(stmt1)
    await db.flush()

    st1 = StatementTranslation(
        statement_id=stmt1.id, language_code="en", text="Statement 1"
    )
    db.add(st1)
    await db.commit()

    # Try to submit
    session_token = uuid4()
    response = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-grid-none",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "completed",
            "presort_answers": {},
            "postsort_answers": {},
            "qsort": [
                {"statement_id": stmt1.id, "grid_score": 1, "card_comment": None}
            ],
        },
    )

    # Should fail with 500 (study config error) but gracefully
    assert response.status_code == 500
    data = response.json()
    assert "grid_config" in data["detail"].lower()


@pytest.mark.asyncio
async def test_submit_with_invalid_grid_config_type(client, db):
    """Test submission when study has invalid grid_config type (should fail gracefully)."""
    # Setup
    owner = User(email="grid_type@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    ws = Workspace(title="Test WS", slug="test-ws-grid-type")
    db.add(ws)
    await db.flush()

    # Create study with invalid grid_config type
    study = Study(
        slug="test-grid-type",
        workspace_id=ws.id,
        state=StudyState.active,
        default_language="en",
        grid_config="invalid string",  # Edge case: wrong type
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    stmt1 = Statement(study_id=study.id, code="S1")
    db.add(stmt1)
    await db.flush()

    st1 = StatementTranslation(
        statement_id=stmt1.id, language_code="en", text="Statement 1"
    )
    db.add(st1)
    await db.commit()

    # Try to submit
    session_token = uuid4()
    response = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-grid-type",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "completed",
            "presort_answers": {},
            "postsort_answers": {},
            "qsort": [
                {"statement_id": stmt1.id, "grid_score": 1, "card_comment": None}
            ],
        },
    )

    # Should fail with 500 (study config error) but gracefully
    assert response.status_code == 500
    data = response.json()
    assert "grid_config" in data["detail"].lower()


@pytest.mark.asyncio
async def test_submit_with_empty_statements(client, db):
    """Test submission when study has no statements (should fail gracefully)."""
    # Setup
    owner = User(email="empty_stmts@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    ws = Workspace(title="Test WS", slug="test-ws-empty")
    db.add(ws)
    await db.flush()

    # Create study with no statements
    study = Study(
        slug="test-empty-stmts",
        workspace_id=ws.id,
        state=StudyState.active,
        default_language="en",
        grid_config=[],  # Empty grid
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.commit()

    # Try to submit
    session_token = uuid4()
    response = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-empty-stmts",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "completed",
            "presort_answers": {},
            "postsort_answers": {},
            "qsort": [],  # Empty qsort to match empty statements
        },
    )

    # Should fail with 500 (study config error) but gracefully
    assert response.status_code == 500
    data = response.json()
    assert "statement" in data["detail"].lower()


@pytest.mark.asyncio
async def test_submit_with_oversized_postsort_answers(client, db):
    """Test submission with oversized postsort_answers (should fail with 422, not 500)."""
    # Setup
    owner = User(email="oversized@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    ws = Workspace(title="Test WS", slug="test-ws-oversized")
    db.add(ws)
    await db.flush()

    study = Study(
        slug="test-oversized",
        workspace_id=ws.id,
        state=StudyState.active,
        default_language="en",
        grid_config=[{"score": 1, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    stmt1 = Statement(study_id=study.id, code="S1")
    db.add(stmt1)
    await db.commit()

    # Create oversized postsort_answers (>100KB)
    large_string = "x" * 101000  # 101KB
    session_token = uuid4()
    response = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-oversized",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "completed",
            "presort_answers": {},
            "postsort_answers": {"large_field": large_string},  # Edge case: too large
            "qsort": [
                {"statement_id": stmt1.id, "grid_score": 1, "card_comment": None}
            ],
        },
    )

    # Should fail with validation error (422), not 500
    assert response.status_code == 422
    data = response.json()
    assert "too large" in str(data["detail"]).lower()


@pytest.mark.asyncio
async def test_submit_updates_existing_participant_postsort(client, db):
    """Test that submitting again updates postsort_answers correctly."""
    # Setup
    owner = User(email="update@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    ws = Workspace(title="Test WS", slug="test-ws-update")
    db.add(ws)
    await db.flush()

    study = Study(
        slug="test-update",
        workspace_id=ws.id,
        state=StudyState.active,
        default_language="en",
        grid_config=[{"score": 1, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    stmt1 = Statement(study_id=study.id, code="S1")
    db.add(stmt1)
    await db.commit()

    # First submission
    session_token = uuid4()
    response1 = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-update",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "started",
            "presort_answers": {"question1": "answer1"},
            "postsort_answers": {"comment": "first comment"},
            "qsort": [
                {"statement_id": stmt1.id, "grid_score": 1, "card_comment": None}
            ],
        },
    )
    assert response1.status_code == 200

    # Second submission (update)
    response2 = await client.post(
        "/api/submit",
        json={
            "study_slug": "test-update",
            "session_token": str(session_token),
            "language_used": "en",
            "status": "completed",
            "presort_answers": {"question1": "answer1"},
            "postsort_answers": {"comment": "updated comment"},  # Updated
            "qsort": [
                {"statement_id": stmt1.id, "grid_score": 1, "card_comment": "new"}
            ],
        },
    )
    assert response2.status_code == 200

    # Verify the participant was updated
    from sqlalchemy import select

    result = await db.execute(
        select(Participant).where(Participant.session_token == session_token)
    )
    participant = result.scalar_one()
    assert participant.status == ParticipantStatus.completed
    assert participant.postsort_answers == {"comment": "updated comment"}
