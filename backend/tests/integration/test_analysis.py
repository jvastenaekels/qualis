"""Integration tests for analysis API endpoints."""

import pytest
from datetime import datetime, timezone
from httpx import AsyncClient

from app.models import (
    Participant,
    ParticipantStatus,
    QSortEntry,
    Study,
    StudyState,
    User,
)


@pytest.fixture
def _make_analysis_study():
    """Factory to create a study with enough participants for analysis."""

    async def _create(db, study):
        # Ensure study is active with a proper grid_config
        study.state = StudyState.active
        study.grid_config = [
            {"score": -1, "capacity": 1},
            {"score": 0, "capacity": 2},
            {"score": 1, "capacity": 1},
        ]
        db.add(study)
        await db.flush()

        # Get statements (seed_study has 4 statements, matching grid capacity=4)
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        result = await db.execute(
            select(Study)
            .where(Study.id == study.id)
            .options(selectinload(Study.statements))
        )
        study = result.scalar_one()
        statements = sorted(study.statements, key=lambda s: s.id)

        # Add 3 completed participants with full Q-sort data
        # Two groups with opposing patterns for clear factor structure
        scores_by_participant = [
            [1, 0, 0, -1],  # P1: group A
            [1, 0, -1, 0],  # P2: group A
            [-1, 0, 0, 1],  # P3: group B (opposite)
        ]

        for p_idx, scores in enumerate(scores_by_participant):
            p = Participant(
                study_id=study.id,
                status=ParticipantStatus.completed,
                language_used="en",
                consented_at=datetime.now(timezone.utc),
                submitted_at=datetime.now(timezone.utc),
            )
            db.add(p)
            await db.flush()

            for s_idx, score in enumerate(scores):
                entry = QSortEntry(
                    participant_id=p.id,
                    statement_id=statements[s_idx].id,
                    grid_score=score,
                )
                db.add(entry)

        await db.commit()
        return study

    return _create


@pytest.mark.asyncio
class TestAnalysisEigenvalues:
    """Tests for GET /{slug}/analysis/eigenvalues."""

    async def test_eigenvalues_success(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/eigenvalues",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "eigenvalues" in data
        assert "suggested_n_factors" in data
        assert len(data["eigenvalues"]) > 0
        assert data["suggested_n_factors"] >= 1

    async def test_eigenvalues_too_few_participants(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
    ):
        """With no completed participants, should return 400."""
        headers = auth_token_factory(test_user)
        response = await client.get(
            f"/api/admin/studies/{seed_study.slug}/analysis/eigenvalues",
            headers=headers,
        )
        assert response.status_code == 400
        assert "at least 2" in response.json()["message"]

    async def test_eigenvalues_unauthenticated(
        self,
        client: AsyncClient,
        seed_study: Study,
    ):
        response = await client.get(
            f"/api/admin/studies/{seed_study.slug}/analysis/eigenvalues",
        )
        assert response.status_code == 401


@pytest.mark.asyncio
class TestAnalysisRun:
    """Tests for POST /{slug}/analysis/run."""

    async def test_run_analysis_success(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
            },
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["n_factors"] == 2
        assert data["extraction"] == "pca"
        assert data["rotation"] == "varimax"
        assert len(data["participants"]) == 3
        assert len(data["statement_scores"]) == 4
        assert len(data["factor_characteristics"]) == 2

    async def test_run_too_many_factors(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 10,
                "rotation": "varimax",
                "flagging": "auto",
            },
            headers=headers,
        )
        assert response.status_code == 400

    async def test_run_manual_flags_missing(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """Requesting manual flagging without flags should return 400."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "manual",
            },
            headers=headers,
        )
        assert response.status_code == 400
        assert "manual_flags" in response.json()["message"]

    async def test_run_centroid_no_rotation(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "centroid",
                "n_factors": 1,
                "rotation": "none",
                "flagging": "auto",
            },
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["n_factors"] == 1
        assert data["extraction"] == "centroid"

    async def test_run_unauthenticated(
        self,
        client: AsyncClient,
        seed_study: Study,
    ):
        response = await client.post(
            f"/api/admin/studies/{seed_study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
            },
        )
        assert response.status_code == 401
