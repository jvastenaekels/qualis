"""Consolidated integration tests for RBAC and workspace isolation."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import WorkspaceMember, WorkspaceRole
from app.utils.security import create_access_token


@pytest.mark.asyncio
class TestWorkspaceRBAC:
    """Tests for workspace-level role-based access control."""

    async def test_workspace_rbac_flow(
        self, client: AsyncClient, db: AsyncSession, user_factory, workspace_factory
    ):
        # 1. Setup
        admin = await user_factory(email="admin@ws.com")
        researcher = await user_factory(email="res@ws.com")
        viewer = await user_factory(email="view@ws.com")
        outsider = await user_factory(email="out@ws.com")

        ws = await workspace_factory(owner=admin)
        # researcher membership
        db.add(
            WorkspaceMember(
                workspace_id=ws.id, user_id=researcher.id, role=WorkspaceRole.researcher
            )
        )
        # viewer membership
        db.add(
            WorkspaceMember(
                workspace_id=ws.id, user_id=viewer.id, role=WorkspaceRole.viewer
            )
        )
        await db.commit()

        # 2. Researcher creates study (Allowed)
        headers_res = {
            "Authorization": f"Bearer {create_access_token(researcher.email)}",
            "X-Workspace-ID": str(ws.id),
        }
        payload = {
            "slug": "res-study",
            "translations": [{"language_code": "en", "title": "T", "description": "D"}],
            "grid_config": [],
            "statements": [],
            "presort_config": {},
            "postsort_config": {},
        }
        response = await client.post(
            "/api/admin/studies", json=payload, headers=headers_res
        )
        assert response.status_code == 201

        # 3. Viewer creates study (Forbidden)
        headers_view = {
            "Authorization": f"Bearer {create_access_token(viewer.email)}",
            "X-Workspace-ID": str(ws.id),
        }
        payload_view = {**payload, "slug": "view-study"}
        response = await client.post(
            "/api/admin/studies", json=payload_view, headers=headers_view
        )
        assert response.status_code == 403

        # 4. Outsider accesses study (Denied/404)
        headers_out = {"Authorization": f"Bearer {create_access_token(outsider.email)}"}
        response = await client.get("/api/admin/studies/res-study", headers=headers_out)
        assert response.status_code == 404


@pytest.mark.asyncio
class TestStudyRBAC:
    """Tests for study-level access based on workspace roles."""

    @pytest.mark.parametrize(
        "role,expected_get,expected_patch,expected_delete",
        [
            (WorkspaceRole.owner, 200, 200, 403),  # Delete is Superuser only
            (
                WorkspaceRole.researcher,
                200,
                200,
                403,
            ),  # Researcher is Editor (cannot delete)
            (WorkspaceRole.viewer, 200, 403, 403),  # Viewer (cannot edit)
        ],
    )
    async def test_study_rbac_matrix(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        workspace_member_factory,
        auth_token_factory,
        role,
        expected_get,
        expected_patch,
        expected_delete,
    ):
        owner = await user_factory()
        ws = await workspace_factory(owner=owner)
        study = await study_factory(workspace=ws, owner=owner)

        test_user = await user_factory()
        await workspace_member_factory(ws, test_user, role)
        headers = auth_token_factory(test_user)

        # GET
        res = await client.get(f"/api/admin/studies/{study.slug}", headers=headers)
        assert res.status_code == expected_get

        # PATCH
        res = await client.patch(
            f"/api/admin/studies/{study.slug}",
            json={"show_statement_codes": True},
            headers=headers,
        )
        assert res.status_code == expected_patch

        # DELETE
        # For DELETE, we need to be careful not to actually delete it before other tests?
        # But this is inside a test function so it's fine, order matters though.
        # If we delete, we can't do other checks properly if they came after.
        # But here DELETE is last.
        res = await client.delete(f"/api/admin/studies/{study.slug}", headers=headers)
        assert res.status_code == expected_delete


@pytest.mark.asyncio
class TestIsolation:
    """Tests for strict resource isolation."""

    async def test_cross_workspace_isolation(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
    ):
        # User A
        u_a = await user_factory(email="a@ws.com")
        ws_a = await workspace_factory(owner=u_a)
        await study_factory(workspace=ws_a, owner=u_a)

        # User B
        u_b = await user_factory(email="b@ws.com")
        ws_b = await workspace_factory(owner=u_b)
        s_b = await study_factory(workspace=ws_b, owner=u_b)

        # A tries to access B
        headers_a = {"Authorization": f"Bearer {create_access_token(u_a.email)}"}
        response = await client.get(f"/api/admin/studies/{s_b.slug}", headers=headers_a)
        assert response.status_code == 404
