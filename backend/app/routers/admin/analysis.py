"""API router for Q-method factor analysis."""

import asyncio
import logging
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...dependencies import check_study_permission
from ...limiter import limiter
from ...models import Study, StudyRole
from ...schemas import (
    AnalysisRequest,
    AnalysisResult,
    EigenvalueResult,
    FactorCharacteristic,
    ParticipantLoading,
    StatementClassification,
    StatementScore,
)
from ...services.analysis_service import (
    apply_manual_flags,
    build_sort_matrix,
    compute_eigenvalues,
    correlation_matrix,
    run_analysis,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin Analysis"])


def _get_statement_text(stmt: dict, lang: str = "en") -> str:
    """Get statement text for the preferred language, fallback to first available."""
    for t in stmt.get("translations", []):
        if t["lang"] == lang:
            return t["text"]
    translations = stmt.get("translations", [])
    return translations[0]["text"] if translations else stmt.get("code", "")


def _build_z_scores_list(
    z_scores: np.ndarray, s_idx: int, n_factors: int
) -> list[float]:
    """Extract z-scores for a statement, replacing NaN with 0.0."""
    return [
        float(z_scores[s_idx, f]) if not np.isnan(z_scores[s_idx, f]) else 0.0
        for f in range(n_factors)
    ]


def _build_factor_arrays_list(
    factor_arrays: np.ndarray, s_idx: int, n_factors: int
) -> list[int]:
    """Extract factor array values for a statement."""
    return [int(factor_arrays[s_idx, f]) for f in range(n_factors)]


async def _get_analysis_dump(db: AsyncSession, study_id: int) -> dict[str, Any]:
    """Get a lightweight study dump for analysis (no audio/presigned URLs)."""
    from ...services.study_service import StudyService

    return await StudyService.get_study_sort_data(db, study_id)


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

    eigenvalues, suggested = await asyncio.to_thread(
        lambda: compute_eigenvalues(correlation_matrix(dataset))
    )

    return EigenvalueResult(eigenvalues=eigenvalues, suggested_n_factors=suggested)


@router.post("/{slug}/analysis/run")
@limiter.limit("10/minute")
async def run_factor_analysis(
    request: Request,
    body: AnalysisRequest,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> AnalysisResult:
    """Run a complete Q-method factor analysis."""
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

    # Build manual flags matrix if needed
    manual_flags_matrix = None
    if body.flagging == "manual" and body.manual_flags:
        participant_db_ids = [p["db_id"] for p in valid_participants]
        manual_flags_matrix = apply_manual_flags(
            n_participants, body.n_factors, body.manual_flags, participant_db_ids
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
        )
    except ValueError as e:
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

    return AnalysisResult(
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
    )
