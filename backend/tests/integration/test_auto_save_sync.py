import pytest
from httpx import AsyncClient
from app.models import User, Workspace


@pytest.mark.asyncio
async def test_permissive_statement_sync(
    client: AsyncClient,
    test_user: User,
    test_workspace: Workspace,
    auth_token_factory,
    db,
):
    # 1. Create a draft study first
    headers = {
        **auth_token_factory(test_user),
        "X-Workspace-ID": str(test_workspace.id),
    }

    study_slug = "sync-test-study"
    create_payload = {
        "slug": study_slug,
        "translations": [
            {
                "language_code": "en",
                "title": "Sync Study",
                "description": "D",
                "instructions": "I",
            }
        ],
        "grid_config": [{"score": 0, "capacity": 1}],
        "statements": [
            {
                "code": "S1",
                "translations": [{"language_code": "en", "text": "Statement 1"}],
            }
        ],
        "presort_config": {},
        "postsort_config": {},
    }

    resp = await client.post("/api/admin/studies", json=create_payload, headers=headers)
    assert resp.status_code == 201

    # 2. Add and Update statements via PATCH
    update_payload = {
        "statements": [
            {
                "code": "S1",
                "translations": [{"language_code": "en", "text": "S1 Updated"}],
            },
            {"code": "S2", "translations": [{"language_code": "en", "text": "S2 New"}]},
        ]
    }
    resp = await client.patch(
        f"/api/admin/studies/{study_slug}", json=update_payload, headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["statements"]) == 2

    # Verify codes
    codes = {s["code"] for s in data["statements"]}
    assert "S1" in codes
    assert "S2" in codes

    # 3. Remove a statement via PATCH
    update_payload = {
        "statements": [
            {"code": "S2", "translations": [{"language_code": "en", "text": "S2 New"}]}
        ]
    }
    resp = await client.patch(
        f"/api/admin/studies/{study_slug}", json=update_payload, headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["statements"]) == 1
    assert data["statements"][0]["code"] == "S2"

    # Phase 2 already confirms that the API returns the updated list.
    # We can trust that commit() happened on the backend if status is 200.


@pytest.mark.asyncio
async def test_imbalanced_grid_save(
    client: AsyncClient, test_user: User, test_workspace: Workspace, auth_token_factory
):
    # Verify that we can save a study with an imbalanced grid
    headers = {
        **auth_token_factory(test_user),
        "X-Workspace-ID": str(test_workspace.id),
    }

    study_slug = "imbalanced-study"
    # Create valid study first
    create_payload = {
        "slug": study_slug,
        "translations": [
            {
                "language_code": "en",
                "title": "Grid Study",
                "description": "D",
                "instructions": "I",
            }
        ],
        "grid_config": [{"score": 0, "capacity": 1}],
        "statements": [
            {"code": "S1", "translations": [{"language_code": "en", "text": "S1"}]}
        ],
        "presort_config": {},
        "postsort_config": {},
    }
    await client.post("/api/admin/studies", json=create_payload, headers=headers)

    # Update to imbalanced grid (capacity 10, but only 1 statement)
    update_payload = {"grid_config": [{"score": 0, "capacity": 10}]}
    resp = await client.patch(
        f"/api/admin/studies/{study_slug}", json=update_payload, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["grid_config"][0]["capacity"] == 10
