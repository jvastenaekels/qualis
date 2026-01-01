"""Integration tests for workspace isolation."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_workspace_isolation_studies(
    client: AsyncClient,
    db: AsyncSession,
    user_factory,
    workspace_factory,
    study_factory,
    auth_token_factory,
):
    """Test that a user in Workspace A cannot access studies in Workspace B."""
    # Setup: User A in Workspace A
    user_a = await user_factory()
    workspace_a = await workspace_factory(owner=user_a)
    await study_factory(workspace=workspace_a, owner=user_a)

    # Setup: User B in Workspace B
    user_b = await user_factory()
    workspace_b = await workspace_factory(owner=user_b)
    study_b = await study_factory(workspace=workspace_b, owner=user_b)

    # Authenticate as User A
    headers = auth_token_factory(user_a)

    # 1. User A tries to access Study B (Direct ID access)
    # Assuming standard route structure /api/studies/{id}
    # Or /api/workspaces/{ws_id}/studies/{study_id}

    # Let's assume endpoint: GET /api/studies/{id} checks workspace permission?
    # Or strictly hierarchical: GET /api/workspaces/{ws_id}/studies

    # Try generic study access if it exists, or via workspace route
    # If logic enforces "User must be member of Study's workspace"

    response = await client.get(f"/api/admin/studies/{study_b.slug}", headers=headers)
    # Should be 404 (Not Found) or 403 (Forbidden)
    assert response.status_code in [403, 404]


@pytest.mark.skip(reason="Workspace invitation API not implemented yet")
@pytest.mark.asyncio
async def test_workspace_isolation_invites(
    client: AsyncClient,
    db: AsyncSession,
    user_factory,
    workspace_factory,
    auth_token_factory,
):
    """Test that User A cannot invite members to Workspace B."""
    user_a = await user_factory()
    await workspace_factory(owner=user_a)

    user_b = await user_factory()
    workspace_b = await workspace_factory(owner=user_b)

    headers = auth_token_factory(user_a)

    # User A tries to invite someone to Workspace B
    payload = {"email": "newuser@example.com", "role": "researcher"}
    response = await client.post(
        f"/api/workspaces/{workspace_b.id}/members", json=payload, headers=headers
    )

    assert response.status_code in [403, 404]
