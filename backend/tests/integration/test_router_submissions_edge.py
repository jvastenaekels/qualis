"""Integration tests for edge cases in the submissions router, properly mocking DB and Service layers."""
import pytest

from app.models import Statement, Study, StudyState, User


@pytest.mark.asyncio
async def test_get_study_no_translations(client, db):
    """Test fetching a study that has absolutely no translations."""
    # Setup owner
    owner = User(email="empty@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    # Create study without any StudyTranslation
    study = Study(
        slug="empty-study",
        owner_id=owner.id,
        state=StudyState.active,
        default_language="en",
        grid_config=[],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.commit()

    response = await client.get(f"/api/study/{study.slug}")
    assert response.status_code == 200
    data = response.json()

    # Needs to fallback to slug for title
    assert data["title"] == "empty-study"
    # Empty strings for others
    assert data["description"] == ""
    assert data["instructions"] == ""
    assert data["subtitle"] is None
    assert data["objective"] is None


@pytest.mark.asyncio
async def test_get_study_statement_fallbacks_to_code(client, db):
    """Test statement text fallback when no translation exists."""
    owner = User(email="st_code@test.com", hashed_password="pw")
    db.add(owner)
    await db.flush()

    study = Study(
        slug="code-fallback-study",
        owner_id=owner.id,
        state=StudyState.active,
        grid_config=[],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    # Statement with NO translations
    s1 = Statement(study_id=study.id, code="S-CODE-1")
    db.add(s1)
    await db.commit()

    response = await client.get(f"/api/study/{study.slug}")
    assert response.status_code == 200
    data = response.json()

    assert len(data["statements"]) == 1
    # Check that text fell back to code
    assert data["statements"][0]["text"] == "S-CODE-1"
    assert data["statements"][0]["code"] == "S-CODE-1"
