"""Participant, submission, and draft schemas.

Naming convention: participant-facing schemas use the ``*Input`` suffix
(e.g. ``ConsentInput``, ``SubmissionInput``) to distinguish them from
admin CRUD schemas which follow the ``*Create`` / ``*Update`` / ``*Read``
pattern. ``*Input`` schemas represent data submitted by anonymous study
participants, while ``*Create`` / ``*Update`` schemas represent admin
operations on owned resources.
"""

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ParticipantStatus

from .audio import AudioRecordingRead
from .common import validate_non_empty_string


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

    @field_validator("qsort")
    @classmethod
    def validate_qsort_structure(
        _cls, v: list[QSortEntryInput] | None
    ) -> list[QSortEntryInput]:
        """Validate that the Q-sort contains unique statements."""
        if v is None:
            raise ValueError("Q-sort data cannot be None")

        if not v:
            pass

        statement_ids = [entry.statement_id for entry in v]
        if len(statement_ids) != len(set(statement_ids)):
            raise ValueError("Duplicate statement_id found in Q-Sort submission")
        return v

    @field_validator("session_token")
    @classmethod
    def validate_token(_cls, v: UUID) -> UUID:
        """Validate the session token UUID."""
        return v

    @field_validator("presort_answers", "postsort_answers")
    @classmethod
    def validate_answers_dict(_cls, v: dict[str, Any] | None) -> dict[str, Any]:
        """Validate that the answers dictionary is not too large."""
        if v is None:
            return {}

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


# Read Schemas


class ParticipantRead(BaseModel):
    """Schema for reading a participant.

    Security: the raw ``session_token`` is the participant's bearer credential
    and is deliberately NOT exposed here — this schema is reachable by the
    lowest (viewer) role via the study participant list. Only the truncated,
    non-reversible ``code`` (session_token[:8]) is surfaced for display.
    ``recruitment_token`` and ``user_agent`` are research metadata, not
    credentials, and remain available.
    """

    id: int
    study_id: int
    code: str
    language_used: str
    status: ParticipantStatus
    created_at: datetime
    submitted_at: datetime | None
    is_discarded: bool
    discard_reason: str | None
    user_agent: str | None

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
    audio_recordings: list[AudioRecordingRead] = []
    model_config = ConfigDict(from_attributes=True)


class ParticipantDiscardUpdate(BaseModel):
    """Schema for discarding/flagging a participant."""

    is_discarded: bool
    discard_reason: str | None = Field(None, max_length=500)

    @field_validator("discard_reason")
    @classmethod
    def validate_reason(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


# Draft / Resume Schemas


_DRAFT_ALLOWED_KEYS = {"presort", "rough", "qsort", "postsort"}


class DraftSaveInput(BaseModel):
    """Schema for saving participant draft responses."""

    session_token: UUID
    draft_responses: dict[str, Any] = Field(
        ..., description="Full response store state snapshot"
    )

    @field_validator("draft_responses")
    @classmethod
    def validate_draft(cls, v: dict[str, Any]) -> dict[str, Any]:
        if not v:
            raise ValueError("Draft cannot be empty")

        extra = set(v.keys()) - _DRAFT_ALLOWED_KEYS
        if extra:
            raise ValueError(f"Unexpected keys in draft: {extra}")

        try:
            serialized = json.dumps(v)
        except (RecursionError, TypeError, ValueError) as exc:
            raise ValueError(f"Draft contains invalid data: {exc}")
        if len(serialized) > 200_000:
            raise ValueError("Draft too large")
        return v


class ResumeResponse(BaseModel):
    """Schema for returning participant resume data."""

    session_token: str
    language: str
    last_step_reached: int
    draft_responses: dict[str, Any]
    resume_code: str


class ConsentResponse(BaseModel):
    """Schema for the consent endpoint response."""

    status: str
    resume_code: str
