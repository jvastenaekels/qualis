# Libre-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""SQLAlchemy database models."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .database import Base


# Enums
class StudyState(str, Enum):
    """Enum for study lifecycle states."""

    draft = "draft"
    active = "active"
    paused = "paused"
    closed = "closed"
    archived = "archived"


class ParticipantStatus(str, Enum):
    """Enum for participant progress status."""

    started = "started"
    completed = "completed"


class WorkspaceRole(str, Enum):
    """Enum for workspace roles."""

    owner = "owner"  # Renamed from 'admin' for consistency with StudyRole
    researcher = "researcher"
    viewer = "viewer"


class StudyRole(str, Enum):
    """Enum for study-specific roles."""

    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class RecruitmentLinkType(str, Enum):
    """Enum for types of recruitment links."""

    public = "public"
    individual = "individual"
    limited = "limited"


# Workspace Models
class Workspace(Base):
    """SQLAlchemy model for workspaces."""

    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    # Relationships
    studies: Mapped[list["Study"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", lazy="raise"
    )
    members: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", lazy="raise"
    )


class WorkspaceMember(Base):
    """Association model for workspace members with roles."""

    __tablename__ = "workspace_members"

    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        SAEnum(WorkspaceRole), default=WorkspaceRole.viewer
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    workspace: Mapped["Workspace"] = relationship(
        back_populates="members", lazy="raise"
    )
    user: Mapped["User"] = relationship(back_populates="memberships", lazy="raise")


# StudyCollaborator model removed (RBAC Refactor)


# User Model
class User(Base):
    """SQLAlchemy model for users."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)

    # 2FA / TOTP
    totp_secret: Mapped[str | None] = mapped_column(String, nullable=True)
    is_totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    memberships: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="raise",
    )


# Study Models
class Study(Base):
    """SQLAlchemy model for studies."""

    __tablename__ = "studies"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    state: Mapped[StudyState] = mapped_column(
        SAEnum(StudyState), default=StudyState.draft
    )
    default_language: Mapped[str | None] = mapped_column(
        String(5), nullable=True
    )  # e.g. "en"
    show_statement_codes: Mapped[bool] = mapped_column(Boolean, default=False)
    randomize_statement_order: Mapped[bool] = mapped_column(
        Boolean, default=False
    )  # Randomize statement order per participant (Q methodology best practice)
    symmetry_lock: Mapped[bool] = mapped_column(
        Boolean, default=True
    )  # Enforce grid symmetry in designer
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # JSON Configs
    grid_config: Mapped[Any] = mapped_column(
        JSON
    )  # e.g. [{"score": -4, "capacity": 2}, ...]
    presort_config: Mapped[dict[str, Any]] = mapped_column(
        JSON
    )  # e.g. Schema for usage fields
    postsort_config: Mapped[dict[str, Any]] = mapped_column(
        JSON
    )  # e.g. Logic for follow-up
    branding: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )  # e.g. {"logo_url": "...", "accent_color": "..."}
    access_password: Mapped[str | None] = mapped_column(String, nullable=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        back_populates="studies", lazy="selectin"
    )
    translations: Mapped[list["StudyTranslation"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    statements: Mapped[list["Statement"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    recruitment_links: Mapped[list["RecruitmentLink"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def requires_password(self) -> bool:
        return bool(self.access_password)

    @property
    def participant_count(self) -> int:
        return len(
            [
                p
                for p in self.participants
                if not p.is_test_run
                and not p.is_discarded
                and p.status == ParticipantStatus.completed
            ]
        )


class StudyTranslation(Base):
    """SQLAlchemy model for study translations."""

    __tablename__ = "study_translations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    language_code: Mapped[str] = mapped_column(String(5))  # e.g. "en", "fr-FR"

    title: Mapped[str] = mapped_column(String)
    subtitle: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(String)
    objective: Mapped[str | None] = mapped_column(String, nullable=True)
    condition_of_instruction: Mapped[str | None] = mapped_column(String, nullable=True)
    pre_instruction: Mapped[str | None] = mapped_column(String, nullable=True)

    instructions: Mapped[str | None] = mapped_column(String, nullable=True)  # HTML/MD
    ui_labels: Mapped[dict[str, str]] = mapped_column(
        JSON, default=dict
    )  # Button adjustments
    consent_title: Mapped[str | None] = mapped_column(String, nullable=True)
    consent_description: Mapped[str | None] = mapped_column(String, nullable=True)
    process_steps: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    methodology_tips: Mapped[list[str]] = mapped_column(JSON, default=list)
    step_help: Mapped[dict] = mapped_column(JSON, default=dict)

    study: Mapped["Study"] = relationship(back_populates="translations", lazy="raise")

    __table_args__ = (
        UniqueConstraint("study_id", "language_code", name="uq_study_lang"),
    )


# Statement Models
class Statement(Base):
    """SQLAlchemy model for statements."""

    __tablename__ = "statements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String)  # "S1", "S2"...
    display_order: Mapped[int] = mapped_column(default=0)

    study: Mapped["Study"] = relationship(back_populates="statements", lazy="raise")
    translations: Mapped[list["StatementTranslation"]] = relationship(
        back_populates="statement", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (UniqueConstraint("study_id", "code", name="uq_statement_code"),)


class StatementTranslation(Base):
    """SQLAlchemy model for statement translations."""

    __tablename__ = "statement_translations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    statement_id: Mapped[int] = mapped_column(
        ForeignKey("statements.id", ondelete="CASCADE"), index=True
    )
    language_code: Mapped[str] = mapped_column(String(5))
    text: Mapped[str] = mapped_column(String)

    statement: Mapped["Statement"] = relationship(
        back_populates="translations", lazy="raise"
    )

    __table_args__ = (
        UniqueConstraint("statement_id", "language_code", name="uq_statement_lang"),
    )


# Participant & QSort
class Participant(Base):
    """SQLAlchemy model for study participants."""

    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    session_token: Mapped[UUID] = mapped_column(unique=True, index=True, default=uuid4)
    language_used: Mapped[str] = mapped_column(String(5))
    random_seed: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )  # Seed for reproducible statement randomization
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[ParticipantStatus] = mapped_column(
        SAEnum(ParticipantStatus), default=ParticipantStatus.started
    )

    # Metadata
    confirmation_code: Mapped[str | None] = mapped_column(
        String(8), unique=True, index=True, nullable=True
    )
    is_discarded: Mapped[bool] = mapped_column(Boolean, default=False)
    is_test_run: Mapped[bool] = mapped_column(Boolean, default=False)
    discard_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    consented_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    consent_hash: Mapped[str | None] = mapped_column(String, nullable=True)

    # Step progress tracking (1=consent, 2=presort, 3=rough sort, 4=fine sort, 5=post-sort)
    last_step_reached: Mapped[int | None] = mapped_column(
        SmallInteger, nullable=True, default=1
    )
    last_step_reached_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Answers
    presort_answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    postsort_answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    study: Mapped["Study"] = relationship(back_populates="participants", lazy="raise")
    qsort_entries: Mapped[list["QSortEntry"]] = relationship(
        back_populates="participant", cascade="all, delete-orphan", lazy="raise"
    )
    audio_recordings: Mapped[list["AudioRecording"]] = relationship(
        back_populates="participant", cascade="all, delete-orphan", lazy="raise"
    )

    @property
    def recruitment_token(self) -> str | None:
        """Extract recruitment token from presort answers if present."""
        if self.presort_answers and isinstance(self.presort_answers, dict):
            return self.presort_answers.get("_recruitment_token")
        return None


class QSortEntry(Base):
    """SQLAlchemy model for individual Q-sort card placements."""

    __tablename__ = "qsort_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), index=True
    )
    statement_id: Mapped[int] = mapped_column(
        ForeignKey("statements.id", ondelete="CASCADE"), index=True
    )

    grid_score: Mapped[int] = mapped_column(Integer)  # -4, 0, 4
    card_comment: Mapped[str | None] = mapped_column(String, nullable=True)

    participant: Mapped["Participant"] = relationship(
        back_populates="qsort_entries", lazy="raise"
    )
    statement: Mapped["Statement"] = relationship(lazy="selectin")

    __table_args__ = (
        UniqueConstraint(
            "participant_id", "statement_id", name="uq_participant_statement"
        ),
        CheckConstraint(
            "grid_score >= -10 AND grid_score <= 10", name="chk_grid_score_range"
        ),
    )

    @property
    def statement_code(self) -> str:
        return self.statement.code if self.statement else ""


class AudioRecording(Base):
    """SQLAlchemy model for audio recording metadata stored in S3."""

    __tablename__ = "audio_recordings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), index=True
    )
    question_key: Mapped[str] = mapped_column(
        String
    )  # e.g., "card_123", "missing_statement"

    # S3 Storage
    s3_bucket: Mapped[str] = mapped_column(String)
    s3_key: Mapped[str] = mapped_column(String, unique=True, index=True)

    # Metadata
    file_size_bytes: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    mime_type: Mapped[str] = mapped_column(String)  # "audio/webm" or "audio/mp4"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    participant: Mapped["Participant"] = relationship(
        back_populates="audio_recordings", lazy="raise"
    )

    __table_args__ = (
        # One audio per question per participant
        UniqueConstraint(
            "participant_id", "question_key", name="uq_participant_question_audio"
        ),
    )


class RecruitmentLink(Base):
    """SQLAlchemy model for recruitment links."""

    __tablename__ = "recruitment_links"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[RecruitmentLinkType] = mapped_column(
        SAEnum(RecruitmentLinkType), default=RecruitmentLinkType.public
    )
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(
        String, nullable=True
    )  # Name for this link/lot
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    start_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    study: Mapped["Study"] = relationship(
        back_populates="recruitment_links", lazy="raise"
    )


class Invitation(Base):
    """SQLAlchemy model for researcher/collaborator invitations."""

    __tablename__ = "invitations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, index=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    # study_id removed or made nullable if keeping for legacy ref?
    # Replacing study_id with workspace_id entirely for now.
    study_id: Mapped[int | None] = mapped_column(
        ForeignKey("studies.id", ondelete="SET NULL"), nullable=True
    )
    role: Mapped[WorkspaceRole] = mapped_column(
        SAEnum(WorkspaceRole), default=WorkspaceRole.viewer
    )
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship(lazy="raise")
