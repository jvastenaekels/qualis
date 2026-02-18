"""Pydantic schemas for data validation and serialization."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import (
    ParticipantStatus,
    RecruitmentLinkType,
    StudyState,
    WorkspaceRole,
)

# Auth Schemas


# Helper Validator
def validate_non_empty_string(v: str | None) -> str | None:
    """Validator to ensure string is not empty or whitespace-only."""
    if v is None:
        return None
    if not v.strip():
        raise ValueError("String cannot be empty or whitespace only")
    return v.strip()


class Token(BaseModel):
    """Schema for returning an access token or 2FA requirement."""

    access_token: str | None = None
    token_type: str | None = None
    requires_2fa: bool = False
    temp_token: str | None = None


class TokenData(BaseModel):
    """Schema for data stored in JWT."""

    email: str | None = None


# User Schemas


class UserBase(BaseModel):
    """Base schema for users."""

    email: str
    full_name: str | None = Field(None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class UserCreate(UserBase):
    """Schema for creating a new user."""

    password: str = Field(..., min_length=8)
    is_active: bool = True
    is_superuser: bool = False
    invitation_token: str | None = None


class UserRead(UserBase):
    """Schema for reading user details."""

    id: int
    is_active: bool
    is_superuser: bool
    is_totp_enabled: bool
    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """Schema for updating user profile."""

    email: str | None = None
    full_name: str | None = Field(None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class PasswordChange(BaseModel):
    """Schema for changing password."""

    current_password: str
    new_password: str = Field(..., min_length=8)


# Workspace Schemas


class WorkspaceMemberRead(BaseModel):
    """Schema for reading workspace member details."""

    user_id: int
    user: UserRead
    role: WorkspaceRole
    joined_at: datetime
    model_config = ConfigDict(from_attributes=True)


class WorkspaceBrief(BaseModel):
    """Lightweight workspace schema (no members) for nested use in StudyRead."""

    id: int
    title: str
    slug: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class WorkspaceRead(WorkspaceBrief):
    """Schema for reading a workspace with members."""

    members: list[WorkspaceMemberRead] = []


class WorkspaceWithRole(WorkspaceRead):
    """Schema for reading a workspace with the current user's role."""

    user_role: WorkspaceRole


class WorkspaceCreate(BaseModel):
    """Schema for creating a workspace."""

    title: str = Field(..., max_length=100)
    slug: str = Field(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=50)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        # We can't return None here because the field is required (str)
        # validate_non_empty_string returns str | None
        # We know v is str per type hint
        res = validate_non_empty_string(v)
        if res is None:
            raise ValueError("String cannot be empty")
        return res


class WorkspaceUpdate(BaseModel):
    """Schema for updating a workspace."""

    title: str | None = Field(None, max_length=100)
    slug: str | None = Field(None, pattern="^[a-z0-9-]+$", min_length=3, max_length=50)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class WorkspaceMemberUpdate(BaseModel):
    """Schema for updating a workspace member."""

    role: WorkspaceRole


class WorkspaceInvitationCreate(BaseModel):
    """Schema for creating a workspace invitation."""

    email: str
    role: WorkspaceRole = WorkspaceRole.researcher


# Translation Schemas


class PartnerLogo(BaseModel):
    """Schema for a partner institution logo."""

    id: str
    name: str
    logo_url: str
    url: str | None = None


class ProcessStep(BaseModel):
    """Schema for a dynamic study process step."""

    id: str = Field(..., description="Unique ID for DND and tracking")
    title: str = Field(..., max_length=100)
    description: str = Field(..., max_length=500)
    icon: str = Field(..., description="Lucide icon name")
    color: str | None = Field(None, description="Hex color code or CSS variable")

    @field_validator("title", "description", "icon")
    @classmethod
    def validate_strings(cls, v: str) -> str:
        # Relaxed for drafts. Activation validation handles empty strings.
        return v


class StudyTranslationBase(BaseModel):
    """Base schema for study translations."""

    language_code: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    title: str = Field(..., max_length=200)
    description: str = Field("", max_length=5000)
    instructions: str | None = Field(None, max_length=5000)
    subtitle: str | None = Field(None, max_length=200)
    objective: str | None = Field(None, max_length=5000)
    condition_of_instruction: str | None = Field(None, max_length=1000)
    pre_instruction: str | None = Field(None, max_length=1000)

    consent_title: str | None = Field(None, max_length=200)
    consent_description: str | None = Field(None, max_length=5000)
    ui_labels: dict[str, Any] = {}
    process_steps: list[ProcessStep] = []
    methodology_tips: list[str] = []
    step_help: dict[str, dict[str, str]] = {}

    @field_validator(
        "title",
        "instructions",
        "subtitle",
        "objective",
        "condition_of_instruction",
        "pre_instruction",
        "consent_title",
        "consent_description",
    )
    @classmethod
    def validate_trans_strings(cls, v: str | None) -> str | None:
        """Relax validation for drafts - allow empty strings."""
        return v


class StudyTranslationCreate(StudyTranslationBase):
    """Schema for creating a study translation."""

    pass


class StudyTranslationRead(StudyTranslationBase):
    """Schema for reading a study translation."""

    id: int
    study_id: int
    model_config = ConfigDict(from_attributes=True)


class StatementTranslationBase(BaseModel):
    """Base schema for statement translations."""

    language_code: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    text: str = Field(..., max_length=1000)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        # Relaxed for drafts. Activation validation handles empty strings.
        return v


class StatementTranslationCreate(StatementTranslationBase):
    """Schema for creating a statement translation."""

    pass


class StatementTranslationRead(StatementTranslationBase):
    """Schema for reading a statement translation."""

    id: int
    statement_id: int
    model_config = ConfigDict(from_attributes=True)


# Statement Schemas


class StatementBase(BaseModel):
    """Base schema for statements."""

    code: str = Field(..., max_length=50)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        # Relaxed for drafts.
        return v


class StatementCreate(StatementBase):
    """Schema for creating a statement."""

    translations: list[StatementTranslationCreate]


class StatementRead(StatementBase):
    """Schema for reading a statement."""

    id: int
    display_order: int = 0
    translations: list[StatementTranslationRead] = []
    model_config = ConfigDict(from_attributes=True)


class StatementUpdate(BaseModel):
    """Schema for updating a statement text (by code)."""

    code: str = Field(..., max_length=50)
    translations: list[StatementTranslationCreate]

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        # Relaxed for drafts.
        return v


class GridColumn(BaseModel):
    """Schema defining a column in the sorting grid."""

    score: int
    capacity: int


class BrandingBase(BaseModel):
    """Schema for study branding."""

    logo_url: str | None = Field(None, max_length=500)
    accent_color: str | None = Field(None, max_length=50)
    primary_color: str | None = Field(None, max_length=50)
    partners: list[PartnerLogo] = []


# Study Schemas


class StudyBase(BaseModel):
    """Base schema for studies."""

    slug: str = Field(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=100)
    state: StudyState = StudyState.draft
    grid_config: list[GridColumn]
    presort_config: dict[str, Any]
    postsort_config: dict[str, Any]
    branding: BrandingBase | None = None
    default_language: str | None = Field(None, max_length=5)
    show_statement_codes: bool = False
    randomize_statement_order: bool = False
    symmetry_lock: bool = True
    start_date: datetime | None = None
    end_date: datetime | None = None


class StudyCreate(StudyBase):
    """Schema for creating a study."""

    translations: list[StudyTranslationCreate]
    statements: list[StatementCreate] = []


class StudyUpdate(BaseModel):
    """Schema for updating a study."""

    slug: str | None = Field(None, pattern="^[a-z0-9-]+$", min_length=3, max_length=100)
    state: StudyState | None = None
    grid_config: list[GridColumn] | None = None
    presort_config: dict[str, Any] | None = None
    postsort_config: dict[str, Any] | None = None
    branding: BrandingBase | None = None
    default_language: str | None = Field(None, max_length=5)
    show_statement_codes: bool | None = None
    randomize_statement_order: bool | None = None
    symmetry_lock: bool | None = None
    translations: list[StudyTranslationCreate] | None = None
    statements: list[StatementUpdate] | None = None
    access_password: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    last_updated_at: datetime | None = None

    # Note: Symmetry validation is skipped for drafts/updates to allow partial saves.
    # It is enforced only when transitioning state to 'active' in the service layer.


class StudyRead(StudyBase):
    """Schema for reading a study."""

    id: int
    workspace_id: int
    workspace: WorkspaceBrief | None = None
    created_at: datetime
    updated_at: datetime
    start_date: datetime | None = None
    end_date: datetime | None = None
    translations: list[StudyTranslationRead] = []
    statements: list[StatementRead] = []
    recruitment_links: list["RecruitmentLinkRead"] = []
    requires_password: bool = False
    participant_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class StudyStatsRead(BaseModel):
    """Schema for study statistics."""

    started_count: int
    completed_count: int
    completion_rate: float
    median_duration_seconds: float | None
    device_breakdown: dict[str, int]  # e.g. {"mobile": 10, "desktop": 20}


# Submission Schemas


class QSortEntryInput(BaseModel):
    """Schema for individual statement placement during submission."""

    statement_id: int
    grid_score: int = Field(..., ge=-10, le=10)
    card_comment: str | None = Field(None, max_length=2000)

    @field_validator("card_comment")
    @classmethod
    def validate_comment(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class ConsentInput(BaseModel):
    """Schema for recording participant consent."""

    study_slug: str
    session_token: UUID
    consent_hash: str | None = None
    language_code: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    is_test_run: bool = False


class ProgressUpdate(BaseModel):
    """Schema for recording participant step progress."""

    session_token: UUID
    step: int = Field(..., ge=1, le=5)


class SubmissionInput(BaseModel):
    """Schema for the full study submission/completion."""

    study_slug: str
    session_token: UUID
    language_used: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    status: ParticipantStatus | None = (
        ParticipantStatus.completed
    )  # Default to completed
    presort_answers: dict[str, Any] | None = {}
    qsort: list[QSortEntryInput]
    postsort_answers: dict[str, Any] | None = {}
    link_token: str | None = None
    is_test_run: bool = False

    @field_validator("qsort")
    @classmethod
    def validate_qsort_structure(
        _cls, v: list[QSortEntryInput] | None
    ) -> list[QSortEntryInput]:
        """Validate that the Q-sort contains unique statements."""
        # Edge case: Handle None qsort
        if v is None:
            raise ValueError("Q-sort data cannot be None")

        # Basic validation: check for duplicates
        if not v:
            # It is possible to have empty qsort if just starting or rough sorting?
            # But this is submission logic usually for final save.
            # Let's allow empty but maybe warn.
            pass

        statement_ids = [entry.statement_id for entry in v]
        if len(statement_ids) != len(set(statement_ids)):
            raise ValueError("Duplicate statement_id found in Q-Sort submission")
        return v

    @field_validator("session_token")
    @classmethod
    def validate_token(_cls, v: UUID) -> UUID:
        """Validate the session token UUID."""
        # Check if UUID is version 4? Usually automatic.
        return v

    @field_validator("presort_answers", "postsort_answers")
    @classmethod
    def validate_answers_dict(_cls, v: dict[str, Any] | None) -> dict[str, Any]:
        """Validate that the answers dictionary is not too large."""
        # Edge case: Convert None to empty dict
        if v is None:
            return {}

        # Prevent massive JSON blobs
        import json

        try:
            dumped = json.dumps(v)
            if len(dumped) > 100_000:  # 100KB limit
                raise ValueError("Answers dictionary too large (max 100KB)")
        except TypeError as e:
            raise ValueError(
                f"Invalid answers dictionary: contains non-serializable data - {str(e)}"
            )
        except ValueError as e:
            raise ValueError(f"Invalid answers dictionary: {str(e)}")
        return v


class ParticipantRead(BaseModel):
    """Schema for reading a participant."""

    id: int
    study_id: int
    session_token: UUID
    language_used: str
    status: ParticipantStatus
    created_at: datetime
    submitted_at: datetime | None
    is_discarded: bool
    is_test_run: bool
    discard_reason: str | None
    user_agent: str | None
    # We don't expose IP address directly to researchers usually, maybe masked or hash
    # For now, let's keep it private or added if requested.

    # Step progress tracking
    last_step_reached: int | None = None
    last_step_reached_at: datetime | None = None

    # Computed fields
    recruitment_token: str | None = None

    model_config = ConfigDict(from_attributes=True)


class QSortEntryRead(BaseModel):
    """Schema for reading individual statement placement."""

    statement_id: int
    grid_score: int
    card_comment: str | None = None
    statement_code: str
    model_config = ConfigDict(from_attributes=True)


class ParticipantDetailRead(ParticipantRead):
    """Schema for detailed participant view including responses."""

    presort_answers: dict[str, Any]
    postsort_answers: dict[str, Any]
    qsort_entries: list[QSortEntryRead]
    audio_recordings: list["AudioRecordingRead"] = []
    model_config = ConfigDict(from_attributes=True)


class ParticipantDiscardUpdate(BaseModel):
    """Schema for discarding/flagging a participant."""

    is_discarded: bool
    discard_reason: str | None = Field(None, max_length=500)

    @field_validator("discard_reason")
    @classmethod
    def validate_reason(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


# Audio Recording Schemas


class AudioRecordingBase(BaseModel):
    """Base schema for audio recordings."""

    question_key: str
    mime_type: str
    file_size_bytes: int
    duration_seconds: float | None = None


class AudioRecordingRead(AudioRecordingBase):
    """Schema for reading audio recording metadata."""

    id: int
    s3_key: str
    created_at: datetime
    presigned_url: str | None = None
    url_expires_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AudioUploadResponse(BaseModel):
    """Schema for audio upload response."""

    recording_id: int
    s3_key: str
    file_size_bytes: int
    presigned_url: str
    message: str = "Audio uploaded successfully"


# Collaboration & Invitation Schemas


class InvitationCreate(BaseModel):
    """Schema for creating a study/workspace invitation."""

    email: str
    role: WorkspaceRole = WorkspaceRole.researcher


class InvitationLink(BaseModel):
    """Schema for returning a generated invitation link."""

    invite_url: str
    token: str


# Recruitment Link Schemas


class RecruitmentLinkBase(BaseModel):
    """Base schema for recruitment links."""

    name: str | None = Field(None, max_length=100)
    type: RecruitmentLinkType = RecruitmentLinkType.public
    capacity: int | None = Field(None, gt=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class RecruitmentLinkCreate(RecruitmentLinkBase):
    """Schema for creating a recruitment link."""

    pass


class RecruitmentLinkRead(RecruitmentLinkBase):
    """Schema for reading a recruitment link."""

    id: int
    study_id: int
    token: str
    usage_count: int
    start_count: int
    expires_at: datetime | None = None
    is_active: bool = True
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# TOTP Schemas


class TOTPSetup(BaseModel):
    """Schema for TOTP setup response."""

    secret: str
    qr_code_uri: str


class TOTPVerify(BaseModel):
    """Schema for TOTP verification."""

    token: str


# Analysis Schemas


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
