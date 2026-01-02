"""Comprehensive integration tests for admin/studies router.

Target: >90% coverage for routers/admin/studies.py
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Study, StudyRole, StudyState


class TestCreateStudy:
    """Tests for POST /api/admin/studies/"""

    @pytest.mark.asyncio
    async def test_create_study_success(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        auth_token_factory,
    ):
        """Admin/researcher can create a study."""
        user = await user_factory()
        await workspace_factory(owner=user)
        headers = auth_token_factory(user)

        payload = {
            "slug": "new-study",
            "translations": [
                {
                    "language_code": "en",
                    "title": "Test Study",
                    "description": "Description",
                    "instructions": "Instructions",
                    "consent_title": "Consent",
                    "consent_description": "Legal",
                    "consent_accept": "Yes",
                    "consent_decline": "No",
                }
            ],
            "grid_config": [{"score": 0, "capacity": 1}],
            "statements": [
                {"code": "S1", "translations": [{"language_code": "en", "text": "S1 text"}]}
            ],
            "presort_config": {},
            "postsort_config": {},
        }

        response = await client.post("/api/admin/studies/", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()
        assert data["slug"] == "new-study"

    @pytest.mark.asyncio
    async def test_create_study_duplicate_slug_rejected(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        auth_token_factory,
    ):
        """Cannot create study with duplicate slug."""
        user = await user_factory()
        workspace = await workspace_factory(owner=user)
        existing = await study_factory(workspace=workspace, owner=user)
        headers = auth_token_factory(user)

        payload = {
            "slug": existing.slug,  # Duplicate!
            "translations": [
                {
                    "language_code": "en",
                    "title": "Dup",
                    "description": "D",
                    "instructions": "I",
                    "consent_title": "C",
                    "consent_description": "L",
                    "consent_accept": "Y",
                    "consent_decline": "N",
                }
            ],
            "grid_config": [{"score": 0, "capacity": 1}],
            "statements": [{"code": "S1", "translations": [{"language_code": "en", "text": "S1"}]}],
            "presort_config": {},
            "postsort_config": {},
        }

        response = await client.post("/api/admin/studies/", json=payload, headers=headers)
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_create_study_no_workspace_forbidden(
        self, client: AsyncClient, user_factory, auth_token_factory
    ):
        """User without workspace cannot create study."""
        user = await user_factory()
        headers = auth_token_factory(user)

        payload = {
            "slug": "orphan-study",
            "translations": [
                {
                    "language_code": "en",
                    "title": "Orphan",
                    "description": "D",
                    "instructions": "I",
                    "consent_title": "C",
                    "consent_description": "L",
                    "consent_accept": "Y",
                    "consent_decline": "N",
                }
            ],
            "grid_config": [{"score": 0, "capacity": 1}],
            "statements": [{"code": "S1", "translations": [{"language_code": "en", "text": "S1"}]}],
            "presort_config": {},
            "postsort_config": {},
        }

        response = await client.post("/api/admin/studies/", json=payload, headers=headers)
        assert response.status_code == 403


class TestListStudies:
    """Tests for GET /api/admin/studies/"""

    @pytest.mark.asyncio
    async def test_list_studies_returns_owned_studies(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """User sees studies they collaborate on."""
        user = await user_factory()
        workspace = await workspace_factory(owner=user)
        study = await study_factory(workspace=workspace, owner=user)
        await study_collaborator_factory(study, user, StudyRole.owner)
        headers = auth_token_factory(user)

        response = await client.get("/api/admin/studies/", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert any(s["slug"] == study.slug for s in data)

    @pytest.mark.asyncio
    async def test_list_studies_excludes_others(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """User cannot see studies from other workspaces."""
        user_a = await user_factory()
        user_b = await user_factory()

        ws_a = await workspace_factory(owner=user_a)
        ws_b = await workspace_factory(owner=user_b)

        study_a = await study_factory(workspace=ws_a, owner=user_a)
        study_b = await study_factory(workspace=ws_b, owner=user_b)

        await study_collaborator_factory(study_a, user_a, StudyRole.owner)
        await study_collaborator_factory(study_b, user_b, StudyRole.owner)

        headers = auth_token_factory(user_a)
        response = await client.get("/api/admin/studies/", headers=headers)
        data = response.json()

        slugs = [s["slug"] for s in data]
        assert study_a.slug in slugs
        assert study_b.slug not in slugs


class TestGetStudy:
    """Tests for GET /api/admin/studies/{slug}"""

    @pytest.mark.asyncio
    async def test_get_study_as_collaborator(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Collaborator can read study details."""
        owner = await user_factory()
        viewer = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)
        await study_collaborator_factory(study, viewer, StudyRole.viewer)

        headers = auth_token_factory(viewer)
        response = await client.get(f"/api/admin/studies/{study.slug}", headers=headers)
        assert response.status_code == 200
        assert response.json()["slug"] == study.slug

    @pytest.mark.asyncio
    async def test_get_study_not_found(
        self, client: AsyncClient, user_factory, workspace_factory, auth_token_factory
    ):
        """Non-existent study returns 404."""
        user = await user_factory()
        await workspace_factory(owner=user)
        headers = auth_token_factory(user)

        response = await client.get("/api/admin/studies/nonexistent", headers=headers)
        assert response.status_code == 404


class TestUpdateStudy:
    """Tests for PATCH /api/admin/studies/{slug}"""

    @pytest.mark.asyncio
    async def test_update_study_as_editor(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Editor can update study fields."""
        owner = await user_factory()
        editor = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)
        await study_collaborator_factory(study, editor, StudyRole.editor)

        headers = auth_token_factory(editor)
        response = await client.patch(
            f"/api/admin/studies/{study.slug}",
            json={"show_statement_codes": True},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["show_statement_codes"] is True

    @pytest.mark.asyncio
    async def test_update_study_state_transition(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Owner can change study state."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)

        headers = auth_token_factory(owner)
        response = await client.patch(
            f"/api/admin/studies/{study.slug}",
            json={"state": "paused"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["state"] == "paused"


class TestDeleteStudy:
    """Tests for DELETE /api/admin/studies/{slug}"""

    @pytest.mark.asyncio
    async def test_delete_study_as_owner(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Owner can delete study."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)
        slug = study.slug

        headers = auth_token_factory(owner)
        response = await client.delete(f"/api/admin/studies/{slug}", headers=headers)
        assert response.status_code == 204

        # Verify deleted
        result = await db.execute(select(Study).where(Study.slug == slug))
        assert result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_delete_study_as_editor_forbidden(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Editor cannot delete study."""
        owner = await user_factory()
        editor = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)
        await study_collaborator_factory(study, editor, StudyRole.editor)

        headers = auth_token_factory(editor)
        response = await client.delete(f"/api/admin/studies/{study.slug}", headers=headers)
        assert response.status_code == 403


class TestStudyParticipants:
    """Tests for participant-related endpoints."""

    @pytest.mark.asyncio
    async def test_get_participants_empty(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """New study has no participants."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)

        headers = auth_token_factory(owner)
        response = await client.get(
            f"/api/admin/studies/{study.slug}/participants", headers=headers
        )
        assert response.status_code == 200
        assert response.json() == []
