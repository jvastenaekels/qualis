import pytest
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.models import Workspace, WorkspaceMember, WorkspaceRole


@pytest.mark.asyncio
async def test_list_workspaces(
    async_client: AsyncClient,
    normal_user_token_headers: dict[str, str],
    normal_user: dict,
    db: Session,
):
    """Test listing workspaces for a user."""
    # Create a workspace manually for this user
    ws = Workspace(title="Test WS", slug="test-ws")
    db.add(ws)
    db.commit()
    
    member = WorkspaceMember(
        workspace_id=ws.id, user_id=normal_user["id"], role=WorkspaceRole.admin
    )
    db.add(member)
    db.commit()

    response = await async_client.get(
        "/api/admin/workspaces", headers=normal_user_token_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["slug"] == "test-ws"


@pytest.mark.asyncio
async def test_create_workspace(
    async_client: AsyncClient,
    normal_user_token_headers: dict[str, str],
):
    """Test creating a new workspace."""
    payload = {
        "title": "New Workspace",
        "slug": "new-workspace-123"
    }
    response = await async_client.post(
        "/api/admin/workspaces", 
        headers=normal_user_token_headers,
        json=payload
    )
    assert response.status_code == 201
    data = response.json()
    assert data["slug"] == "new-workspace-123"
    assert data["title"] == "New Workspace"
    assert len(data["members"]) == 1
    assert data["members"][0]["role"] == "admin"
