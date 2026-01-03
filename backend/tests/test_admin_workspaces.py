import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


from app.models import Workspace, WorkspaceMember, WorkspaceRole


@pytest.mark.asyncio
async def test_list_workspaces(
    client: AsyncClient,
    test_user,
    auth_token_factory,
    db: AsyncSession,
):
    """Test listing workspaces for a user."""
    # Create a workspace manually for this user
    ws = Workspace(title="Test WS", slug="test-ws")
    db.add(ws)
    await db.flush()

    member = WorkspaceMember(
        workspace_id=ws.id, user_id=test_user.id, role=WorkspaceRole.admin
    )
    db.add(member)
    await db.commit()

    headers = auth_token_factory(test_user)
    response = await client.get("/api/admin/workspaces/", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert any(d["slug"] == "test-ws" for d in data)


@pytest.mark.asyncio
async def test_create_workspace(
    client: AsyncClient,
    test_user,
    auth_token_factory,
):
    """Test creating a new workspace."""
    headers = auth_token_factory(test_user)
    payload = {"title": "New Workspace", "slug": "new-workspace-123"}
    response = await client.post(
        "/api/admin/workspaces/", headers=headers, json=payload
    )
    assert response.status_code == 201
    data = response.json()
    assert data["slug"] == "new-workspace-123"
    assert data["title"] == "New Workspace"
    assert len(data["members"]) == 1
    assert data["members"][0]["role"] == "admin"
