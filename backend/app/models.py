# Libre-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""SQLAlchemy database models."""

from datetime import datetime, timedelta, timezone
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
    select,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship, column_property
from sqlalchemy.sql import func

from .database import Base

# Sessions expire after this many days of inactivity (based on last_step_reached_at)
SESSION_TTL_DAYS: int = 60


# Enums
class StudyState(str, Enum):
    """Enum for study lifecycle states."""

    draft = "draft"
    active = "active"
    paused = "paused"
    closed = "closed"
    archived = "archived"


class ConcourseItemStatus(str, Enum):
    """Enum for concourse item curation status."""

    proposed = "proposed"
    accepted = "accepted"
    rejected = "rejected"


class ParticipantStatus(str, Enum):
    """Enum for participant progress status."""

    started = "started"
    completed = "completed"


class ProjectRole(str, Enum):
    """Enum for project roles."""

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


# Project Models
class Project(Base):
    """SQLAlchemy model for projects."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    # Relationships
    studies: Mapped[list["Study"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="raise"
    )
    members: Mapped[list["ProjectMember"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="raise"
    )
    concourses: Mapped[list["Concourse"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="raise"
    )
    concourse_tags: Mapped[list["ConcourseTag"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="raise"
    )


class ProjectMember(Base):
    """Association model for project members with roles."""

    __tablename__ = "project_members"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[ProjectRole] = mapped_column(
        SAEnum(ProjectRole), default=ProjectRole.viewer
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    project: Mapped["Project"] = relationship(back_populates="members", lazy="raise")
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
    memberships: Mapped[list["ProjectMember"]] = relationship(
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
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
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
    project: Mapped["Project"] = relationship(back_populates="studies", lazy="selectin")
    translations: Mapped[list["StudyTranslation"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    statements: Mapped[list["Statement"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="raise"
    )
    recruitment_links: Mapped[list["RecruitmentLink"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def requires_password(self) -> bool:
        return bool(self.access_password)

    # participant_count is defined as a column_property after Participant class


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
    step_help: Mapped[dict[str, dict[str, str]]] = mapped_column(JSON, default=dict)

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

    # Concourse traceability — nullable, set when imported from a concourse
    # Plain integer (no FK) to preserve traceability after concourse item deletion.
    # With a FK + ondelete="SET NULL", deletions would erase the link before
    # staleness checks could detect the deletion.
    source_concourse_item_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=None,
        index=True,
    )
    source_imported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    study: Mapped["Study"] = relationship(back_populates="statements", lazy="raise")
    translations: Mapped[list["StatementTranslation"]] = relationship(
        back_populates="statement", cascade="all, delete-orphan", lazy="selectin"
    )
    # No relationship — source_concourse_item_id is a plain integer for traceability

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
    resume_code: Mapped[str | None] = mapped_column(
        String(50), unique=True, nullable=True
    )
    is_discarded: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
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

    # GDPR Art. 17 — when set, this participant's PII has been anonymised
    # (ip_address, user_agent, confirmation_code, resume_code, consent_hash,
    # presort/postsort/draft answers cleared; audio recordings deleted; the
    # Q-sort entries themselves are preserved as anonymous research data).
    anonymised_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

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

    # Draft state for resume functionality
    draft_responses: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    study: Mapped["Study"] = relationship(back_populates="participants", lazy="raise")
    qsort_entries: Mapped[list["QSortEntry"]] = relationship(
        back_populates="participant", cascade="all, delete-orphan", lazy="raise"
    )
    audio_recordings: Mapped[list["AudioRecording"]] = relationship(
        back_populates="participant", cascade="all, delete-orphan", lazy="raise"
    )

    @property
    def is_expired(self) -> bool:
        """A session is expired when it has been inactive for more than SESSION_TTL_DAYS."""
        if self.status == ParticipantStatus.completed:
            return False
        reference = self.last_step_reached_at or self.consented_at or self.created_at
        if reference is None:
            return False
        cutoff = datetime.now(timezone.utc) - timedelta(days=SESSION_TTL_DAYS)
        # Handle naive datetimes from the DB
        if reference.tzinfo is None:
            return reference < cutoff.replace(tzinfo=None)
        return reference < cutoff

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
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    # study_id removed or made nullable if keeping for legacy ref?
    # Replacing study_id with project_id entirely for now.
    study_id: Mapped[int | None] = mapped_column(
        ForeignKey("studies.id", ondelete="SET NULL"), nullable=True
    )
    role: Mapped[ProjectRole] = mapped_column(
        SAEnum(ProjectRole), default=ProjectRole.viewer
    )
    token: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project: Mapped["Project"] = relationship(lazy="raise")


# Concourse Models


class Concourse(Base):
    """Project-level collection of candidate Q-methodology statements."""

    __tablename__ = "concourses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["Project"] = relationship(back_populates="concourses", lazy="raise")
    items: Mapped[list["ConcourseItem"]] = relationship(
        back_populates="concourse", cascade="all, delete-orphan", lazy="raise"
    )
    creator: Mapped["User | None"] = relationship(lazy="raise")


class ConcourseItem(Base):
    """Individual candidate statement within a concourse."""

    __tablename__ = "concourse_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    concourse_id: Mapped[int] = mapped_column(
        ForeignKey("concourses.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(50))
    status: Mapped[ConcourseItemStatus] = mapped_column(
        SAEnum(ConcourseItemStatus), default=ConcourseItemStatus.proposed
    )
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    concourse: Mapped["Concourse"] = relationship(back_populates="items", lazy="raise")
    translations: Mapped[list["ConcourseItemTranslation"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", lazy="selectin"
    )
    tags: Mapped[list["ConcourseTag"]] = relationship(
        secondary="concourse_item_tags", back_populates="items", lazy="selectin"
    )
    creator: Mapped["User | None"] = relationship(lazy="raise")

    versions: Mapped[list["ConcourseItemVersion"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", lazy="raise"
    )
    comments: Mapped[list["ConcourseItemComment"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", lazy="raise"
    )

    __table_args__ = (
        UniqueConstraint("concourse_id", "code", name="uq_concourse_item_code"),
    )


class ConcourseItemTranslation(Base):
    """Multilingual text for a concourse item."""

    __tablename__ = "concourse_item_translations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("concourse_items.id", ondelete="CASCADE"), index=True
    )
    language_code: Mapped[str] = mapped_column(String(5))
    text: Mapped[str] = mapped_column(String)

    item: Mapped["ConcourseItem"] = relationship(
        back_populates="translations", lazy="raise"
    )

    __table_args__ = (
        UniqueConstraint("item_id", "language_code", name="uq_concourse_item_lang"),
    )


class ConcourseTag(Base):
    """Project-scoped tag for categorizing concourse items."""

    __tablename__ = "concourse_tags"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)

    project: Mapped["Project"] = relationship(
        back_populates="concourse_tags", lazy="raise"
    )
    items: Mapped[list["ConcourseItem"]] = relationship(
        secondary="concourse_item_tags", back_populates="tags", lazy="raise"
    )

    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_project_tag_name"),
    )


class ConcourseItemTag(Base):
    """Many-to-many association between concourse items and tags."""

    __tablename__ = "concourse_item_tags"

    item_id: Mapped[int] = mapped_column(
        ForeignKey("concourse_items.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("concourse_tags.id", ondelete="CASCADE"), primary_key=True
    )


class ConcourseItemVersion(Base):
    """Snapshot of a concourse item state before each update."""

    __tablename__ = "concourse_item_versions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("concourse_items.id", ondelete="CASCADE"), index=True
    )
    version_number: Mapped[int] = mapped_column(Integer)
    code: Mapped[str] = mapped_column(String(50))
    status: Mapped[ConcourseItemStatus] = mapped_column(SAEnum(ConcourseItemStatus))
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    translations_snapshot: Mapped[list[dict[str, str]]] = mapped_column(
        JSON, default=list
    )
    tag_ids_snapshot: Mapped[list[int]] = mapped_column(JSON, default=list)
    change_comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    changed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    item: Mapped["ConcourseItem"] = relationship(
        back_populates="versions", lazy="raise"
    )
    user: Mapped["User | None"] = relationship(lazy="raise")

    __table_args__ = (
        UniqueConstraint("item_id", "version_number", name="uq_item_version"),
    )


class ConcourseItemComment(Base):
    """Discussion comment on a concourse item."""

    __tablename__ = "concourse_item_comments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("concourse_items.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    item: Mapped["ConcourseItem"] = relationship(
        back_populates="comments", lazy="raise"
    )
    user: Mapped["User | None"] = relationship(lazy="raise")


class AnalysisRun(Base):
    """Persisted record of a Q-method factor analysis execution.

    Captures both the analytical choices the researcher made (extraction,
    rotation, n_factors, flagging mode/threshold) and the full result, so
    that analytical decisions are auditable across sessions and visible to
    co-authors and reviewers. This supports the critical Q-methodology
    requirement that analytical choices be transparent (Stainton Rogers
    1997; Watts & Stenner 2012; Sneegas 2020).

    Every successful call to the analysis endpoint creates one row. The
    researcher can annotate runs with a `notes` field (e.g., "final
    analysis used in submission") and delete experimental runs they no
    longer need.
    """

    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    # Nullable so that deleting a user does not blow away the audit trail —
    # the analytical choices remain visible even if the researcher account
    # is removed.
    ran_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    ran_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Analytical choices — the audit trail
    extraction_method: Mapped[str] = mapped_column(String(20))  # "pca" | "centroid"
    n_factors: Mapped[int] = mapped_column(SmallInteger)
    rotation_method: Mapped[str] = mapped_column(String(20))  # "varimax" | "none"
    flagging_mode: Mapped[str] = mapped_column(String(20))  # "auto" | "manual"

    # Researcher annotation (free text, e.g. "submission v2", "exploratory")
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    # Full result payload (the AnalysisResult Pydantic model serialized).
    # JSON (not JSONB) to stay consistent with other persisted configs.
    result: Mapped[dict[str, Any]] = mapped_column(JSON)

    # Relationships
    study: Mapped["Study"] = relationship(lazy="raise")
    ran_by: Mapped["User | None"] = relationship(lazy="raise")


# Computed column properties (defined after all models to avoid circular references)
Study.participant_count = column_property(
    select(func.count(Participant.id))
    .where(
        Participant.study_id == Study.id,
        Participant.is_test_run.is_(False),
        Participant.is_discarded.is_(False),
        Participant.status == ParticipantStatus.completed,
    )
    .correlate(Study)
    .scalar_subquery()
)
