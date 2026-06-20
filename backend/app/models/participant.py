# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Participant, QSortEntry, and AudioRecording models."""

from .base import (
    Any,
    Base,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    Mapped,
    ParticipantStatus,
    SAEnum,
    SESSION_TTL_DAYS,
    SmallInteger,
    String,
    UUID,
    UniqueConstraint,
    datetime,
    func,
    mapped_column,
    relationship,
    timedelta,
    timezone,
    uuid4,
)


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

    study: Mapped["Study"] = relationship(back_populates="participants", lazy="raise")  # type: ignore[name-defined]  # noqa: F821
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

    @property
    def code(self) -> str:
        """Short, non-sensitive display code for the admin UI.

        The full ``session_token`` is the participant's bearer credential
        (resume, draft read, submission, GDPR self-erasure) and must never be
        serialised to clients — exposing it lets even a viewer impersonate any
        participant. This truncated, non-reversible 8-char prefix is exactly
        what the admin UI already rendered, and matches the dump/export
        ``str(session_token)[:8].upper()`` convention.
        """
        return str(self.session_token)[:8].upper()


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
    statement: Mapped["Statement"] = relationship(lazy="selectin")  # type: ignore[name-defined]  # noqa: F821

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


__all__ = ["Participant", "QSortEntry", "AudioRecording"]
