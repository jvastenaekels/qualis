"""Pydantic schemas for data validation and serialization."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import ParticipantStatus, StudyRole, StudyState

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


class UserRead(UserBase):
    """Schema for reading user details."""

    id: int
    is_active: bool
    is_superuser: bool
    model_config = ConfigDict(from_attributes=True)


# Translation Schemas


class StudyTranslationBase(BaseModel):
    """Base schema for study translations."""

    language_code: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    title: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    instructions: str = ""
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


# Collaborator Schemas


class StudyCollaboratorRead(BaseModel):
    """Schema for reading study collaborator details."""

    user_id: int
    user_email: str | None = None
    role: StudyRole
    added_at: Any

    model_config = ConfigDict(from_attributes=True)


class StudyCollaboratorAdd(BaseModel):
    """Schema for adding/updating a collaborator."""

    email: str
    role: StudyRole


# Study Schemas


class StudyBase(BaseModel):
    """Base schema for studies."""

    slug: str = Field(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=100)
    state: StudyState = StudyState.draft
    grid_config: list[GridColumn]
    presort_config: dict[str, Any]
    postsort_config: dict[str, Any]
    default_language: str | None = Field(None, max_length=5)
    show_statement_codes: bool = False


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
    default_language: str | None = Field(None, max_length=5)
    show_statement_codes: bool | None = None
    translations: list[StudyTranslationCreate] | None = None
    statements: list[StatementUpdate] | None = None


class StudyRead(StudyBase):
    """Schema for reading a study."""

    id: int
    owner_id: int
    created_at: datetime
    collaborators: list[StudyCollaboratorRead] = []
    translations: list[StudyTranslationRead] = []
    statements: list[StatementRead] = []
    model_config = ConfigDict(from_attributes=True)


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
    presort_answers: dict[str, Any] = {}
    qsort: list[QSortEntryInput]
    postsort_answers: dict[str, Any] = {}

    @field_validator("qsort")
    @classmethod
    def validate_qsort_structure(
        _cls, v: list[QSortEntryInput]
    ) -> list[QSortEntryInput]:
        """Validate that the Q-sort contains unique statements."""
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
    def validate_answers_dict(_cls, v: dict[str, Any]) -> dict[str, Any]:
        """Validate that the answers dictionary is not too large."""
        # Prevent massive JSON blobs
        import json

        try:
            dumped = json.dumps(v)
            if len(dumped) > 100_000:  # 100KB limit
                raise ValueError("Answers dictionary too large")
        except (TypeError, ValueError):
            raise ValueError("Invalid answers dictionary")
        return v
