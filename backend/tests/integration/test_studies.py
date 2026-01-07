"""Consolidated integration tests for study management, configuration, and lifecycle."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Study,
    StudyState,
    User,
    Workspace,
    StudyTranslation,
    Statement,
    StatementTranslation,
)


@pytest.mark.asyncio
class TestStudyPublic:
    """Tests for the public study configuration API (used by participants)."""

    async def test_get_study_config(self, client: AsyncClient, seed_study: Study):
        response = await client.get(f"/api/study/{seed_study.slug}")
        assert response.status_code == 200
        data = response.json()
        assert data["slug"] == seed_study.slug
        assert data["title"] == "Test Study"
        assert len(data["statements"]) == 4

    async def test_get_study_not_found(self, client: AsyncClient):
        response = await client.get("/api/study/non-existent-slug")
        assert response.status_code == 404

    async def test_language_resolution_cascade(
        self, client: AsyncClient, db: AsyncSession, user_factory, workspace_factory
    ):
        """Priority: Requested Lang -> Default (Study) -> English -> First Available."""
        user = await user_factory()
        ws = await workspace_factory(owner=user)
        study = Study(
            slug="lang-study",
            workspace_id=ws.id,
            state=StudyState.active,
            default_language="fr",
            grid_config=[],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.flush()

        translations = [
            StudyTranslation(
                study_id=study.id, language_code="en", title="Title EN", description=""
            ),
            StudyTranslation(
                study_id=study.id, language_code="fr", title="Title FR", description=""
            ),
            StudyTranslation(
                study_id=study.id, language_code="fi", title="Title FI", description=""
            ),
        ]
        db.add_all(translations)
        await db.commit()

        # Case 1: Requested Lang (FI)
        response = await client.get(f"/api/study/{study.slug}?lang=fi")
        assert response.json()["title"] == "Title FI"

        # Case 2: No request lang (Defaults to EN)
        response = await client.get(f"/api/study/{study.slug}")
        assert response.json()["title"] == "Title EN"

        # Case 3: Study Default (FR)
        slug = study.slug
        await db.execute(
            delete(StudyTranslation).where(StudyTranslation.language_code == "en")
        )
        await db.commit()
        db.expire_all()
        response = await client.get(f"/api/study/{slug}")
        assert response.json()["title"] == "Title FR"

    async def test_statement_fallbacks(
        self, client: AsyncClient, db: AsyncSession, user_factory, workspace_factory
    ):
        user = await user_factory()
        ws = await workspace_factory(owner=user)
        study = Study(
            slug="opts-study",
            workspace_id=ws.id,
            state=StudyState.active,
            grid_config=[],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.flush()

        db.add(
            StudyTranslation(
                study_id=study.id, language_code="fi", title="T FI", description=""
            )
        )
        s1 = Statement(study_id=study.id, code="S1")
        db.add(s1)
        await db.flush()
        db.add(
            StatementTranslation(statement_id=s1.id, language_code="en", text="Text EN")
        )
        await db.commit()

        # Request FI, s1 should fallback to EN
        response = await client.get(f"/api/study/{study.slug}?lang=fi")
        assert response.json()["statements"][0]["text"] == "Text EN"


@pytest.mark.asyncio
class TestStudyAdmin:
    """Tests for study management via admin routes."""

    async def test_create_study_success(
        self,
        client: AsyncClient,
        test_user: User,
        test_workspace: Workspace,
        auth_token_factory,
    ):
        headers = {
            **auth_token_factory(test_user),
            "X-Workspace-ID": str(test_workspace.id),
        }
        payload = {
            "slug": "new-study-admin",
            "translations": [
                {"language_code": "en", "title": "Admin Study", "description": "D"}
            ],
            "grid_config": [{"score": 0, "capacity": 1}],
            "statements": [
                {"code": "S1", "translations": [{"language_code": "en", "text": "S1"}]}
            ],
            "presort_config": {},
            "postsort_config": {},
        }
        response = await client.post(
            "/api/admin/studies/", json=payload, headers=headers
        )
        assert response.status_code == 201
        assert response.json()["slug"] == "new-study-admin"

    async def test_list_studies(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        test_workspace: Workspace,
    ):
        headers = {
            **auth_token_factory(test_user),
            "X-Workspace-ID": str(test_workspace.id),
        }
        response = await client.get("/api/admin/studies/", headers=headers)
        assert response.status_code == 200
        assert any(s["slug"] == seed_study.slug for s in response.json())

    async def test_update_study(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        test_workspace: Workspace,
        db: AsyncSession,
    ):
        headers = {
            **auth_token_factory(test_user),
            "X-Workspace-ID": str(test_workspace.id),
        }
        # Ensure DRAFT for update if needed, but the router allows update in active usually
        response = await client.patch(
            f"/api/admin/studies/{seed_study.slug}",
            json={"show_statement_codes": True},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["show_statement_codes"] is True

    async def test_delete_study(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        test_workspace: Workspace,
        db: AsyncSession,
    ):
        # 1. Promote user to Superuser
        test_user.is_superuser = True

        # 2. Archive the study
        seed_study.state = StudyState.archived
        await db.commit()

        headers = {
            **auth_token_factory(test_user),
            "X-Workspace-ID": str(test_workspace.id),
        }
        slug = seed_study.slug
        response = await client.delete(f"/api/admin/studies/{slug}", headers=headers)
        assert response.status_code == 204

        # Verify 404
        response = await client.get(f"/api/admin/studies/{slug}", headers=headers)
        assert response.status_code == 404


@pytest.mark.asyncio
class TestStudyLifecycle:
    """Tests for state transitions and submissions constraints."""

    async def test_state_transitions(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        test_workspace: Workspace,
        auth_token_factory,
    ):
        headers = {
            **auth_token_factory(test_user),
            "X-Workspace-ID": str(test_workspace.id),
        }

        # Pause study
        response = await client.post(
            f"/api/admin/studies/{seed_study.slug}/state",
            params={"new_state": "paused"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["state"] == "paused"

    async def test_sync_study_from_file(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        test_workspace: Workspace,
    ):
        """Test the logic of synchronizing studies from JSON (used by seed/CLI)."""
        import json
        import os
        from app.utils.script_utils import sync_study_from_file
        import app.utils.script_utils as script_utils_module

        # Set env vars for seeds (matching test_user from conftest)
        os.environ["ADMIN_EMAIL"] = test_user.email
        os.environ["ADMIN_PASSWORD"] = "testpassword"

        study_data = {
            "slug": "seed-via-api",
            "default_language": "en",
            "grid_config": [{"score": 0, "capacity": 1}],
            "presort_config": {},
            "postsort_config": {},
            "translations": {
                "en": {
                    "title": "Seed Title",
                    "instructions": "test",
                    "consent_title": "consent",
                }
            },
            "statements": [{"code": "S1", "translations": {"en": "Statement 1"}}],
        }

        tmp_path = "tmp_study.json"
        with open(tmp_path, "w") as f:
            json.dump(study_data, f)

        orig_api_cls = script_utils_module.APIClient
        script_utils_module.APIClient = lambda *args, **kwargs: orig_api_cls(  # type: ignore
            client=client
        )

        # Inject workspace context globally for this client instance
        client.headers["X-Workspace-ID"] = str(test_workspace.id)

        try:
            await sync_study_from_file(tmp_path)
            result = await db.execute(select(Study).where(Study.slug == "seed-via-api"))
            study = result.scalars().first()
            assert study is not None
            assert study.workspace_id == test_workspace.id
        finally:
            script_utils_module.APIClient = orig_api_cls  # type: ignore
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
