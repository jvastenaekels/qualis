"""API router for Q-method factor analysis."""

import asyncio
import logging
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request, status
from numpy.typing import NDArray
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from datetime import UTC, datetime, timedelta

from ...database import get_db
from ...dependencies import check_study_permission, get_current_user
from ...limiter import limiter
from ...models import (
    AnalysisRun,
    AudioRecording,
    Participant,
    QSortEntry,
    Statement,
    Study,
    StudyRole,
    User,
)
from ...schemas import (
    AnalysisRequest,
    AnalysisResult,
    AnalysisRunPatch,
    AnalysisRunRead,
    AnalysisRunSummary,
    BootstrapResult,
    BootstrapStatementStability,
    EigenvalueResult,
    FactorCharacteristic,
    ParticipantAudioRecording,
    ParticipantCardComment,
    ParticipantLoading,
    PreviewRangeRequest,
    PreviewRangeResponse,
    PreviewRangeRow,
    StatementClassification,
    StatementScore,
)
from ...services.analysis_service import (
    apply_manual_flags,
    build_sort_matrix,
    compute_bootstrap_stability,
    compute_eigenvalues,
    compute_parallel_analysis_n,
    compute_preview_range,
    compute_velicer_map_n,
    correlation_matrix,
    run_analysis,
)
from ...services.storage_service import storage_service
from ...types.wire import SortDataDump, StatementDumpRecord

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin Analysis"])


def _get_statement_text(stmt: StatementDumpRecord, lang: str = "en") -> str:
    """Get statement text for the preferred language, fallback to first available."""
    for t in stmt["translations"]:
        if t["lang"] == lang:
            return t["text"]
    translations = stmt["translations"]
    return translations[0]["text"] if translations else stmt["code"]


def _build_z_scores_list(
    z_scores: NDArray[np.float64], s_idx: int, n_factors: int
) -> list[float]:
    """Extract z-scores for a statement, replacing NaN with 0.0."""
    return [
        float(z_scores[s_idx, f]) if not np.isnan(z_scores[s_idx, f]) else 0.0
        for f in range(n_factors)
    ]


def _build_factor_arrays_list(
    factor_arrays: NDArray[np.int64], s_idx: int, n_factors: int
) -> list[int]:
    """Extract factor array values for a statement."""
    return [int(factor_arrays[s_idx, f]) for f in range(n_factors)]


async def _get_analysis_dump(db: AsyncSession, study_id: int) -> SortDataDump:
    """Get a lightweight study dump for analysis (no audio/presigned URLs)."""
    from ...services.study_data_service import StudyDataService

    return await StudyDataService.get_study_sort_data(db, study_id)


@router.get("/{slug}/analysis/eigenvalues")
@limiter.limit("30/minute")
async def get_eigenvalues(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> EigenvalueResult:
    """Compute eigenvalues for the scree plot (before running full analysis)."""
    dump = await _get_analysis_dump(db, study.id)

    try:
        dataset, _participants, _statements = build_sort_matrix(dump)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        cor = correlation_matrix(dataset)
        eigenvalues, kaiser_n = await asyncio.to_thread(
            lambda: compute_eigenvalues(cor)
        )
        parallel_n = await asyncio.to_thread(
            lambda: compute_parallel_analysis_n(dataset)
        )
        map_n = await asyncio.to_thread(lambda: compute_velicer_map_n(cor))
    except (np.linalg.LinAlgError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to compute eigenvalues: {e}",
        )

    return EigenvalueResult(
        eigenvalues=eigenvalues,
        kaiser_n=kaiser_n,
        parallel_analysis_n=parallel_n,
        velicer_map_n=map_n,
        suggested_n_factors=kaiser_n,
    )


@router.post("/{slug}/analysis/run")
@limiter.limit("10/minute")
async def run_factor_analysis(
    request: Request,
    body: AnalysisRequest,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisResult:
    """Run a complete Q-method factor analysis and persist it as an AnalysisRun.

    Every successful run is saved to `analysis_runs` for audit-trail purposes
    (critical Q-methodology transparency requirement). The returned payload
    is unchanged for backward compatibility; the persisted run is retrievable
    via the list / get endpoints below.
    """
    dump = await _get_analysis_dump(db, study.id)

    try:
        dataset, valid_participants, statements = build_sort_matrix(dump)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    n_statements, n_participants = dataset.shape

    if body.n_factors > n_participants:
        raise HTTPException(
            status_code=400,
            detail=f"n_factors ({body.n_factors}) cannot exceed the number of valid participants ({n_participants})",
        )
    if body.n_factors > n_statements:
        raise HTTPException(
            status_code=400,
            detail=f"n_factors ({body.n_factors}) cannot exceed the number of statements ({n_statements})",
        )

    # Validate manual flagging request
    if body.flagging == "manual" and not body.manual_flags:
        raise HTTPException(
            status_code=400,
            detail="manual_flags is required when flagging='manual'",
        )

    # Build manual flags matrix if needed
    manual_flags_matrix = None
    if body.flagging == "manual" and body.manual_flags:
        participant_db_ids = [p["db_id"] for p in valid_participants]
        manual_flags_matrix = apply_manual_flags(
            n_participants, body.n_factors, body.manual_flags, participant_db_ids
        )

    # Extract grid_config for the forced distribution
    grid_config = dump.get("study", {}).get("grid_config")

    # Convert ManualRotation Pydantic models to plain dicts for the service.
    # The service stays decoupled from Pydantic; the schema-level cross-field
    # validator (rotation='judgmental' ⇒ non-empty manual_rotations) has
    # already run by the time we get here.
    manual_rotations_payload: list[dict[str, object]] | None = (
        [r.model_dump() for r in body.manual_rotations]
        if body.manual_rotations
        else None
    )

    try:
        result = await asyncio.to_thread(
            run_analysis,
            dataset=dataset,
            n_factors=body.n_factors,
            extraction=body.extraction,
            rotation=body.rotation,
            flagging=body.flagging,
            manual_flags_matrix=manual_flags_matrix,
            manual_rotations=manual_rotations_payload,
            grid_config=grid_config,
        )
    except (ValueError, np.linalg.LinAlgError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Determine study language for statement text
    study_lang = study.default_language or "en"

    # Build participant loadings (report ALL flagged factors, not just first)
    participants_out: list[ParticipantLoading] = []
    for i, p in enumerate(valid_participants):
        flag_row = result["flags"][i]
        flagged_factors = [f + 1 for f in range(body.n_factors) if flag_row[f]]

        participants_out.append(
            ParticipantLoading(
                db_id=p["db_id"],
                label=p["id"],
                loadings=[float(v) for v in result["rotated_loadings"][i]],
                flagged_factors=flagged_factors,
            )
        )

    # Build statement scores
    z_scores = result["z_scores"]
    factor_arrays = result["factor_arrays"]
    n_factors = body.n_factors

    statement_scores: list[StatementScore] = []
    for s_idx, stmt in enumerate(statements):
        statement_scores.append(
            StatementScore(
                statement_id=stmt["id"],
                code=stmt["code"],
                text=_get_statement_text(stmt, study_lang),
                z_scores=_build_z_scores_list(z_scores, s_idx, n_factors),
                factor_arrays=_build_factor_arrays_list(
                    factor_arrays, s_idx, n_factors
                ),
            )
        )

    # Build distinguishing statements
    distinguishing_out: list[StatementClassification] = []
    for d in result["distinguishing"]:
        s_idx = d["statement_idx"]
        stmt = statements[s_idx]
        distinguishing_out.append(
            StatementClassification(
                statement_id=stmt["id"],
                code=stmt["code"],
                text=_get_statement_text(stmt, study_lang),
                z_scores=_build_z_scores_list(z_scores, s_idx, n_factors),
                factor_arrays=_build_factor_arrays_list(
                    factor_arrays, s_idx, n_factors
                ),
                significance=d["significance"],
            )
        )

    # Build consensus statements
    consensus_out: list[StatementClassification] = []
    for c in result["consensus"]:
        s_idx = c["statement_idx"]
        stmt = statements[s_idx]
        consensus_out.append(
            StatementClassification(
                statement_id=stmt["id"],
                code=stmt["code"],
                text=_get_statement_text(stmt, study_lang),
                z_scores=_build_z_scores_list(z_scores, s_idx, n_factors),
                factor_arrays=_build_factor_arrays_list(
                    factor_arrays, s_idx, n_factors
                ),
                significance=c["significance"],
            )
        )

    # Optional: bootstrap stability (Zabala & Pascual 2016).
    # Run AFTER the regular analysis so a fast-feedback failure of the
    # main pipeline isn't masked by the long bootstrap loop. If the
    # bootstrap itself fails we still return the regular result — the
    # bootstrap is purely additive.
    bootstrap_payload: BootstrapResult | None = None
    if body.bootstrap_iterations is not None:
        try:
            bootstrap_raw = await asyncio.to_thread(
                compute_bootstrap_stability,
                dataset,
                body.bootstrap_iterations,
                n_factors=body.n_factors,
                extraction=body.extraction,
                rotation=body.rotation,
                manual_rotations=manual_rotations_payload,
                grid_config=grid_config,
            )
            # Translate row-indices in `statements` to real statement ids.
            stability_out: list[BootstrapStatementStability] = []
            for entry in bootstrap_raw["statements"]:
                idx = entry["statement_idx"]
                if idx < 0 or idx >= len(statements):
                    continue
                stability_out.append(
                    BootstrapStatementStability(
                        statement_id=statements[idx]["id"],
                        factor=entry["factor"],
                        z_mean=entry["z_mean"],
                        z_se=entry["z_se"],
                        ci_lower=entry["ci_lower"],
                        ci_upper=entry["ci_upper"],
                    )
                )
            bootstrap_payload = BootstrapResult(
                n_iterations=bootstrap_raw["n_iterations"],
                n_converged=bootstrap_raw["n_converged"],
                statements=stability_out,
                factor_mean_se=bootstrap_raw["factor_mean_se"],
            )
        except (ValueError, np.linalg.LinAlgError) as e:
            # Non-fatal: log and continue. The regular result is still
            # returned without bootstrap data.
            logger.warning(
                "Bootstrap failed for study=%s: %s — returning result without bootstrap.",
                study.slug,
                e,
            )

    analysis_result = AnalysisResult(
        n_participants=result["n_participants"],
        n_statements=result["n_statements"],
        n_factors=result["n_factors"],
        extraction=result["extraction"],
        rotation=result["rotation"],
        eigenvalues=result["eigenvalues"],
        total_variance_explained=result["total_variance_explained"],
        loadings=[[float(v) for v in row] for row in result["unrotated_loadings"]],
        rotated_loadings=[
            [float(v) for v in row] for row in result["rotated_loadings"]
        ],
        flags=[[bool(v) for v in row] for row in result["flags"]],
        participants=participants_out,
        statement_scores=statement_scores,
        distinguishing=distinguishing_out,
        consensus=consensus_out,
        factor_characteristics=[
            FactorCharacteristic(**c) for c in result["factor_characteristics"]
        ],
        correlation_matrix=[
            [float(v) for v in row] for row in result["factor_correlation"]
        ],
        manual_rotations=list(body.manual_rotations) if body.manual_rotations else [],
        bootstrap=bootstrap_payload,
    )

    # Persist the run as part of the audit trail. We persist on the success
    # path only; failed analyses do not create runs (the user already saw
    # the error and can retry with different parameters).
    run = AnalysisRun(
        study_id=study.id,
        ran_by_user_id=current_user.id,
        extraction_method=body.extraction,
        n_factors=body.n_factors,
        rotation_method=body.rotation,
        flagging_mode=body.flagging,
        notes=None,
        factor_notes={},
        manual_rotations=manual_rotations_payload,
        bootstrap_iterations=body.bootstrap_iterations
        if bootstrap_payload is not None
        else None,
        bootstrap_result=bootstrap_payload.model_dump(mode="json")
        if bootstrap_payload is not None
        else None,
        result=analysis_result.model_dump(mode="json"),
    )
    db.add(run)
    await db.commit()
    logger.info(
        "AnalysisRun persisted: study=%s run_id=%s by user_id=%s "
        "(extraction=%s, rotation=%s, n_factors=%d, flagging=%s)",
        study.slug,
        run.id,
        current_user.id,
        body.extraction,
        body.rotation,
        body.n_factors,
        body.flagging,
    )

    return analysis_result


@router.post("/{slug}/analysis/preview-range")
@limiter.limit("10/minute")
async def preview_range(
    request: Request,
    body: PreviewRangeRequest,
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> PreviewRangeResponse:
    """Compute summaries for a range of n_factors values without persisting.

    Gated to PCA + varimax (or no rotation): centroid extraction (Brown 1980)
    and judgmental rotation are path-dependent, so previewing them would
    silently mislead. Bootstrap is excluded — it is not a retention criterion
    and would dominate the cost budget.
    """
    if body.extraction != "pca":
        raise HTTPException(
            status_code=400,
            detail="Preview range supports PCA extraction only "
            "(centroid is path-dependent; commit a real run to inspect).",
        )
    if body.rotation not in {"varimax", "none"}:
        raise HTTPException(
            status_code=400,
            detail="Preview range supports varimax rotation only "
            "(judgmental rotation is path-dependent; commit a real run to inspect).",
        )

    dump = await _get_analysis_dump(db, study.id)
    try:
        # Re-run inside compute_preview_range; we call it here to get the
        # post-filter column count for honest k-range validation. Cheap
        # (pure NumPy, sub-millisecond on typical data).
        matrix, _participants, _statements = build_sort_matrix(dump)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    n_valid_participants = matrix.shape[1]
    max_k = min(8, max(n_valid_participants - 1, 1))
    bad = [k for k in body.n_factors_range if k < 2 or k > max_k]
    if bad:
        raise HTTPException(
            status_code=400,
            detail=(
                f"n_factors values {bad} out of range. Allowed: "
                f"[2, {max_k}] given {n_valid_participants} valid participants."
            ),
        )

    try:
        rows = await asyncio.to_thread(
            lambda: compute_preview_range(
                dump=dump,
                n_factors_range=sorted(body.n_factors_range),
                extraction=body.extraction,
                rotation=body.rotation,
                flagging=body.flagging,
            )
        )
    except (np.linalg.LinAlgError, ValueError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Preview range computation failed: {e}",
        )

    return PreviewRangeResponse(rows=[PreviewRangeRow(**r) for r in rows])


# ---- AnalysisRun history endpoints (audit trail) ----


async def _load_run(db: AsyncSession, study_id: int, run_id: int) -> AnalysisRun:
    """Load a run scoped to the study, with `ran_by` user joined for email."""
    stmt = (
        select(AnalysisRun)
        .options(selectinload(AnalysisRun.ran_by))
        .where(AnalysisRun.id == run_id, AnalysisRun.study_id == study_id)
    )
    result = await db.execute(stmt)
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis run not found",
        )
    return run


def _to_summary(run: AnalysisRun) -> AnalysisRunSummary:
    # Pydantic constructs ManualRotation rows from the persisted JSON dicts
    # when the field is typed list[ManualRotation]; mypy can't see this.
    return AnalysisRunSummary(
        id=run.id,
        ran_at=run.ran_at,
        ran_by_user_id=run.ran_by_user_id,
        ran_by_email=run.ran_by.email if run.ran_by else None,
        extraction_method=run.extraction_method,
        n_factors=run.n_factors,
        rotation_method=run.rotation_method,
        flagging_mode=run.flagging_mode,
        notes=run.notes,
        factor_notes=run.factor_notes or {},
        manual_rotations=run.manual_rotations or [],  # type: ignore[arg-type]
        bootstrap_iterations=run.bootstrap_iterations,
    )


@router.get("/{slug}/analysis/runs")
async def list_analysis_runs(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> list[AnalysisRunSummary]:
    """List all persisted analysis runs for this study, newest first."""
    stmt = (
        select(AnalysisRun)
        .options(selectinload(AnalysisRun.ran_by))
        .where(AnalysisRun.study_id == study.id)
        .order_by(desc(AnalysisRun.ran_at))
    )
    result = await db.execute(stmt)
    runs = result.scalars().all()
    return [_to_summary(r) for r in runs]


@router.get("/{slug}/analysis/runs/{run_id}")
async def get_analysis_run(
    run_id: int,
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> AnalysisRunRead:
    """Retrieve a single persisted run including its full result payload."""
    run = await _load_run(db, study.id, run_id)
    return AnalysisRunRead(
        id=run.id,
        ran_at=run.ran_at,
        ran_by_user_id=run.ran_by_user_id,
        ran_by_email=run.ran_by.email if run.ran_by else None,
        extraction_method=run.extraction_method,
        n_factors=run.n_factors,
        rotation_method=run.rotation_method,
        flagging_mode=run.flagging_mode,
        notes=run.notes,
        factor_notes=run.factor_notes or {},
        manual_rotations=run.manual_rotations or [],  # type: ignore[arg-type]
        bootstrap_iterations=run.bootstrap_iterations,
        result=run.result,
    )


@router.patch("/{slug}/analysis/runs/{run_id}")
async def update_analysis_run(
    run_id: int,
    body: AnalysisRunPatch,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> AnalysisRunSummary:
    """Update the researcher annotations on a persisted run.

    `notes` (run-level) and `factor_notes` (per-factor) are mutable;
    analytical choices and the result payload are immutable for audit-trail
    integrity. `factor_notes` keys must correspond to actual factors of the
    run (1 ≤ int(k) ≤ run.n_factors); the schema validates format and per-
    value length, and the route validates the upper bound against the run.
    """
    run = await _load_run(db, study.id, run_id)
    if body.notes is not None:
        run.notes = body.notes
    if body.factor_notes is not None:
        for key in body.factor_notes:
            k_int = int(key)
            if k_int > run.n_factors:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"factor_notes key {k_int} exceeds run n_factors "
                        f"({run.n_factors})"
                    ),
                )
        # Merge semantics (PATCH): keys present in the patch overwrite their
        # current value; an empty/whitespace-only value clears the entry;
        # keys absent from the patch are left unchanged. This means the
        # frontend can update one factor's narrative without worrying about
        # wiping the others.
        merged = dict(run.factor_notes or {})
        for key, value in body.factor_notes.items():
            if value.strip():
                merged[key] = value
            else:
                merged.pop(key, None)
        run.factor_notes = merged
    await db.commit()
    await db.refresh(run)
    return _to_summary(run)


@router.delete("/{slug}/analysis/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis_run(
    run_id: int,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a persisted run.

    Use sparingly: deleting a run removes evidence of an analytical choice
    from the audit trail. Researchers should normally annotate (via PATCH)
    rather than delete.
    """
    run = await _load_run(db, study.id, run_id)
    await db.delete(run)
    await db.commit()
    logger.info(
        "AnalysisRun deleted: study=%s run_id=%s",
        study.slug,
        run_id,
    )


# ---- Audio recordings linked to factor membership ----


@router.get("/{slug}/analysis/audios")
async def list_audios_for_participants(
    participant_ids: str,
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> list[ParticipantAudioRecording]:
    """Fetch audio recordings (with presigned URLs) for a set of participants.

    Used by the analysis UI to show post-sort audio responses linked to
    factor membership: the frontend looks up which participants are
    flagged on a factor (from the analysis result), then calls this
    endpoint with their participant_db_ids to render a "voices on this
    factor" panel. This supports the critical Q-methodology practice of
    grounding factor interpretation in the words of the people who
    define each factor (Sneegas 2020; Robbins & Krueger 2000).

    Always returns the *current* state of audio recordings (not a
    snapshot). If the user reloads a historical analysis run, the
    audios shown are still the up-to-date ones — researchers see the
    voices, not a frozen view.

    Query params:
        participant_ids: comma-separated participant database ids
            (e.g., "12,17,22"). Empty string returns []. Up to 200 ids
            accepted (a single factor rarely flags more than ~20).
    """
    # Parse the comma-separated id list defensively.
    if not participant_ids.strip():
        return []
    try:
        ids = [int(x) for x in participant_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="participant_ids must be comma-separated integers",
        )
    if len(ids) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At most 200 participant ids per request",
        )
    if not ids:
        return []

    # Scope: only participants belonging to THIS study, regardless of what
    # the caller passed in. This prevents id-stuffing attacks across studies.
    stmt = (
        select(AudioRecording, Participant.id.label("participant_db_id"))
        .join(Participant, AudioRecording.participant_id == Participant.id)
        .where(
            Participant.study_id == study.id,
            Participant.id.in_(ids),
        )
        .order_by(AudioRecording.participant_id, AudioRecording.created_at)
    )
    result = await db.execute(stmt)

    out: list[ParticipantAudioRecording] = []
    expires_at = datetime.now(UTC) + timedelta(hours=1)
    for recording, participant_db_id in result.all():
        try:
            url = storage_service.generate_presigned_url(
                recording.s3_key, expiration=3600
            )
        except Exception as exc:
            logger.warning(
                "Failed to generate presigned URL for recording %s: %s",
                recording.id,
                exc,
            )
            url = None
        out.append(
            ParticipantAudioRecording(
                id=recording.id,
                participant_db_id=participant_db_id,
                question_key=recording.question_key,
                mime_type=recording.mime_type,
                file_size_bytes=recording.file_size_bytes,
                duration_seconds=recording.duration_seconds,
                s3_key=recording.s3_key,
                created_at=recording.created_at,
                presigned_url=url,
                url_expires_at=expires_at if url else None,
            )
        )
    return out


# ---- Card comments linked to factor membership ----


def _pick_statement_text(stmt: Statement, lang: str) -> str:
    """Return the statement text in the preferred language, with sensible fallbacks."""
    for tr in stmt.translations:
        if tr.language_code == lang:
            return tr.text
    if stmt.translations:
        return stmt.translations[0].text
    return stmt.code


@router.get("/{slug}/analysis/comments")
async def list_comments_for_participants(
    participant_ids: str,
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> list[ParticipantCardComment]:
    """Fetch non-empty `card_comment` entries for a set of participants.

    Used by the analysis UI to show post-sort textual rationales linked to
    factor membership: the frontend looks up which participants are flagged
    on a factor (from the analysis result), then calls this endpoint with
    their participant_db_ids to render the written rationales beside the
    audio recordings already returned by `/analysis/audios`. Together the two
    endpoints support the critical Q-methodology practice of grounding factor
    interpretation in the words of the people who define each factor
    (Sneegas 2020; Robbins & Krueger 2000).

    Comments are returned ordered per participant by descending |grid_score|
    (extreme placements first) — typically the most interpretable rationales
    when reading a factor.

    Query params:
        participant_ids: comma-separated participant database ids
            (e.g., "12,17,22"). Empty string returns []. Up to 200 ids
            accepted (a single factor rarely flags more than ~20).
    """
    if not participant_ids.strip():
        return []
    try:
        ids = [int(x) for x in participant_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="participant_ids must be comma-separated integers",
        )
    if len(ids) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At most 200 participant ids per request",
        )
    if not ids:
        return []

    study_lang = study.default_language or "en"

    stmt = (
        select(QSortEntry, Participant.id.label("participant_db_id"))
        .join(Participant, QSortEntry.participant_id == Participant.id)
        .where(
            Participant.study_id == study.id,
            Participant.id.in_(ids),
            QSortEntry.card_comment.is_not(None),
            func.length(func.trim(QSortEntry.card_comment)) > 0,
        )
        .order_by(
            QSortEntry.participant_id,
            func.abs(QSortEntry.grid_score).desc(),
            QSortEntry.statement_id,
        )
    )
    result = await db.execute(stmt)

    out: list[ParticipantCardComment] = []
    for entry, participant_db_id in result.all():
        statement = entry.statement
        comment = entry.card_comment or ""
        if not comment.strip():
            # Defensive: SQL filter should already exclude these, but a NULL/empty
            # round-trip via JSON columns is theoretically possible.
            continue
        out.append(
            ParticipantCardComment(
                participant_db_id=participant_db_id,
                statement_id=statement.id,
                statement_code=statement.code,
                statement_text=_pick_statement_text(statement, study_lang),
                grid_score=entry.grid_score,
                comment=comment,
            )
        )
    return out
