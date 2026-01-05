"""Pydantic schemas for data validation and serialization."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import ParticipantStatus, StudyRole, StudyState, WorkspaceRole

# Auth Schemas


class Token(BaseModel):
    """Schema for returning an access token."""

    access_token: str
    token_type: str


class TokenData(BaseModel):
    """Schema for data stored in JWT."""

    email: str | None = None


# User Schemas


class UserBase(BaseModel):
    """Base schema for users."""

    email: str


class UserCreate(UserBase):
    """Schema for creating a new user."""

    password: str
    is_active: bool = True
    is_superuser: bool = False
    invitation_token: str | None = None


class UserRead(UserBase):
    """Schema for reading user details."""

    id: int
    is_active: bool
    is_superuser: bool
    model_config = ConfigDict(from_attributes=True)


# Workspace Schemas


class WorkspaceMemberRead(BaseModel):
    """Schema for reading workspace member details."""

    user_id: int
    user_email: str | None = None
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


class WorkspaceCreate(BaseModel):
    """Schema for creating a workspace."""

    title: str
    slug: str = Field(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=50)


# Translation Schemas


class StudyTranslationBase(BaseModel):
    """Base schema for study translations."""

    language_code: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    instructions: str | None = None
    subtitle: str | None = None
    objective: str | None = None
    consent_title: str | None = None
    consent_description: str | None = None
    consent_accept: str | None = None
    consent_decline: str | None = None
    ui_labels: dict[str, Any] = {}


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
    text: str = Field(..., min_length=1)


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

    code: str


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

    code: str
    translations: list[StatementTranslationCreate]


class GridColumn(BaseModel):
    """Schema defining a column in the sorting grid."""

    score: int
    capacity: int


class BrandingBase(BaseModel):
    """Schema for study branding."""

    logo_url: str | None = None
    accent_color: str | None = None


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
    translations: list[StudyTranslationCreate] | None = None
    statements: list[StatementUpdate] | None = None

    @model_validator(mode="after")
    def check_grid_symmetry(self) -> "StudyUpdate":
        """Validate symmetry if both grid_config and statements are being updated, or if only one is updated against the other."""
        # Note: In a partial update, we might not have both.
        # Full validation happens in the service layer if necessary,
        # but we catch obvious mismatches here if both are provided.
        if self.grid_config is not None and self.statements is not None:
            total_capacity = sum(col.capacity for col in self.grid_config)
            if len(self.statements) != total_capacity:
                raise ValueError(
                    f"Grid capacity ({total_capacity}) does not match statement count ({len(self.statements)})"
                )
        return self


class StudyRead(StudyBase):
    """Schema for reading a study."""

    id: int
    workspace_id: int
    created_at: datetime
    translations: list[StudyTranslationRead] = []
    statements: list[StatementRead] = []
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
    card_comment: str | None = None


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
    discard_reason: str | None = None


# Collaboration & Invitation Schemas


class InvitationCreate(BaseModel):
    """Schema for creating a study invitation."""

    email: str
    role: StudyRole = StudyRole.editor


class InvitationLink(BaseModel):
    """Schema for returning a generated invitation link."""

    invite_url: str
    token: str
