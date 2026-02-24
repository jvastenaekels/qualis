"""Consolidated integration tests for participant flow and study submissions."""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Study, StudyState, Statement


@pytest.mark.asyncio
class TestParticipantFlow:
    """Tests for the overall participant lifecycle."""

    async def test_full_submission_flow(self, client: AsyncClient, active_study: Study):
        """Test a complete valid submission from start to finish."""
        statements = active_study.statements
        qsort = [
            {"statement_id": statements[0].id, "grid_score": -1, "col": 0, "row": 0},
            {"statement_id": statements[1].id, "grid_score": 0, "col": 1, "row": 0},
            {"statement_id": statements[2].id, "grid_score": 0, "col": 1, "row": 1},
            {"statement_id": statements[3].id, "grid_score": 1, "col": 2, "row": 0},
        ]

        payload = {
            "session_token": str(uuid.uuid4()),
            "study_slug": active_study.slug,
            "language_used": "en",
            "status": "completed",
            "presort_answers": {"age": 25},
            "qsort": qsort,
            "postsort_answers": {"feedback": "Excellent"},
        }

        response = await client.post("/api/submit", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "confirmation_code" in data

    async def test_draft_submission(self, client: AsyncClient, active_study: Study):
        """Test saving a partial (started) submission."""
        statements = active_study.statements
        payload = {
            "session_token": str(uuid.uuid4()),
            "study_slug": active_study.slug,
            "language_used": "en",
            "status": "started",
            "qsort": [{"statement_id": statements[0].id, "grid_score": 0}],
        }
        response = await client.post("/api/submit", json=payload)
        assert response.status_code == 200
        assert response.json()["status"] == "success"


@pytest.mark.asyncio
class TestSubmissionValidation:
    """Tests for submission validation logic (grid, status, ownership)."""

    async def test_submit_to_draft_study_fails(
        self, client: AsyncClient, db: AsyncSession, user_factory, workspace_factory
    ):
        # Create a DRAFT study
        u = await user_factory()
        ws = await workspace_factory(owner=u)
        study = Study(
            slug="draft-only",
            state=StudyState.draft,
            workspace_id=ws.id,
            grid_config=[],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()

        payload = {
            "session_token": str(uuid.uuid4()),
            "study_slug": "draft-only",
            "language_used": "en",
            "status": "started",
            "qsort": [],
        }
        response = await client.post("/api/submit", json=payload)
        assert response.status_code == 400
        assert "not active" in response.json()["message"]

    async def test_invalid_grid_distribution(
        self, client: AsyncClient, active_study: Study
    ):
        """Submitting 'completed' status with wrong column counts should fail."""
        statements = active_study.statements
        # Put 4 cards in column 1 (capacity is 2)
        qsort = [
            {"statement_id": s.id, "grid_score": 0, "col": 1, "row": i}
            for i, s in enumerate(statements)
        ]

        payload = {
            "session_token": str(uuid.uuid4()),
            "study_slug": active_study.slug,
            "language_used": "en",
            "status": "completed",
            "qsort": qsort,
        }
        response = await client.post("/api/submit", json=payload)
        assert response.status_code == 400
        assert "incorrect number of cards" in response.json()["message"]

    async def test_alien_statement_rejected(
        self,
        client: AsyncClient,
        db: AsyncSession,
        active_study: Study,
        user_factory,
        workspace_factory,
    ):
        # Create another study with its own statement
        u = await user_factory()
        ws = await workspace_factory(owner=u)
        other_study = Study(
            slug="other",
            workspace_id=ws.id,
            grid_config=[],
            presort_config={},
            postsort_config={},
        )
        db.add(other_study)
        await db.flush()
        alien_stmt = Statement(study_id=other_study.id, code="ALIEN")
        db.add(alien_stmt)
        await db.commit()

        payload = {
            "session_token": str(uuid.uuid4()),
            "study_slug": active_study.slug,
            "language_used": "en",
            "status": "started",
            "qsort": [{"statement_id": alien_stmt.id, "grid_score": 0}],
        }
        response = await client.post("/api/submit", json=payload)
        assert response.status_code == 400
        assert "does not belong" in response.json()["message"]
