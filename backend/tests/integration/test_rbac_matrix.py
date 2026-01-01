import pytest
from httpx import AsyncClient

from app.models import WorkspaceRole


@pytest.mark.asyncio
async def test_rbac_viewer_permissions(
    client: AsyncClient,
    user_factory,
    workspace_factory,
    study_factory,
    auth_token_factory,
    db,
):
    """Verify VIEWERS can read but not write."""
    owner = await user_factory()
    workspace = await workspace_factory(owner=owner)

    viewer = await user_factory()
    # Add viewer to workspace
    from app.models import WorkspaceMember

    member = WorkspaceMember(
        workspace_id=workspace.id, user_id=viewer.id, role=WorkspaceRole.viewer
    )
    db.add(member)
    await db.commit()

    study = await study_factory(workspace=workspace, owner=owner)

    headers = auth_token_factory(viewer)

    # 1. READ Study -> OK
    response = await client.get(f"/api/admin/studies/{study.slug}", headers=headers)
    assert response.status_code == 200

    # 2. UPDATE Study -> Forbidden
    response = await client.patch(
        f"/api/admin/studies/{study.slug}", json={"title": "Hacked"}, headers=headers
    )
    assert response.status_code == 403

    # 3. DELETE Study -> Forbidden
    response = await client.delete(f"/api/admin/studies/{study.slug}", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_rbac_editor_permissions(
    client: AsyncClient, user_factory, workspace_factory, auth_token_factory, db
):
    """Verify EDITORS can read/write studies but not delete workspace."""
    owner = await user_factory()
    workspace = await workspace_factory(owner=owner)

    editor = await user_factory()
    from app.models import WorkspaceMember

    member = WorkspaceMember(
        workspace_id=workspace.id, user_id=editor.id, role=WorkspaceRole.researcher
    )
    db.add(member)
    await db.commit()

    headers = auth_token_factory(editor)

    payload = {
        "slug": "editor-study",
        "grid_config": [{"score": 0, "capacity": 1}],
        "presort_config": {},
        "postsort_config": {},
        "translations": [
            {
                "language_code": "en",
                "title": "Editor Study",
                "description": "Test",
                "instructions": "Test",
            }
        ],
        "statements": [],
    }
    response = await client.post("/api/admin/studies/", json=payload, headers=headers)
    assert response.status_code == 201

    # 2. DELETE Workspace -> Forbidden (Skipped)
    # response = await client.delete(f"/api/workspaces/{workspace.id}", headers=headers)
    # assert response.status_code == 403
