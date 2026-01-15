"""Pydantic schemas for data validation and serialization."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class WorkspaceRead(BaseModel):
    """Schema for reading a workspace."""

    id: int
    title: str
    slug: str
    created_at: datetime
    members: list[WorkspaceMemberRead] = []
    model_config = ConfigDict(from_attributes=True)


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
        res = validate_non_empty_string(v)
        if res is None:
            raise ValueError("Field cannot be empty or whitespace only")
        return res


class StudyTranslationBase(BaseModel):
    """Base schema for study translations."""

    language_code: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    title: str = Field(..., max_length=200)
    description: str = Field("", max_length=2000)
    instructions: str | None = Field(None, max_length=2000)
    subtitle: str | None = Field(None, max_length=200)
    objective: str | None = Field(None, max_length=1000)
    condition_of_instruction: str | None = Field(None, max_length=500)

    consent_title: str | None = Field(None, max_length=200)
    consent_description: str | None = Field(None, max_length=5000)
    consent_accept: str | None = Field("Accept", max_length=50)
    consent_decline: str | None = Field("Decline", max_length=50)
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
        "consent_title",
        "consent_description",
        "consent_accept",
        "consent_decline",
    )
    @classmethod
    def validate_trans_strings(cls, v: str | None) -> str | None:
        # Note: Description corresponds to "description" field which defaults to empty string
        # But here we type hint as str | None because default could be None for others?
        # Actually description is str = ""
        # Let's rely on validate_non_empty_string logic
        return validate_non_empty_string(v)


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
        res = validate_non_empty_string(v)
        if res is None:
            raise ValueError("Statement text cannot be empty")
        return res


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
        res = validate_non_empty_string(v)
        if res is None:
            raise ValueError("Statement code cannot be empty")
        return res


class StatementCreate(StatementBase):
    """Schema for creating a statement."""

    translations: list[StatementTranslationCreate]


class StatementRead(StatementBase):
    """Schema for reading a statement."""

    id: int
    translations: list[StatementTranslationRead] = []
    model_config = ConfigDict(from_attributes=True)


class StatementUpdate(BaseModel):
    """Schema for updating a statement text (by code)."""

    code: str = Field(..., max_length=50)
    translations: list[StatementTranslationCreate]

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        res = validate_non_empty_string(v)
        if res is None:
            raise ValueError("Statement code cannot be empty")
        return res


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
    randomize_statements: bool = False
    symmetry_lock: bool = True
    start_date: datetime | None = None
    end_date: datetime | None = None


class StudyCreate(StudyBase):
    """Schema for creating a study."""

    translations: list[StudyTranslationCreate]
    statements: list[StatementCreate] = []

    @model_validator(mode="after")
    def check_grid_symmetry(self) -> "StudyCreate":
        """Validate that total grid capacity matches the number of statements."""
        total_capacity = sum(col.capacity for col in self.grid_config)
        if len(self.statements) != total_capacity:
            raise ValueError(
                f"Grid capacity ({total_capacity}) does not match statement count ({len(self.statements)})"
            )
        return self


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
    randomize_statements: bool | None = None
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
    workspace: WorkspaceRead | None = None
    created_at: datetime
    updated_at: datetime
    start_date: datetime | None = None
    end_date: datetime | None = None
    translations: list[StudyTranslationRead] = []
    statements: list[StatementRead] = []
    recruitment_links: list["RecruitmentLinkRead"] = []
    requires_password: bool = False
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
    grid_score: int
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
    discard_reason: str | None
    user_agent: str | None
    # We don't expose IP address directly to researchers usually, maybe masked or hash
    # For now, let's keep it private or added if requested.

    # Computed fields
    recruitment_token: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ParticipantDetailRead(ParticipantRead):
    """Schema for detailed participant view including responses."""

    presort_answers: dict[str, Any]
    postsort_answers: dict[str, Any]
    qsort_entries: list[QSortEntryInput]
    model_config = ConfigDict(from_attributes=True)


class ParticipantDiscardUpdate(BaseModel):
    """Schema for discarding/flagging a participant."""

    is_discarded: bool
    discard_reason: str | None = Field(None, max_length=500)

    @field_validator("discard_reason")
    @classmethod
    def validate_reason(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


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
    capacity: int | None = None
    expires_at: datetime | None = None
    is_active: bool = True

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
