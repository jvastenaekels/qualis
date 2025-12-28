# Open-Q - Open-source platform for conducting Q-methodology research
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
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
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
    closed = "closed"
    archived = "archived"


class ParticipantStatus(str, Enum):
    """Enum for participant progress status."""

    started = "started"
    completed = "completed"


class StudyRole(str, Enum):
    """Enum for collaborator roles."""

    owner = "owner"
    editor = "editor"
    viewer = "viewer"


# User Model
class User(Base):
    """SQLAlchemy model for users."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    collaborations: Mapped[list["StudyCollaborator"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="StudyCollaborator.user_id",
    )


# Study Models
class Study(Base):
    """SQLAlchemy model for studies."""

    __tablename__ = "studies"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # Original creator
    state: Mapped[StudyState] = mapped_column(
        SAEnum(StudyState), default=StudyState.draft
    )
    default_language: Mapped[str | None] = mapped_column(
        String(5), nullable=True
    )  # e.g. "en"
    show_statement_codes: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # JSON Configs
    grid_config: Mapped[dict[str, Any]] = mapped_column(JSON)  # e.g. {"-4": 2, ...}
    presort_config: Mapped[dict[str, Any]] = mapped_column(
        JSON
    )  # e.g. Schema for usage fields
    postsort_config: Mapped[dict[str, Any]] = mapped_column(
        JSON
    )  # e.g. Logic for follow-up

    # Relationships
    translations: Mapped[list["StudyTranslation"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    statements: Mapped[list["Statement"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    participants: Mapped[list["Participant"]] = relationship(
        back_populates="study", cascade="all, delete-orphan"
    )
    collaborators: Mapped[list["StudyCollaborator"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )


class StudyCollaborator(Base):
    """Association model for study collaborators with roles."""

    __tablename__ = "study_collaborators"

    study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[StudyRole] = mapped_column(SAEnum(StudyRole), default=StudyRole.viewer)

    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    added_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    study: Mapped["Study"] = relationship(back_populates="collaborators")
    user: Mapped["User"] = relationship(
        back_populates="collaborations", foreign_keys=[user_id]
    )
    added_by: Mapped["User"] = relationship(foreign_keys=[added_by_id])


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
    instructions: Mapped[str] = mapped_column(String)  # HTML/MD
    ui_labels: Mapped[dict[str, str]] = mapped_column(
        JSON, default=dict
    )  # Button adjustments
    consent_title: Mapped[str | None] = mapped_column(String, nullable=True)
    consent_description: Mapped[str | None] = mapped_column(String, nullable=True)
    consent_accept: Mapped[str | None] = mapped_column(String, nullable=True)
    consent_decline: Mapped[str | None] = mapped_column(String, nullable=True)

    study: Mapped["Study"] = relationship(back_populates="translations")

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

    study: Mapped["Study"] = relationship(back_populates="statements")
    translations: Mapped[list["StatementTranslation"]] = relationship(
        back_populates="statement", cascade="all, delete-orphan", lazy="selectin"
    )


class StatementTranslation(Base):
    """SQLAlchemy model for statement translations."""

    __tablename__ = "statement_translations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    statement_id: Mapped[int] = mapped_column(
        ForeignKey("statements.id", ondelete="CASCADE"), index=True
    )
    language_code: Mapped[str] = mapped_column(String(5))
    text: Mapped[str] = mapped_column(String)

    statement: Mapped["Statement"] = relationship(back_populates="translations")

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
    status: Mapped[ParticipantStatus] = mapped_column(
        SAEnum(ParticipantStatus), default=ParticipantStatus.started
    )

    # Metadata
    confirmation_code: Mapped[str | None] = mapped_column(
        String(8), unique=True, index=True, nullable=True
    )
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Answers
    presort_answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    postsort_answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    study: Mapped["Study"] = relationship(back_populates="participants")
    qsort_entries: Mapped[list["QSortEntry"]] = relationship(
        back_populates="participant", cascade="all, delete-orphan"
    )


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

    participant: Mapped["Participant"] = relationship(back_populates="qsort_entries")
    statement: Mapped["Statement"] = relationship()

    __table_args__ = (
        UniqueConstraint(
            "participant_id", "statement_id", name="uq_participant_statement"
        ),
    )
