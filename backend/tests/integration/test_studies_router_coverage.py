"""Additional coverage tests for admin/studies router to hit 100% endpoint coverage."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Study, StudyRole, StudyState, Participant, ParticipantStatus


class TestStudyRouterCoverage:
    """Targeted tests for missing router endpoints."""

    @pytest.mark.asyncio
    async def test_change_study_state_endpoint(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """POST /{slug}/state endpoint."""
        user = await user_factory()
        workspace = await workspace_factory(owner=user)
        study = await study_factory(workspace=workspace, owner=user)
        await study_collaborator_factory(study, user, StudyRole.owner)
        headers = auth_token_factory(user)

        # Transition to PAUSED
        response = await client.post(
            f"/api/admin/studies/{study.slug}/state",
            params={"new_state": "paused"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["state"] == "paused"

    @pytest.mark.asyncio
    async def test_update_study_structural_edit_blocked(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Cannot change grid_config if not DRAFT."""
        user = await user_factory()
        workspace = await workspace_factory(owner=user)
        study = await study_factory(workspace=workspace, owner=user)
        # Manually set state to active
        study.state = StudyState.active
        db.add(study)
        await db.commit()

        await study_collaborator_factory(study, user, StudyRole.editor)
        headers = auth_token_factory(user)

        response = await client.patch(
            f"/api/admin/studies/{study.slug}",
            json={"grid_config": [{"score": 0, "capacity": 5}]},
            headers=headers,
        )
        assert response.status_code == 400
        assert "grid structure" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_study_closed_blocked(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Cannot update CLOSED study."""
        user = await user_factory()
        workspace = await workspace_factory(owner=user)
        study = await study_factory(workspace=workspace, owner=user)
        # Manually set state to closed
        study.state = StudyState.closed
        db.add(study)
        await db.commit()

        await study_collaborator_factory(study, user, StudyRole.editor)
        headers = auth_token_factory(user)

        response = await client.patch(
            f"/api/admin/studies/{study.slug}",
            json={"slug": "new-slug"},
            headers=headers,
        )
        assert response.status_code == 400
        assert "closed study" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_get_study_stats_endpoint(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """GET /{slug}/stats endpoint."""
        user = await user_factory()
        workspace = await workspace_factory(owner=user)
        study = await study_factory(workspace=workspace, owner=user)
        await study_collaborator_factory(study, user, StudyRole.viewer)
        headers = auth_token_factory(user)

        response = await client.get(f"/api/admin/studies/{study.slug}/stats", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "started_count" in data
        assert "device_breakdown" in data

    @pytest.mark.asyncio
    async def test_participant_endpoints(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """GET /participants/{id} and PATCH /participants/{id}/discard."""
        user = await user_factory()
        workspace = await workspace_factory(owner=user)
        study = await study_factory(workspace=workspace, owner=user)
        await study_collaborator_factory(study, user, StudyRole.editor)
        headers = auth_token_factory(user)

        # Create participant
        import uuid
        p = Participant(
            study_id=study.id,
            session_token=uuid.uuid4(),
            status=ParticipantStatus.completed,
            language_used="en",
        )
        db.add(p)
        await db.commit()

        # 1. Get Participant
        response = await client.get(f"/api/admin/studies/participants/{p.id}", headers=headers)
        assert response.status_code == 200
        assert response.json()["id"] == p.id

        # 2. Discard Participant
        response = await client.patch(
            f"/api/admin/studies/participants/{p.id}/discard",
            json={"is_discarded": True, "discard_reason": "Bot"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["is_discarded"] is True

        # Verify DB
        p_id = p.id
        db.expire_all()
        p_refresh = await db.scalar(select(Participant).where(Participant.id == p_id))
        assert p_refresh.is_discarded is True

    @pytest.mark.asyncio
    async def test_update_study_nested_fields(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Update translations and statements."""
        from app.models import Statement, StatementTranslation

        user = await user_factory()
        workspace = await workspace_factory(owner=user)
        study = await study_factory(workspace=workspace, owner=user)
        
        # Add a statement manually
        s1 = Statement(study_id=study.id, code="S1")
        db.add(s1)
        await db.flush()
        db.add(StatementTranslation(statement_id=s1.id, language_code="en", text="Old Text"))
        await db.commit()
        
        # Verify statement exists
        r_verify = await db.execute(select(Statement).where(Statement.study_id == study.id))
        assert r_verify.scalar_one_or_none() is not None

        await study_collaborator_factory(study, user, StudyRole.editor)
        headers = auth_token_factory(user)

        # 1. Update Study Translations and Statement Translations
        payload = {
            "translations": [
                {
                    "language_code": "en",
                    "title": "Updated Title",
                    "description": "Updated",
                    "instructions": "I",
                    "consent_title": "C",
                    "consent_description": "L",
                    "consent_accept": "Y",
                    "consent_decline": "N",
                }
            ],
            "statements": [
                {
                    "code": "S1", # Matches code used above
                    "translations": [{"language_code": "en", "text": "Start Update"}]
                }
            ]
        }

        response = await client.patch(
            f"/api/admin/studies/{study.slug}",
            json=payload,
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check title
        en_trans = next(t for t in data["translations"] if t["language_code"] == "en")
        assert en_trans["title"] == "Updated Title"
        
        # Check statement
        stmt = next(s for s in data["statements"] if s["code"] == "S1")
        stmt_trans = next(t for t in stmt["translations"] if t["language_code"] == "en")
        assert stmt_trans["text"] == "Start Update"
