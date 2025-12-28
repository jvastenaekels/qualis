"""Integration tests for data collection validation."""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Statement, Study, StudyState, User


@pytest_asyncio.fixture
async def active_study(db: AsyncSession, test_user: User):
    """Creates a healthy ACTIVE study for testing submissions."""
    study = Study(
        slug="active-study",
        state=StudyState.active,
        owner_id=test_user.id,
        grid_config={"-1": 1, "0": 1, "1": 1},  # Simple 3-card grid
        presort_config={},
        postsort_config={},
        default_language="en",
        show_statement_codes=True,
    )
    db.add(study)
    await db.flush()

    # Add 3 statements to match grid capacity
    stmts = [
        Statement(study_id=study.id, code="S1"),
        Statement(study_id=study.id, code="S2"),
        Statement(study_id=study.id, code="S3"),
    ]
    db.add_all(stmts)
    await db.commit()
    await db.refresh(study, attribute_names=["statements"])
    return study


@pytest_asyncio.fixture
async def draft_study(db: AsyncSession, test_user: User):
    """Creates a DRAFT study."""
    study = Study(
        slug="draft-study",
        state=StudyState.draft,
        owner_id=test_user.id,
        grid_config={"0": 1},
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.commit()
    return study


@pytest.mark.asyncio
async def test_submission_lifecycle(client: AsyncClient, active_study: Study):
    """Test full submission flow: Start -> Complete."""
    stmts = active_study.statements
    assert len(stmts) == 3

    payload = {
        "session_token": "12345678-1234-5678-1234-567812345678",
        "study_slug": active_study.slug,
        "language_used": "en",
        "status": "completed",
        "qsort": [
            {"statement_id": stmts[0].id, "grid_score": -1},
            {"statement_id": stmts[1].id, "grid_score": 0},
            {"statement_id": stmts[2].id, "grid_score": 1},
        ],
        "presort_answers": {},
        "postsort_answers": {},
    }

    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "confirmation_code" in data


@pytest.mark.asyncio
async def test_submission_to_draft_fails(client: AsyncClient, draft_study: Study):
    """Ensure we cannot submit to a Draft study."""
    payload = {
        "session_token": "00000000-0000-0000-0000-000000000000",
        "study_slug": draft_study.slug,
        "language_used": "en",
        "status": "started",
        "qsort": [],
    }
    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 400
    assert "not active" in response.json()["detail"]


@pytest.mark.asyncio
async def test_submission_invalid_distribution(
    client: AsyncClient, active_study: Study
):
    """Test validation of Q-sort distribution (too many cards in one pile)."""
    stmts = active_study.statements

    # Grid allows one card at -1, 0, 1.
    # Let's try to put TWO cards at 0.
    payload = {
        "session_token": "11111111-1111-1111-1111-111111111111",
        "study_slug": active_study.slug,
        "language_used": "en",
        "status": "completed",
        "qsort": [
            {"statement_id": stmts[0].id, "grid_score": 0},
            {"statement_id": stmts[1].id, "grid_score": 0},
            {"statement_id": stmts[2].id, "grid_score": 1},
        ],
    }
    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 400
    assert "incorrect number of cards" in response.json()["detail"]


@pytest.mark.asyncio
async def test_submission_wrong_study_statements(
    client: AsyncClient, active_study: Study, draft_study: Study, db: AsyncSession
):
    """Ensure we can't submit statements from another study."""
    # Add a statement to draft study
    alien_stmt = Statement(study_id=draft_study.id, code="ALIEN")
    db.add(alien_stmt)
    await db.commit()

    payload = {
        "session_token": "22222222-2222-2222-2222-222222222222",
        "study_slug": active_study.slug,
        "language_used": "en",
        "status": "completed",
        "qsort": [
            # Only 1 card, but it's alien. Should fail on ownership first or count?
            # Ownership check comes before distribution check in service.
            {"statement_id": alien_stmt.id, "grid_score": 0},
        ],
    }
    response = await client.post("/api/submit", json=payload)
    assert response.status_code == 400
    assert "does not belong to study" in response.json()["detail"]
