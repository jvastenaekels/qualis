# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

from datetime import datetime
from enum import Enum
from typing import List, Optional, Any
from uuid import UUID, uuid4

from sqlalchemy import String, Boolean, Integer, ForeignKey, DateTime, Enum as SAEnum, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .database import Base

# Enums
class StudyState(str, Enum):
    draft = "draft"
    active = "active"
    closed = "closed"
    archived = "archived"

class ParticipantStatus(str, Enum):
    started = "started"
    completed = "completed"

# User Model
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

# Study Models
class Study(Base):
    __tablename__ = "studies"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id")) # Assuming ownership for now
    state: Mapped[StudyState] = mapped_column(SAEnum(StudyState), default=StudyState.draft)
    default_language: Mapped[Optional[str]] = mapped_column(String(5), nullable=True) # e.g. "en"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # JSON Configs
    grid_config: Mapped[dict[str, Any]] = mapped_column(JSON) # e.g. {"-4": 2, ...}
    presort_config: Mapped[dict[str, Any]] = mapped_column(JSON) # e.g. Schema for usage fields
    postsort_config: Mapped[dict[str, Any]] = mapped_column(JSON) # e.g. Logic for follow-up

    # Relationships
    translations: Mapped[List["StudyTranslation"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    statements: Mapped[List["Statement"]] = relationship(back_populates="study", cascade="all, delete-orphan")
    participants: Mapped[List["Participant"]] = relationship(back_populates="study", cascade="all, delete-orphan")

class StudyTranslation(Base):
    __tablename__ = "study_translations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"))
    language_code: Mapped[str] = mapped_column(String(5)) # e.g. "en", "fr-FR"
    
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    instructions: Mapped[str] = mapped_column(String) # HTML/MD
    ui_labels: Mapped[dict[str, str]] = mapped_column(JSON, default=dict) # Button adjustments
    consent_title: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    consent_description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    consent_accept: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    consent_decline: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    study: Mapped["Study"] = relationship(back_populates="translations")

    __table_args__ = (
        UniqueConstraint("study_id", "language_code", name="uq_study_lang"),
    )

# Statement Models
class Statement(Base):
    __tablename__ = "statements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String) # "S1", "S2"...

    study: Mapped["Study"] = relationship(back_populates="statements")
    translations: Mapped[List["StatementTranslation"]] = relationship(back_populates="statement", cascade="all, delete-orphan")

class StatementTranslation(Base):
    __tablename__ = "statement_translations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    statement_id: Mapped[int] = mapped_column(ForeignKey("statements.id", ondelete="CASCADE"))
    language_code: Mapped[str] = mapped_column(String(5))
    text: Mapped[str] = mapped_column(String)

    statement: Mapped["Statement"] = relationship(back_populates="translations")

    __table_args__ = (
        UniqueConstraint("statement_id", "language_code", name="uq_statement_lang"),
    )

# Participant & QSort
class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"))
    session_token: Mapped[UUID] = mapped_column(unique=True, index=True, default=uuid4)
    language_used: Mapped[str] = mapped_column(String(5))
    status: Mapped[ParticipantStatus] = mapped_column(SAEnum(ParticipantStatus), default=ParticipantStatus.started)

    # Metadata
    confirmation_code: Mapped[Optional[str]] = mapped_column(String(8), unique=True, index=True, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Answers
    presort_answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    postsort_answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    study: Mapped["Study"] = relationship(back_populates="participants")
    qsort_entries: Mapped[List["QSortEntry"]] = relationship(back_populates="participant", cascade="all, delete-orphan")

class QSortEntry(Base):
    __tablename__ = "qsort_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"))
    statement_id: Mapped[int] = mapped_column(ForeignKey("statements.id", ondelete="CASCADE"))
    
    grid_score: Mapped[int] = mapped_column(Integer) # -4, 0, 4
    card_comment: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    participant: Mapped["Participant"] = relationship(back_populates="qsort_entries")
    statement: Mapped["Statement"] = relationship()

    __table_args__ = (
        UniqueConstraint("participant_id", "statement_id", name="uq_participant_statement"),
    )
