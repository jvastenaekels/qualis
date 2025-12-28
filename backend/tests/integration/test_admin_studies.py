"""Integration tests for Admin Studies Management."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.utils.security import create_access_token


@pytest.mark.asyncio
async def test_create_study_flow(
    client: AsyncClient, test_user: User, db: AsyncSession
):
    """Test creating a study as an authenticated user."""
    # 1. Login/Get Token
    access_token = create_access_token(subject=test_user.email)
    headers = {"Authorization": f"Bearer {access_token}"}

    # 2. Create Study
    payload = {
        "slug": "test-study-admin",
        "translations": [
            {
                "language_code": "en",
                "title": "Test Admin Study",
                "description": "Created via API",
                "instructions": "Do the sort",
                "ui_labels": {},
            }
        ],
        "grid_config": [{"score": 1, "capacity": 2}],
        "presort_config": {},
        "postsort_config": {},
        "default_language": "en",
    }

    response = await client.post("/api/admin/studies/", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["slug"] == "test-study-admin"
    assert data["owner_id"] == test_user.id

    # 3. Verify Owner Role
    # We can check endpoints or DB, let's check retrieval

    response = await client.get("/api/admin/studies/test-study-admin", headers=headers)
    assert response.status_code == 200
    assert response.json()["slug"] == "test-study-admin"


@pytest.mark.asyncio
async def test_update_study_flow(
    client: AsyncClient, test_user: User, seed_study, db: AsyncSession
):
    """Test updating a study."""
    # Setup: Token & Study exists (seed_study created 'test-study' owned by test_user)
    # seed_study fixture ensures 'test-study' exists and is owned by 'test_user' (if we updated conftest correctly)

    access_token = create_access_token(subject=test_user.email)
    headers = {"Authorization": f"Bearer {access_token}"}

    # Ensure study is in DRAFT state for updates
    # We can use the state transition endpoint (if implemented/tested) or hack user db.
    # Since state transition checks permission, let's try direct DB but permission checks logic in router might block if we don't cheat.
    # But wait, we are creating a test flow. Let's force it via DB for setup reliability.

    # We need to access db session. 'seed_study' fixture returns the object but detached?
    # Or attached to 'db' session fixture?
    # Usually seed_study uses the same 'db' session if scoped correctly.
    # Let's try to update via DB.

    # Re-fetch attached to current 'db'
    from sqlalchemy import select

    from app.models import Study, StudyState

    result = await db.execute(select(Study).where(Study.slug == "test-study"))
    s = result.scalar_one()
    s.state = StudyState.draft
    await db.commit()

    # Update config for 'test-study' (created by fixture)
    update_payload = {"show_statement_codes": True}
    response = await client.patch(
        "/api/admin/studies/test-study", json=update_payload, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["show_statement_codes"] is True


@pytest.mark.asyncio
async def test_param_flow(
    client: AsyncClient, test_user: User, seed_study, db: AsyncSession
):
    """Test List, State Change, and Delete."""
    access_token = create_access_token(subject=test_user.email)
    headers = {"Authorization": f"Bearer {access_token}"}

    # 1. List
    response = await client.get("/api/admin/studies/", headers=headers)
    assert response.status_code == 200
    data = response.json()
    # Should contain 'test-study'
    assert any(s["slug"] == "test-study" for s in data)

    # 2. Change State
    # Note: seed_study is created as ACTIVE.
    # Current implementation restriction in update_study: "Structural changes only allowed in DRAFT".
    # But change_study_state endpoint handles state transition.

    # Switch to CLOSED
    response = await client.post(
        "/api/admin/studies/test-study/state",
        params={"new_state": "closed"},  # It's a query param in function signature?
        # Function: async def change_study_state(slug: str, new_state: StudyState, ...)
        # Defaults to query param if not Body.
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["state"] == "closed"

    # 3. Delete
    response = await client.delete("/api/admin/studies/test-study", headers=headers)
    assert response.status_code == 204

    # Verify deletion
    response = await client.get("/api/admin/studies/test-study", headers=headers)
    assert response.status_code == 404
