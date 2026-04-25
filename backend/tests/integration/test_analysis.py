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


@pytest.mark.asyncio
class TestAnalysisRunHistory:
    """Tests for the persisted-run audit-trail endpoints."""

    async def test_run_persists_to_db_and_appears_in_list(
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

        # Run analysis
        run_response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
            },
            headers=headers,
        )
        assert run_response.status_code == 200

        # List runs — should contain exactly one
        list_response = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/runs",
            headers=headers,
        )
        assert list_response.status_code == 200
        runs = list_response.json()
        assert len(runs) == 1
        run = runs[0]
        assert run["extraction_method"] == "pca"
        assert run["n_factors"] == 2
        assert run["rotation_method"] == "varimax"
        assert run["flagging_mode"] == "auto"
        assert run["ran_by_email"] == test_user.email
        assert run["notes"] is None

    async def test_get_run_returns_full_result(
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

        # Run analysis to create a run
        await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
            },
            headers=headers,
        )

        # Find the run id
        runs = (
            await client.get(
                f"/api/admin/studies/{study.slug}/analysis/runs", headers=headers
            )
        ).json()
        run_id = runs[0]["id"]

        # Get full result
        get_response = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            headers=headers,
        )
        assert get_response.status_code == 200
        full = get_response.json()
        assert full["id"] == run_id
        assert "result" in full
        # The result payload should include the full AnalysisResult shape
        assert full["result"]["n_factors"] == 2
        assert "rotated_loadings" in full["result"]
        assert "factor_characteristics" in full["result"]

    async def test_patch_run_notes(
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

        # Run analysis
        await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
            },
            headers=headers,
        )
        run_id = (
            await client.get(
                f"/api/admin/studies/{study.slug}/analysis/runs", headers=headers
            )
        ).json()[0]["id"]

        # Patch notes
        patch_response = await client.patch(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            json={"notes": "final analysis used in submission"},
            headers=headers,
        )
        assert patch_response.status_code == 200
        assert (
            patch_response.json()["notes"]
            == "final analysis used in submission"
        )

    async def test_delete_run(
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

        # Run analysis
        await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
            },
            headers=headers,
        )
        run_id = (
            await client.get(
                f"/api/admin/studies/{study.slug}/analysis/runs", headers=headers
            )
        ).json()[0]["id"]

        # Delete
        del_response = await client.delete(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            headers=headers,
        )
        assert del_response.status_code == 204

        # List should now be empty
        list_response = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/runs",
            headers=headers,
        )
        assert list_response.status_code == 200
        assert list_response.json() == []

    async def test_audios_for_participants_returns_only_study_scoped(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """The audios endpoint must be scoped to the study, even if the
        caller passes participant ids that belong to another study."""
        from app.models import AudioRecording as AR

        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        # Get the participants that exist in this study
        from sqlalchemy import select as sel

        ps_result = await db.execute(
            sel(Participant.id).where(Participant.study_id == study.id)
        )
        study_participant_ids = [row[0] for row in ps_result.all()]
        assert len(study_participant_ids) > 0

        # Add an audio recording to the first study participant
        rec = AR(
            participant_id=study_participant_ids[0],
            question_key="post_sort_overall",
            s3_bucket="test-bucket",
            s3_key=f"audio/{study.slug}/p{study_participant_ids[0]}.webm",
            file_size_bytes=12345,
            duration_seconds=42.0,
            mime_type="audio/webm",
        )
        db.add(rec)
        await db.commit()

        # Call with an out-of-study id stuffed in — must be silently dropped
        ids_param = ",".join(str(i) for i in study_participant_ids) + ",999999"
        response = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/audios"
            f"?participant_ids={ids_param}",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        # Exactly the one recording we added; the 999999 id contributes nothing
        assert len(data) == 1
        assert data[0]["participant_db_id"] == study_participant_ids[0]
        assert data[0]["question_key"] == "post_sort_overall"

    async def test_audios_endpoint_validates_input(
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

        # Empty -> []
        empty = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/audios?participant_ids=",
            headers=headers,
        )
        assert empty.status_code == 200
        assert empty.json() == []

        # Non-integer -> 400
        bad = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/audios?participant_ids=abc",
            headers=headers,
        )
        assert bad.status_code == 400

    async def test_get_run_404_for_other_study(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """Runs are scoped to their study — accessing by id under a wrong slug
        must 404, not leak across studies."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
            },
            headers=headers,
        )
        run_id = (
            await client.get(
                f"/api/admin/studies/{study.slug}/analysis/runs", headers=headers
            )
        ).json()[0]["id"]

        # Same run id under a slug that does not exist → must be 404
        bad = await client.get(
            f"/api/admin/studies/no-such-slug/analysis/runs/{run_id}",
            headers=headers,
        )
        assert bad.status_code == 404
