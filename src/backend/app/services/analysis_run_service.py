# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Orchestrate one factor analysis: load, validate, run, map, persist.

``analysis_service`` is the numeric library — pure functions over NumPy
arrays, no ORM, no Pydantic. This module is the layer above it: it turns a
study and an ``AnalysisRequest`` into an ``AnalysisResult`` and an
``AnalysisRun`` row. It used to be the body of the ``run_factor_analysis``
route handler (277 lines, cyclomatic complexity 37), which made none of it
callable or testable without an HTTP request.

Errors a caller can act on are raised as ``AnalysisInputError``; the
router answers 400 with the message, unchanged from before the extraction.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TypedDict

import numpy as np
from numpy.typing import NDArray
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AnalysisRun, Study
from app.schemas import (
    AnalysisRequest,
    AnalysisResult,
    BootstrapResult,
    BootstrapStatementStability,
    FactorCharacteristic,
    ParticipantLoading,
    StatementClassification,
    StatementScore,
)
from app.services.analysis_service import (
    AnalysisRunResult,
    SortParticipantRecord,
    StatementDumpRecord,
    apply_manual_flags,
    build_sort_matrix,
    compute_bootstrap_stability,
    run_analysis,
)
from app.services.study_data_service import StudyDataService
from app.types.wire import SortDataDump

logger = logging.getLogger(__name__)


class AnalysisInputError(ValueError):
    """A request the analysis cannot honour (bad n_factors, unusable data…)."""


class Dataset(TypedDict):
    """What ``build_sort_matrix`` yields for a study, plus the dump it came from."""

    dump: SortDataDump
    matrix: NDArray[np.float64]
    participants: list[SortParticipantRecord]
    statements: list[StatementDumpRecord]


class StatementPayload(TypedDict):
    """The fields StatementScore and StatementClassification share."""

    statement_id: int
    code: str
    text: str
    z_scores: list[float | None]
    factor_arrays: list[int]


async def load_dataset(db: AsyncSession, study_id: int) -> Dataset:
    """Lightweight sort dump (no audio, no presigned URLs) as a matrix."""
    dump = await StudyDataService.get_study_sort_data(db, study_id)
    try:
        matrix, participants, statements = build_sort_matrix(dump)
    except ValueError as exc:
        raise AnalysisInputError(str(exc)) from exc
    return {
        "dump": dump,
        "matrix": matrix,
        "participants": participants,
        "statements": statements,
    }


def validate_request(
    body: AnalysisRequest, *, n_statements: int, n_participants: int
) -> None:
    if body.n_factors > n_participants:
        raise AnalysisInputError(
            f"n_factors ({body.n_factors}) cannot exceed the number of valid "
            f"participants ({n_participants})"
        )
    if body.n_factors > n_statements:
        raise AnalysisInputError(
            f"n_factors ({body.n_factors}) cannot exceed the number of statements "
            f"({n_statements})"
        )
    if body.flagging == "manual" and not body.manual_flags:
        raise AnalysisInputError("manual_flags is required when flagging='manual'")


def build_manual_flags(
    body: AnalysisRequest, *, n_participants: int, participant_db_ids: list[int]
) -> NDArray[np.bool_] | None:
    if body.flagging != "manual" or not body.manual_flags:
        return None
    try:
        return apply_manual_flags(
            n_participants, body.n_factors, body.manual_flags, participant_db_ids
        )
    except ValueError as exc:
        raise AnalysisInputError(str(exc)) from exc


def statement_text(stmt: StatementDumpRecord, lang: str) -> str:
    """Text in the study language, else the first translation, else the code."""
    for t in stmt["translations"]:
        if t["lang"] == lang:
            return t["text"]
    translations = stmt["translations"]
    return translations[0]["text"] if translations else stmt["code"]


def statement_payload(
    stmt: StatementDumpRecord,
    s_idx: int,
    z_scores: NDArray[np.float64],
    factor_arrays: NDArray[np.int64],
    n_factors: int,
    lang: str,
) -> StatementPayload:
    """One statement's identity, scores and array values — the part that
    statement_scores, distinguishing and consensus entries have in common."""
    return {
        "statement_id": stmt["id"],
        "code": stmt["code"],
        "text": statement_text(stmt, lang),
        "z_scores": [
            float(z_scores[s_idx, f]) if not np.isnan(z_scores[s_idx, f]) else None
            for f in range(n_factors)
        ],
        "factor_arrays": [int(factor_arrays[s_idx, f]) for f in range(n_factors)],
    }


def _manual_rotations_payload(body: AnalysisRequest) -> list[dict[str, object]] | None:
    # Plain dicts: the numeric service stays decoupled from Pydantic. The
    # schema-level cross-field validator (rotation='judgmental' ⇒ non-empty
    # manual_rotations) has already run.
    if not body.manual_rotations:
        return None
    return [r.model_dump() for r in body.manual_rotations]


async def _run_bootstrap(
    body: AnalysisRequest,
    data: Dataset,
    result: AnalysisRunResult,
    manual_rotations: list[dict[str, object]] | None,
    study_slug: str,
) -> BootstrapResult | None:
    """Zabala & Pascual (2016) stability, after the main run so its failure
    never masks a fast-feedback failure of the pipeline. Purely additive: on
    failure the regular result is kept and the attempt is recorded in the
    persisted warnings (audit G3), so a failed bootstrap stays
    distinguishable from one never requested."""
    if body.bootstrap_iterations is None:
        return None
    study = data["dump"].get("study", {})
    try:
        raw = await asyncio.to_thread(
            compute_bootstrap_stability,
            data["matrix"],
            body.bootstrap_iterations,
            n_factors=body.n_factors,
            extraction=body.extraction,
            rotation=body.rotation,
            manual_rotations=manual_rotations,
            grid_config=study.get("grid_config"),
            distribution_mode=study.get("distribution_mode", "forced"),
        )
    except (ValueError, np.linalg.LinAlgError) as exc:
        logger.warning(
            "Bootstrap failed for study=%s: %s — returning result without bootstrap.",
            study_slug,
            exc,
        )
        result["warnings"].append(
            f"Bootstrap stability ({body.bootstrap_iterations} iterations) "
            f"could not be computed and was skipped: {exc}"
        )
        return None

    statements = data["statements"]
    stability = [
        BootstrapStatementStability(
            statement_id=statements[entry["statement_idx"]]["id"],
            factor=entry["factor"],
            z_mean=entry["z_mean"],
            z_se=entry["z_se"],
            ci_lower=entry["ci_lower"],
            ci_upper=entry["ci_upper"],
        )
        for entry in raw["statements"]
        if 0 <= entry["statement_idx"] < len(statements)
    ]
    return BootstrapResult(
        n_iterations=raw["n_iterations"],
        n_converged=raw["n_converged"],
        statements=stability,
        factor_mean_se=raw["factor_mean_se"],
    )


def build_result(
    body: AnalysisRequest,
    data: Dataset,
    result: AnalysisRunResult,
    bootstrap: BootstrapResult | None,
    lang: str,
) -> AnalysisResult:
    n_factors = body.n_factors
    z_scores = result["z_scores"]
    factor_arrays = result["factor_arrays"]
    statements = data["statements"]

    def payload(s_idx: int) -> StatementPayload:
        return statement_payload(
            statements[s_idx], s_idx, z_scores, factor_arrays, n_factors, lang
        )

    participants = [
        ParticipantLoading(
            db_id=p["db_id"],
            label=p["id"],
            loadings=[float(v) for v in result["rotated_loadings"][i]],
            flagged_factors=[f + 1 for f in range(n_factors) if result["flags"][i][f]],
        )
        for i, p in enumerate(data["participants"])
    ]
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
        participants=participants,
        statement_scores=[StatementScore(**payload(i)) for i in range(len(statements))],
        distinguishing=[
            StatementClassification(
                **payload(d["statement_idx"]), significance=d["significance"]
            )
            for d in result["distinguishing"]
        ],
        consensus=[
            StatementClassification(
                **payload(c["statement_idx"]), significance=c["significance"]
            )
            for c in result["consensus"]
        ],
        factor_characteristics=[
            FactorCharacteristic(**c) for c in result["factor_characteristics"]
        ],
        correlation_matrix=[
            [float(v) for v in row] for row in result["factor_correlation"]
        ],
        manual_rotations=list(body.manual_rotations) if body.manual_rotations else [],
        bootstrap=bootstrap,
        warnings=result["warnings"],
    )


async def run_and_persist(
    db: AsyncSession, study: Study, body: AnalysisRequest, *, ran_by_user_id: int
) -> AnalysisResult:
    """Run the analysis and record it as an AnalysisRun (audit trail).

    Persists on the success path only: a failed analysis creates no run —
    the caller saw the error and can retry with other parameters.
    """
    data = await load_dataset(db, study.id)
    n_statements, n_participants = data["matrix"].shape
    validate_request(body, n_statements=n_statements, n_participants=n_participants)

    manual_flags = build_manual_flags(
        body,
        n_participants=n_participants,
        participant_db_ids=[p["db_id"] for p in data["participants"]],
    )
    manual_rotations = _manual_rotations_payload(body)
    study_dump = data["dump"].get("study", {})

    try:
        result = await asyncio.to_thread(
            run_analysis,
            dataset=data["matrix"],
            n_factors=body.n_factors,
            extraction=body.extraction,
            rotation=body.rotation,
            flagging=body.flagging,
            manual_flags_matrix=manual_flags,
            manual_rotations=manual_rotations,
            grid_config=study_dump.get("grid_config"),
            distribution_mode=study_dump.get("distribution_mode", "forced"),
        )
    except (ValueError, np.linalg.LinAlgError) as exc:
        raise AnalysisInputError(str(exc)) from exc

    bootstrap = await _run_bootstrap(body, data, result, manual_rotations, study.slug)
    analysis_result = build_result(
        body, data, result, bootstrap, study.default_language or "en"
    )

    run = AnalysisRun(
        study_id=study.id,
        ran_by_user_id=ran_by_user_id,
        extraction_method=body.extraction,
        n_factors=body.n_factors,
        rotation_method=body.rotation,
        flagging_mode=body.flagging,
        notes=None,
        factor_notes={},
        manual_rotations=manual_rotations,
        # The REQUESTED count is kept unconditionally so an attempted-but-
        # failed bootstrap (count set, result null) differs from one never
        # requested (both null) — audit G3.
        bootstrap_iterations=body.bootstrap_iterations,
        bootstrap_result=bootstrap.model_dump(mode="json") if bootstrap else None,
        result=analysis_result.model_dump(mode="json"),
    )
    db.add(run)
    await db.commit()
    logger.info(
        "AnalysisRun persisted: study=%s run_id=%s by user_id=%s "
        "(extraction=%s, rotation=%s, n_factors=%d, flagging=%s)",
        study.slug,
        run.id,
        ran_by_user_id,
        body.extraction,
        body.rotation,
        body.n_factors,
        body.flagging,
    )
    return analysis_result
