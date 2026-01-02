"""Integration tests for Workspace RBAC on Studies."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Workspace, WorkspaceMember, WorkspaceRole
from app.utils.security import create_access_token, get_password_hash


@pytest_asyncio.fixture
async def rbac_workspace(db: AsyncSession):
    """Creates a workspace for RBAC testing."""
    ws = Workspace(title="RBAC Workspace", slug="rbac-ws")
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    return ws


@pytest_asyncio.fixture
async def users(db: AsyncSession):
    """Creates multiple users for testing."""
    # u1: admin, u2: researcher, u3: viewer, u4: non-member
    users = []
    for i in range(1, 5):
        u = User(
            email=f"u{i}@test.com",
            hashed_password=get_password_hash("pass"),
            is_active=True,
        )
        db.add(u)
        users.append(u)
    await db.commit()
    return users


@pytest.mark.asyncio
async def test_workspace_rbac_flow(
    client: AsyncClient, users, rbac_workspace: Workspace, db: AsyncSession
):
    """Test standard RBAC flow in a workspace."""
    admin, researcher, viewer, outsider = users

    # 1. Setup Memberships
    members = [
        WorkspaceMember(
            workspace_id=rbac_workspace.id, user_id=admin.id, role=WorkspaceRole.admin
        ),
        WorkspaceMember(
            workspace_id=rbac_workspace.id,
            user_id=researcher.id,
            role=WorkspaceRole.researcher,
        ),
        WorkspaceMember(
            workspace_id=rbac_workspace.id, user_id=viewer.id, role=WorkspaceRole.viewer
        ),
    ]
    db.add_all(members)
    await db.commit()

    # 2. Admin creates a study
    admin_token = create_access_token(subject=admin.email)
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    payload = {
        "slug": "rbac-study",
        "translations": [{"language_code": "en", "title": "T", "instructions": "I"}],
        "grid_config": [{"score": 0, "capacity": 1}],
        "statements": [{"code": "S1", "translations": [{"language_code": "en", "text": "S1"}]}],
        "presort_config": {},
        "postsort_config": {},
    }
    # Admin creates
    res = await client.post("/api/admin/studies/", json=payload, headers=headers_admin)
    assert res.status_code == 201

    # 3. Researcher creates a study
    res_token = create_access_token(subject=researcher.email)
    headers_res = {"Authorization": f"Bearer {res_token}"}

    payload2 = {**payload, "slug": "rbac-study-2"}
    res2 = await client.post("/api/admin/studies/", json=payload2, headers=headers_res)
    assert res2.status_code == 201

    # 4. Viewer tries to create study -> Forbidden?
    # Logic in router: `WorkspaceMember.role.in_([WorkspaceRole.admin, WorkspaceRole.researcher])`
    view_token = create_access_token(subject=viewer.email)
    headers_view = {"Authorization": f"Bearer {view_token}"}

    payload3 = {**payload, "slug": "rbac-study-3"}
    res3 = await client.post("/api/admin/studies/", json=payload3, headers=headers_view)
    assert res3.status_code == 403

    # 5. Access Control on 'rbac-study'
    study_slug = "rbac-study"

    # Admin: DELETE (Allowed)
    # Researcher: UPDATE (Allowed)
    # Viewer: READ (Allowed), UPDATE (Denis)
    # Outsider: READ (Denied)

    # Outsider
    out_token = create_access_token(subject=outsider.email)
    headers_out = {"Authorization": f"Bearer {out_token}"}
    r = await client.get(f"/api/admin/studies/{study_slug}", headers=headers_out)
    assert r.status_code == 404  # Not found or access denied

    # Viewer can Read
    r = await client.get(f"/api/admin/studies/{study_slug}", headers=headers_view)
    assert r.status_code == 200

    # Viewer cannot Update
    r = await client.patch(
        f"/api/admin/studies/{study_slug}",
        json={"show_statement_codes": True},
        headers=headers_view,
    )
    assert r.status_code == 403

    # Researcher can Update
    r = await client.patch(
        f"/api/admin/studies/{study_slug}",
        json={"show_statement_codes": True},
        headers=headers_res,
    )
    assert r.status_code == 200

    # Researcher cannot Delete (Admin only)
    r = await client.delete(f"/api/admin/studies/{study_slug}", headers=headers_res)
    assert r.status_code == 403

    # Admin can Delete
    r = await client.delete(f"/api/admin/studies/{study_slug}", headers=headers_admin)
    assert r.status_code == 204
