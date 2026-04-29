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

    async def test_get_eigenvalues_returns_kaiser_parallel_map(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """GET /eigenvalues should return the three retention indicators."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        resp = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/eigenvalues",
            headers=headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "eigenvalues" in body
        # Backward-compat field still present.
        assert "suggested_n_factors" in body
        # New retention indicators.
        assert "kaiser_n" in body
        assert "parallel_analysis_n" in body
        assert "velicer_map_n" in body
        for key in ("kaiser_n", "parallel_analysis_n", "velicer_map_n"):
            assert isinstance(body[key], int)
            assert body[key] >= 1


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
class TestAnalysisRunJudgmental:
    """Tests for POST /{slug}/analysis/run with rotation='judgmental'."""

    async def test_judgmental_persisted_on_run(
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

        manual_rotations = [
            {"factor_a": 1, "factor_b": 2, "angle_deg": 15.0},
            {"factor_a": 1, "factor_b": 2, "angle_deg": -5.0},
        ]
        run_response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "judgmental",
                "flagging": "auto",
                "manual_rotations": manual_rotations,
            },
            headers=headers,
        )
        assert run_response.status_code == 200
        data = run_response.json()
        assert data["rotation"] == "judgmental"
        assert data["manual_rotations"] == manual_rotations

        # The run should appear in the runs list with manual_rotations echoed
        runs = (
            await client.get(
                f"/api/admin/studies/{study.slug}/analysis/runs", headers=headers
            )
        ).json()
        assert len(runs) == 1
        assert runs[0]["rotation_method"] == "judgmental"
        assert runs[0]["manual_rotations"] == manual_rotations

        # GET single run should also surface manual_rotations
        run_id = runs[0]["id"]
        full = (
            await client.get(
                f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
                headers=headers,
            )
        ).json()
        assert full["manual_rotations"] == manual_rotations

    async def test_judgmental_rejects_factor_index_out_of_range(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """A manual rotation referencing factor 4 on a 2-factor solution → 422."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "judgmental",
                "flagging": "auto",
                "manual_rotations": [
                    {"factor_a": 1, "factor_b": 4, "angle_deg": 30.0}
                ],
            },
            headers=headers,
        )
        assert response.status_code == 422

    async def test_judgmental_rejects_empty_manual_rotations(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """rotation='judgmental' with no manual_rotations → 422."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "judgmental",
                "flagging": "auto",
            },
            headers=headers,
        )
        assert response.status_code == 422

    async def test_non_judgmental_rejects_manual_rotations(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """rotation='varimax' with manual_rotations payload → 422 (mixed config)."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
                "manual_rotations": [
                    {"factor_a": 1, "factor_b": 2, "angle_deg": 30.0}
                ],
            },
            headers=headers,
        )
        assert response.status_code == 422


@pytest.mark.asyncio
class TestAnalysisRunBootstrap:
    """Tests for POST /{slug}/analysis/run with bootstrap_iterations.

    Bootstrap stability (Zabala & Pascual 2016) is opt-in and additive:
    the regular result is unchanged when bootstrap is disabled.
    """

    async def test_bootstrap_attached_to_response_and_persisted(
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
                "bootstrap_iterations": 200,
            },
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["bootstrap"] is not None
        boot = data["bootstrap"]
        assert boot["n_iterations"] == 200
        assert 0 <= boot["n_converged"] <= 200
        assert isinstance(boot["statements"], list)
        assert len(boot["factor_mean_se"]) == 2
        # Statement_id must be the real study statement id, not the row index.
        if boot["statements"]:
            real_ids = {s["statement_id"] for s in boot["statements"]}
            assert all(isinstance(sid, int) and sid > 0 for sid in real_ids)

        # The persisted run carries bootstrap_iterations on the summary.
        runs = (
            await client.get(
                f"/api/admin/studies/{study.slug}/analysis/runs", headers=headers
            )
        ).json()
        assert len(runs) == 1
        assert runs[0]["bootstrap_iterations"] == 200

    async def test_bootstrap_omitted_keeps_regular_response(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """When bootstrap_iterations is null/omitted, response.bootstrap is null
        and the persisted columns are null (no behaviour change for existing flows)."""
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
        assert response.json().get("bootstrap") is None

        runs = (
            await client.get(
                f"/api/admin/studies/{study.slug}/analysis/runs", headers=headers
            )
        ).json()
        assert len(runs) == 1
        assert runs[0]["bootstrap_iterations"] is None

    async def test_bootstrap_below_minimum_iterations_rejected(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """bootstrap_iterations below the schema floor (100) → 422."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        response = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/run",
            json={
                "extraction": "pca",
                "n_factors": 2,
                "rotation": "varimax",
                "flagging": "auto",
                "bootstrap_iterations": 50,
            },
            headers=headers,
        )
        assert response.status_code == 422


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

    async def test_patch_run_factor_notes_persists_and_validates(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """factor_notes is editable via PATCH; bound to run.n_factors and
        per-value length; round-trips through GET /runs/{id}.
        """
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

        # Valid PATCH: two factor narratives.
        ok = await client.patch(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            json={
                "factor_notes": {
                    "1": "Technocratic-ecological discourse",
                    "2": "Distributive-justice discourse",
                }
            },
            headers=headers,
        )
        assert ok.status_code == 200
        body = ok.json()
        assert body["factor_notes"]["1"].startswith("Technocratic")
        assert body["factor_notes"]["2"].startswith("Distributive")

        # Round-trip via GET /runs/{id}
        full = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            headers=headers,
        )
        assert full.status_code == 200
        assert full.json()["factor_notes"]["1"].startswith("Technocratic")

        # Invalid: key out of range (n_factors=2, key=3) → 422
        out_of_range = await client.patch(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            json={"factor_notes": {"3": "should fail"}},
            headers=headers,
        )
        assert out_of_range.status_code == 422

        # Invalid: malformed key (non-integer) → 422 (schema-level)
        bad_key = await client.patch(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            json={"factor_notes": {"abc": "should fail"}},
            headers=headers,
        )
        assert bad_key.status_code == 422

        # Invalid: value too long → 422 (schema-level)
        too_long = await client.patch(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            json={"factor_notes": {"1": "x" * 4001}},
            headers=headers,
        )
        assert too_long.status_code == 422

        # Empty string clears that factor entry without affecting others.
        cleared = await client.patch(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            json={"factor_notes": {"1": "", "2": "kept"}},
            headers=headers,
        )
        assert cleared.status_code == 200
        assert cleared.json()["factor_notes"] == {"2": "kept"}

    async def test_patch_factor_notes_merges_does_not_wipe_unmentioned_keys(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """A PATCH that touches one factor's narrative must NOT wipe the
        narratives of factors not mentioned in the patch (merge semantics).
        """
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

        # Seed both narratives.
        await client.patch(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            json={"factor_notes": {"1": "first narrative", "2": "second narrative"}},
            headers=headers,
        )

        # PATCH only key "1" — "2" must survive untouched.
        single = await client.patch(
            f"/api/admin/studies/{study.slug}/analysis/runs/{run_id}",
            json={"factor_notes": {"1": "first revised"}},
            headers=headers,
        )
        assert single.status_code == 200
        assert single.json()["factor_notes"] == {
            "1": "first revised",
            "2": "second narrative",
        }

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

    async def test_comments_endpoint_filters_empty_and_orders_by_abs_score(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """Card comments endpoint returns only non-empty comments for the
        requested participants, ordered per participant by |grid_score| desc.
        """
        from sqlalchemy import select as sel

        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        # Seed factory creates 3 participants with [1,0,0,-1] / [1,0,-1,0] /
        # [-1,0,0,1] grid scores across 4 statements. We attach card_comments
        # to the first participant: one extreme, one middle, one whitespace-only.
        ps_result = await db.execute(
            sel(Participant.id)
            .where(Participant.study_id == study.id)
            .order_by(Participant.id)
        )
        participant_ids = [row[0] for row in ps_result.all()]
        first_p = participant_ids[0]

        entries_result = await db.execute(
            sel(QSortEntry)
            .where(QSortEntry.participant_id == first_p)
            .order_by(QSortEntry.statement_id)
        )
        entries = list(entries_result.scalars().all())
        # entries are ordered by statement_id; scores were [1, 0, 0, -1]
        entries[0].card_comment = "I strongly agree (extreme +1)"  # |score|=1
        entries[1].card_comment = "Lukewarm middle thought"  # |score|=0
        entries[2].card_comment = "   "  # whitespace-only → must be filtered
        entries[3].card_comment = "Strong disagreement explained"  # |score|=1
        await db.commit()

        response = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/comments"
            f"?participant_ids={first_p}",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()

        # Whitespace-only comment is excluded; we expect 3 valid comments.
        assert len(data) == 3
        assert all(d["comment"].strip() for d in data)
        assert all(d["participant_db_id"] == first_p for d in data)

        # Ordered by |grid_score| desc → the two |1| entries come before |0|.
        abs_scores = [abs(d["grid_score"]) for d in data]
        assert abs_scores == sorted(abs_scores, reverse=True)
        assert abs_scores[0] == 1
        assert abs_scores[-1] == 0

        # Each comment carries the statement code + text from the study.
        for d in data:
            assert d["statement_code"]
            assert d["statement_text"]

    async def test_comments_endpoint_is_study_scoped(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """Out-of-study participant ids must be silently dropped (no leakage)."""
        from sqlalchemy import select as sel

        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)

        ps_result = await db.execute(
            sel(Participant.id).where(Participant.study_id == study.id)
        )
        study_participant_ids = [row[0] for row in ps_result.all()]
        first_p = study_participant_ids[0]

        # Attach a comment so the endpoint has something to potentially leak.
        entry_result = await db.execute(
            sel(QSortEntry)
            .where(QSortEntry.participant_id == first_p)
            .limit(1)
        )
        entry = entry_result.scalar_one()
        entry.card_comment = "in-study rationale"
        await db.commit()

        # Pass a clearly out-of-study id alongside the real one.
        ids_param = f"{first_p},999999"
        response = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/comments"
            f"?participant_ids={ids_param}",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        # Only the legitimate id contributes — 999999 is dropped.
        assert all(d["participant_db_id"] == first_p for d in data)

    async def test_comments_endpoint_validates_input(
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
            f"/api/admin/studies/{study.slug}/analysis/comments?participant_ids=",
            headers=headers,
        )
        assert empty.status_code == 200
        assert empty.json() == []

        # Non-integer -> 400
        bad = await client.get(
            f"/api/admin/studies/{study.slug}/analysis/comments?participant_ids=abc",
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


@pytest.mark.asyncio
class TestPreviewRange:
    """Tests for POST /{slug}/analysis/preview-range."""

    async def test_preview_range_pca_varimax_returns_rows(
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
        resp = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/preview-range",
            headers=headers,
            json={
                "n_factors_range": [2],
                "extraction": "pca",
                "rotation": "varimax",
                "flagging": "auto",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "rows" in body
        assert len(body["rows"]) == 1
        row = body["rows"][0]
        assert row["n_factors"] == 2
        assert "cumulative_variance" in row
        assert "min_defining_sorts" in row
        assert "has_empty_factor" in row

    async def test_preview_range_rejects_centroid(
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
        resp = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/preview-range",
            headers=headers,
            json={
                "n_factors_range": [2],
                "extraction": "centroid",
                "rotation": "varimax",
                "flagging": "auto",
            },
        )
        assert resp.status_code == 400
        assert "PCA" in resp.json()["message"]

    async def test_preview_range_rejects_judgmental(
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
        resp = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/preview-range",
            headers=headers,
            json={
                "n_factors_range": [2],
                "extraction": "pca",
                "rotation": "judgmental",
                "flagging": "auto",
            },
        )
        assert resp.status_code == 400
        assert "judgmental" in resp.json()["message"].lower()

    async def test_preview_range_clamps_max_k(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """k must be <= min(8, n_participants - 1). Out-of-range → 400."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)
        # _make_analysis_study creates 3 participants → max k is 2.
        resp = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/preview-range",
            headers=headers,
            json={
                "n_factors_range": [2, 3],
                "extraction": "pca",
                "rotation": "varimax",
                "flagging": "auto",
            },
        )
        assert resp.status_code == 400
        assert "out of range" in resp.json()["message"]

    async def test_preview_range_rejects_unknown_extraction(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
        db,
        _make_analysis_study,
    ):
        """Unknown extraction value must surface as Pydantic 422, not router 400."""
        study = await _make_analysis_study(db, seed_study)
        headers = auth_token_factory(test_user)
        resp = await client.post(
            f"/api/admin/studies/{study.slug}/analysis/preview-range",
            headers=headers,
            json={
                "n_factors_range": [2],
                "extraction": "garbage",
                "rotation": "varimax",
                "flagging": "auto",
            },
        )
        assert resp.status_code == 422
