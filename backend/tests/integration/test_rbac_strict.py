"""Strict RBAC integration tests for Study-Level permissions.

Pillar 3: Security & Permissions
- Parametrized RBAC matrix (owner/editor/viewer/anonymous)
- Cross-study isolation attack prevention
- Invitation token security validation
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import StudyRole


class TestStudyLevelRBACMatrix:
    """Parametrized tests for study-level role-based access control.

    | Role      | GET | PATCH | DELETE |
    |-----------|-----|-------|--------|
    | owner     | 200 | 200   | 204    |
    | editor    | 200 | 200   | 403    |
    | viewer    | 200 | 403   | 403    |
    | anonymous | 401 | 401   | 401    |
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "role,expected_get,expected_patch,expected_delete",
        [
            (StudyRole.owner, 200, 200, 204),
            (StudyRole.editor, 200, 200, 403),
            (StudyRole.viewer, 200, 403, 403),
            (None, 401, 401, 401),  # anonymous/no role
        ],
        ids=["owner", "editor", "viewer", "anonymous"],
    )
    async def test_rbac_matrix(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
        role,
        expected_get,
        expected_patch,
        expected_delete,
    ):
        """Test RBAC permissions for each role."""
        # Setup: Create owner and workspace
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)

        # Create study (owned by workspace admin)
        study = await study_factory(workspace=workspace, owner=owner)

        # Add owner as study collaborator with 'owner' role
        await study_collaborator_factory(study, owner, StudyRole.owner)

        if role is not None:
            # Create test user and add as collaborator with specified role
            test_user = await user_factory()
            await study_collaborator_factory(study, test_user, role)
            headers = auth_token_factory(test_user)
        else:
            # Anonymous - no token
            headers = {}

        # Test GET
        response = await client.get(f"/api/admin/studies/{study.slug}", headers=headers)
        assert response.status_code == expected_get, f"GET failed: {response.json()}"

        # Test PATCH (only if GET was successful or expecting auth failure)
        if expected_patch != 401:
            response = await client.patch(
                f"/api/admin/studies/{study.slug}",
                json={"show_statement_codes": True},
                headers=headers,
            )
        else:
            response = await client.patch(
                f"/api/admin/studies/{study.slug}",
                json={},
                headers=headers,
            )
        assert (
            response.status_code == expected_patch
        ), f"PATCH failed: {response.json()}"

        # Test DELETE
        response = await client.delete(
            f"/api/admin/studies/{study.slug}", headers=headers
        )
        assert (
            response.status_code == expected_delete
        ), f"DELETE failed: {response.json() if response.status_code != 204 else 'OK'}"


class TestStudyIsolation:
    """Tests for cross-study access prevention."""

    @pytest.mark.asyncio
    async def test_user_cannot_access_other_users_study(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """
        Given: User A owns Study A, User B owns Study B
        When: User A tries to access Study B via API
        Then: Should receive 404 Not Found
        """
        # Setup User A with Study A
        user_a = await user_factory()
        workspace_a = await workspace_factory(owner=user_a)
        study_a = await study_factory(workspace=workspace_a, owner=user_a)
        await study_collaborator_factory(study_a, user_a, StudyRole.owner)

        # Setup User B with Study B
        user_b = await user_factory()
        workspace_b = await workspace_factory(owner=user_b)
        study_b = await study_factory(workspace=workspace_b, owner=user_b)
        await study_collaborator_factory(study_b, user_b, StudyRole.owner)

        # User A tries to access Study B
        headers = auth_token_factory(user_a)
        response = await client.get(
            f"/api/admin/studies/{study_b.slug}", headers=headers
        )

        # Should be denied (404 means "doesn't exist for you")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_user_cannot_delete_other_users_study(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """
        Given: User A owns Study A, User B owns Study B
        When: User A tries to DELETE Study B
        Then: Should receive 404 (not 403) to prevent information leakage
        """
        # Setup
        user_a = await user_factory()
        workspace_a = await workspace_factory(owner=user_a)
        await study_collaborator_factory(
            await study_factory(workspace=workspace_a, owner=user_a),
            user_a,
            StudyRole.owner,
        )

        user_b = await user_factory()
        workspace_b = await workspace_factory(owner=user_b)
        study_b = await study_factory(workspace=workspace_b, owner=user_b)
        await study_collaborator_factory(study_b, user_b, StudyRole.owner)

        # Attack: User A tries to delete User B's study
        headers = auth_token_factory(user_a)
        response = await client.delete(
            f"/api/admin/studies/{study_b.slug}", headers=headers
        )

        # Should be 404 (study "doesn't exist" for this user)
        assert response.status_code == 404


class TestInvitationTokenSecurity:
    """Tests for invitation token validation."""

    @pytest.mark.asyncio
    async def test_expired_invitation_token_rejected(
        self, client: AsyncClient, db: AsyncSession
    ):
        """
        Given: An expired invitation token
        When: User tries to register with it
        Then: Should receive 400 Bad Request
        """
        from datetime import timedelta

        from app.utils.security import create_invitation_token

        # Create expired token (negative expiry)
        expired_token = create_invitation_token(
            email="test@example.com",
            study_id=1,
            role="editor",
            expires_delta=timedelta(seconds=-1),  # Already expired
        )

        response = await client.post(
            "/api/register",
            json={
                "email": "test@example.com",
                "password": "securepassword123",
                "invitation_token": expired_token,
            },
        )

        assert response.status_code == 400
        assert "expired" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_malformed_invitation_token_rejected(
        self, client: AsyncClient, db: AsyncSession
    ):
        """
        Given: A malformed/garbage invitation token
        When: User tries to register with it
        Then: Should receive 400 Bad Request
        """
        response = await client.post(
            "/api/register",
            json={
                "email": "test@example.com",
                "password": "securepassword123",
                "invitation_token": "not.a.valid.jwt.token",
            },
        )

        assert response.status_code == 400
        assert "invalid" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_invitation_token_email_mismatch_rejected(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
    ):
        """
        Given: A valid invitation token for email_a@example.com
        When: email_b@example.com tries to register with it
        Then: Should receive 400 Bad Request
        """
        from app.utils.security import create_invitation_token

        # Setup: Create a study first
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)

        # Create token for email_a
        token = create_invitation_token(
            email="email_a@example.com",
            study_id=study.id,
            role="editor",
        )

        # Attempt registration with email_b
        response = await client.post(
            "/api/register",
            json={
                "email": "email_b@example.com",
                "password": "securepassword123",
                "invitation_token": token,
            },
        )

        assert response.status_code == 400
        assert "does not match" in response.json()["detail"].lower()
