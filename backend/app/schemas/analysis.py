"""Analysis schemas for Q-method factor analysis."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AnalysisRequest(BaseModel):
    """Schema for requesting a Q-method factor analysis."""

    extraction: str = Field(
        "pca", description="Factor extraction method: 'pca' or 'centroid'"
    )
    n_factors: int = Field(3, ge=1, le=20, description="Number of factors to extract")
    rotation: str = Field("varimax", description="Rotation method: 'varimax' or 'none'")
    flagging: str = Field("auto", description="Flagging method: 'auto' or 'manual'")
    manual_flags: dict[int, int] | None = Field(
        None,
        description="Manual participant-to-factor assignments (participant_db_id → factor_number, 1-indexed)",
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
        if v not in ("varimax", "none"):
            raise ValueError("rotation must be 'varimax' or 'none'")
        return v

    @field_validator("flagging")
    @classmethod
    def validate_flagging(cls, v: str) -> str:
        if v not in ("auto", "manual"):
            raise ValueError("flagging must be 'auto' or 'manual'")
        return v


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


class EigenvalueResult(BaseModel):
    """Eigenvalues for scree plot (pre-analysis)."""

    eigenvalues: list[float]
    suggested_n_factors: int = Field(
        description="Suggested number of factors (Kaiser criterion: eigenvalue > 1)"
    )


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
