# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Pydantic schemas for API and database models."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import ParticipantStatus, StudyRole, StudyState


# Auth Schemas
class Token(BaseModel):
    """Schema for JWT access token."""

    access_token: str
    token_type: str


class TokenData(BaseModel):
    """Schema for token payload data."""

    email: str | None = None


# Translation Schemas
class StudyTranslationBase(BaseModel):
    """Base schema for study translations."""

    language_code: str = Field(..., max_length=5)
    title: str
    description: str
    instructions: str
    ui_labels: dict[str, str] = {}


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

    language_code: str = Field(..., max_length=5)
    text: str


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
    study_id: int
    translations: list[StatementTranslationRead] = []
    model_config = ConfigDict(from_attributes=True)


class GridColumn(BaseModel):
    """Schema defining a column in the sorting grid."""

    score: int
    capacity: int


# Collaborator Schemas
class StudyCollaboratorRead(BaseModel):
    """Schema for reading study collaborator details."""

    user_id: int
    role: StudyRole
    added_at: Any

    model_config = ConfigDict(from_attributes=True)


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

    owner_id: int  # Explicitly passed for now or inferred
    translations: list[StudyTranslationCreate]
    statements: list[StatementCreate] = []


class StudyRead(StudyBase):
    """Schema for reading a study."""

    id: int
    owner_id: int
    subtitle: str | None = None
    objective: str | None = None
    created_at: Any
    translations: list[StudyTranslationRead] = []
    statements: list[StatementRead] = []
    collaborators: list[StudyCollaboratorRead] = []

    # This field could be populated dynamically if needed,
    # but for now we expose the full translations list.
    model_config = ConfigDict(from_attributes=True)


# Q-Sort Submission Schemas
class QSortEntryInput(BaseModel):
    """Schema for a single Q-sort entry."""

    statement_id: int
    grid_score: int
    card_comment: str | None = None


class SubmissionInput(BaseModel):
    """Schema for a full participant submission."""

    session_token: UUID
    study_slug: str = Field(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=100)
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
        cls, v: list[QSortEntryInput]
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
    def validate_token(cls, v: UUID) -> UUID:
        """Validate the session token UUID."""
        # Check if UUID is version 4? Usually automatic.
        return v

    @field_validator("presort_answers", "postsort_answers")
    @classmethod
    def validate_answers_dict(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Validate that the answers dictionary is not too large."""
        # Prevent massive JSON blobs
        import json

        try:
            text = json.dumps(v)
            if len(text) > 100000:  # 100KB limit
                raise ValueError("Data too large")
        except (ValueError, TypeError):
            raise ValueError("Invalid JSON data")
        return v
