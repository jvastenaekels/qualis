"""Analysis schemas for Q-method factor analysis."""

from datetime import datetime
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationInfo,
    field_validator,
    model_validator,
)


class ManualRotation(BaseModel):
    """A single judgmental rotation step.

    Each step is a 2-D Givens rotation on the (factor_a, factor_b) column
    pair of the loadings matrix by `angle_deg` degrees. Used by the
    'judgmental' rotation method to align factors with substantively
    meaningful positions (Brown 1980; Watts & Stenner 2012).
    """

    factor_a: int = Field(
        ...,
        ge=1,
        description="1-indexed factor number to rotate.",
    )
    factor_b: int = Field(
        ...,
        ge=1,
        description="1-indexed factor number to rotate around. Must differ from factor_a.",
    )
    angle_deg: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Rotation angle in degrees, in [-180, 180].",
    )

    @field_validator("factor_b")
    @classmethod
    def validate_distinct(cls, v: int, info: ValidationInfo) -> int:
        if "factor_a" in info.data and v == info.data["factor_a"]:
            raise ValueError("factor_a and factor_b must be distinct")
        return v


class AnalysisRequest(BaseModel):
    """Schema for requesting a Q-method factor analysis."""

    extraction: str = Field(
        "pca", description="Factor extraction method: 'pca' or 'centroid'"
    )
    n_factors: int = Field(3, ge=1, le=20, description="Number of factors to extract")
    rotation: str = Field(
        "varimax",
        description="Rotation method: 'varimax', 'none', or 'judgmental'",
    )
    flagging: str = Field("auto", description="Flagging method: 'auto' or 'manual'")
    manual_flags: dict[int, int] | None = Field(
        None,
        description="Manual participant-to-factor assignments (participant_db_id → factor_number, 1-indexed)",
    )
    manual_rotations: list[ManualRotation] | None = Field(
        None,
        description="Sequence of judgmental rotations to apply (only used when "
        "rotation='judgmental'). Each entry rotates the (factor_a, factor_b) "
        "pair by angle_deg degrees; rotations are applied in list order.",
    )
    bootstrap_iterations: int | None = Field(
        None,
        ge=100,
        le=5000,
        description="Optional: run a non-parametric bootstrap with B iterations "
        "to estimate SEs on z-scores (Zabala & Pascual 2016). None = skip.",
    )

    @field_validator("extraction")
    @classmethod
    def validate_extraction(cls, v: str) -> str:
        if v not in ("pca", "centroid"):
            raise ValueError("extraction must be 'pca' or 'centroid'")
        return v

    @field_validator("rotation")
    @classmethod
    def validate_rotation(cls, v: str) -> str:
        if v not in ("varimax", "none", "judgmental"):
            raise ValueError("rotation must be 'varimax', 'none', or 'judgmental'")
        return v

    @field_validator("flagging")
    @classmethod
    def validate_flagging(cls, v: str) -> str:
        if v not in ("auto", "manual"):
            raise ValueError("flagging must be 'auto' or 'manual'")
        return v

    @model_validator(mode="after")
    def validate_manual_rotations_consistency(self) -> "AnalysisRequest":
        """Cross-field validation for judgmental rotation.

        - rotation='judgmental' requires a non-empty manual_rotations list.
        - rotation != 'judgmental' must not carry manual_rotations data
          (reject mixed configs to avoid silent drops on the backend).
        - every factor index referenced in manual_rotations must be ≤ n_factors.
        """
        if self.rotation == "judgmental":
            if not self.manual_rotations:
                raise ValueError(
                    "rotation='judgmental' requires a non-empty manual_rotations list"
                )
            for i, mr in enumerate(self.manual_rotations):
                if mr.factor_a > self.n_factors or mr.factor_b > self.n_factors:
                    raise ValueError(
                        f"manual_rotations[{i}] references factor "
                        f"({mr.factor_a}, {mr.factor_b}) but n_factors={self.n_factors}"
                    )
        else:
            if self.manual_rotations:
                raise ValueError(
                    "manual_rotations is only valid when rotation='judgmental'"
                )
        return self


class ParticipantLoading(BaseModel):
    """Factor loading for a single participant."""

    db_id: int
    label: str
    loadings: list[float]
    flagged_factors: list[int] = Field(
        default_factory=list,
        description="1-indexed factors this participant is flagged to (may be multiple or empty)",
    )


class StatementScore(BaseModel):
    """Z-scores and factor array values for a single statement."""

    statement_id: int
    code: str
    text: str
    z_scores: list[float]
    factor_arrays: list[int]


class StatementClassification(BaseModel):
    """Classification of a statement as distinguishing or consensus."""

    statement_id: int
    code: str
    text: str
    z_scores: list[float]
    factor_arrays: list[int]
    significance: dict[str, str] = Field(
        default_factory=dict,
        description="Pairwise significance levels, e.g. {'1-2': 'p<0.05', '1-3': 'p<0.01'}",
    )


class FactorCharacteristic(BaseModel):
    """Statistical characteristics for a single factor."""

    factor: int = Field(description="1-indexed factor number")
    eigenvalue: float
    variance_explained: float
    cumulative_variance: float
    n_flagged: int
    avg_rel_coef: float = Field(description="Average reliability coefficient")
    composite_reliability: float
    se_factor_scores: float = Field(description="Standard error of factor scores")


class BootstrapStatementStability(BaseModel):
    """SE/CI for a single statement on a single factor.

    Output of a non-parametric bootstrap of Q-sorts (Zabala & Pascual 2016):
    the analysis is rerun B times on resampled Q-sort columns and the
    distribution of z-scores per (statement, factor) yields a mean, an SE,
    and a 95% empirical confidence interval.
    """

    statement_id: int
    factor: int = Field(description="1-indexed factor number")
    z_mean: float
    z_se: float
    ci_lower: float = Field(description="2.5th percentile of bootstrapped z-scores")
    ci_upper: float = Field(description="97.5th percentile of bootstrapped z-scores")


class BootstrapResult(BaseModel):
    """Bootstrap stability output (Zabala & Pascual 2016).

    Returned alongside the regular analysis result when the analyst opted in
    by setting ``bootstrap_iterations`` on the request.
    """

    n_iterations: int = Field(
        description="Number of bootstrap iterations B that were attempted."
    )
    n_converged: int = Field(
        description="Number of iterations that produced a usable factor solution. "
        "Pathological resamples (degenerate correlation matrix, etc.) are skipped."
    )
    statements: list[BootstrapStatementStability] = Field(
        description="One entry per (statement, factor) pair with non-empty samples."
    )
    factor_mean_se: list[float] = Field(
        description="Per-factor mean SE of z-scores, length = n_factors. "
        "Powers the 'Mean SE (z)' column in the factor characteristics table."
    )


class AnalysisResult(BaseModel):
    """Complete result of a Q-method factor analysis."""

    n_participants: int
    n_statements: int
    n_factors: int
    extraction: str
    rotation: str
    eigenvalues: list[float]
    total_variance_explained: float
    loadings: list[list[float]] = Field(
        description="Unrotated loadings: n_participants x n_factors"
    )
    rotated_loadings: list[list[float]] = Field(
        description="Rotated loadings: n_participants x n_factors"
    )
    flags: list[list[bool]] = Field(
        description="Flagging matrix: n_participants x n_factors"
    )
    participants: list[ParticipantLoading]
    statement_scores: list[StatementScore]
    distinguishing: list[StatementClassification]
    consensus: list[StatementClassification]
    factor_characteristics: list[FactorCharacteristic]
    correlation_matrix: list[list[float]] = Field(
        description="Between-factor correlation matrix: n_factors x n_factors"
    )
    manual_rotations: list[ManualRotation] = Field(
        default_factory=list,
        description="The judgmental rotations applied to produce this result, "
        "in list order. Empty for 'varimax' or 'none' rotation.",
    )
    bootstrap: BootstrapResult | None = Field(
        None,
        description="Bootstrap stability output (Zabala & Pascual 2016). Set "
        "only when the request opted in via `bootstrap_iterations`.",
    )


class EigenvalueResult(BaseModel):
    """Eigenvalues for the scree plot plus three retention indicators.

    All three indicators are advisory — Watts & Stenner (2012) emphasise
    that factor retention in Q-methodology also depends on interpretability
    and stability, not just statistical thresholds.
    """

    eigenvalues: list[float]
    kaiser_n: int = Field(description="Kaiser criterion: number of eigenvalues > 1.")
    parallel_analysis_n: int = Field(
        description="Horn (1965) parallel analysis: count of observed eigenvalues "
        "exceeding the 95th percentile of random-data eigenvalues.",
    )
    velicer_map_n: int = Field(
        description="Velicer (1976) Minimum Average Partial.",
    )
    suggested_n_factors: int = Field(
        description="Backward-compatible alias for kaiser_n. Frontends should "
        "prefer the three explicit fields."
    )


class PreviewRangeRequest(BaseModel):
    """Request body for POST /analysis/preview-range."""

    n_factors_range: list[int] = Field(
        min_length=1,
        max_length=8,
        description="Candidate k values, e.g. [2, 3, 4, 5, 6].",
    )
    extraction: Literal["pca", "centroid"] = Field(default="pca")
    rotation: Literal["varimax", "none", "judgmental"] = Field(default="varimax")
    flagging: Literal["auto", "manual"] = Field(default="auto")


class PreviewRangeRow(BaseModel):
    """One PreviewSummary row, mirrors the service TypedDict."""

    n_factors: int
    cumulative_variance: float
    pct_flagged: float
    n_distinguishing: int
    n_cross_loaders: int
    n_consensus: int
    min_defining_sorts: int
    has_empty_factor: bool


class PreviewRangeResponse(BaseModel):
    rows: list[PreviewRangeRow]


# ---- AnalysisRun (persisted analysis history) ----


class AnalysisRunSummary(BaseModel):
    """Lightweight summary of a persisted analysis run, used in list views."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    ran_at: datetime
    ran_by_user_id: int | None = None
    ran_by_email: str | None = Field(
        None,
        description="Email of the user who ran the analysis (joined from User; None if user deleted).",
    )
    extraction_method: str
    n_factors: int
    rotation_method: str
    flagging_mode: str
    notes: str | None = None
    factor_notes: dict[str, str] = Field(
        default_factory=dict,
        description="Per-factor interpretive narrative (Sneegas 2020). "
        "Keys are stringified 1-indexed factor numbers; values are free-text.",
    )
    manual_rotations: list[ManualRotation] = Field(
        default_factory=list,
        description="The judgmental rotations applied to this run, in list "
        "order. Empty for 'varimax' or 'none' rotation. Persisted on the run "
        "for audit-trail traceability of which rotations produced the result "
        "(Brown 1980; Watts & Stenner 2012).",
    )
    bootstrap_iterations: int | None = Field(
        None,
        description="Number of bootstrap iterations B used by this run "
        "(Zabala & Pascual 2016). None = bootstrap was not run.",
    )


class AnalysisRunRead(AnalysisRunSummary):
    """Full persisted run including the result payload."""

    result: dict[str, Any] = Field(
        description="Full AnalysisResult payload as it was returned at run time."
    )


class AnalysisRunPatch(BaseModel):
    """Partial update for a persisted run. Only `notes` and `factor_notes`
    are editable; analytical choices and the result payload are immutable
    for audit-trail integrity.
    """

    notes: str | None = Field(
        None,
        max_length=2000,
        description="Researcher annotation, e.g. 'final analysis used in submission'.",
    )
    factor_notes: dict[str, str] | None = Field(
        None,
        description="Per-factor narratives keyed by stringified 1-indexed "
        "factor number. The router validates that each key matches an "
        "actual factor of the run (1 ≤ int(k) ≤ run.n_factors); values "
        "are capped at 4000 chars per factor.",
    )

    @field_validator("factor_notes")
    @classmethod
    def validate_factor_notes(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        """Reject malformed keys and over-long values at the schema layer.

        Bound to the *run's* n_factors is enforced in the router (we don't
        have access to it here).
        """
        if v is None:
            return v
        for key, value in v.items():
            try:
                k_int = int(key)
            except (TypeError, ValueError):
                raise ValueError(
                    f"factor_notes keys must be integer strings, got: {key!r}"
                )
            if k_int < 1:
                raise ValueError(
                    f"factor_notes keys must be ≥ 1 (1-indexed), got: {k_int}"
                )
            if not isinstance(value, str):
                raise ValueError(f"factor_notes value for key {key!r} must be a string")
            if len(value) > 4000:
                raise ValueError(
                    f"factor_notes value for factor {key} exceeds 4000 chars"
                )
        return v


# ---- Per-statement card comments linked to factor membership ----


class ParticipantCardComment(BaseModel):
    """A single non-empty `card_comment` written by a participant during post-sort.

    Returned by the analysis comments endpoint to support critical
    Q-methodology interpretation: the analyst reads the textual rationales
    of participants flagged on a given factor, alongside the audio recordings
    already surfaced by `ParticipantAudioRecording` (Sneegas 2020;
    Robbins & Krueger 2000).
    """

    model_config = ConfigDict(from_attributes=True)

    participant_db_id: int
    statement_id: int
    statement_code: str
    statement_text: str = Field(
        description="Statement text in the study's default language, with fallback "
        "to the first available translation, then to the code.",
    )
    grid_score: int
    comment: str = Field(description="Non-empty textual rationale.")
