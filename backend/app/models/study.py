# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Study, StudyTranslation, Statement, and StatementTranslation models."""

import enum

from .base import (
    Any,
    Base,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Mapped,
    SAEnum,
    String,
    StudyState,
    UniqueConstraint,
    datetime,
    func,
    mapped_column,
    relationship,
)


class DistributionMode(str, enum.Enum):
    """Enum for Q-sort grid distribution enforcement.

    forced — each column must hold exactly its declared capacity
        (Brown 1980; Watts & Stenner 2012).
    free — total count must equal Q-set size; per-column capacities
        ignored at validation (Brown et al. 2015).
    flexible — total enforced, per-column capacities are soft hints
        (warnings only). Qualis-specific compromise.
    """

    forced = "forced"
    free = "free"
    flexible = "flexible"


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
    distribution_mode: Mapped[DistributionMode] = mapped_column(
        SAEnum(DistributionMode, name="distributionmode"),
        default=DistributionMode.forced,
        server_default="forced",
    )
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
    # Optional, free-text methodological memo (mirrors the per-concourse
    # construction_memo). Surfaces the rationale behind distribution,
    # conditions of instruction, Q-set size — useful for replication and
    # pre-registration (Watts & Stenner 2012; Sneegas 2020).
    methodology_memo: Mapped[str | None] = mapped_column(String, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="studies", lazy="selectin")  # type: ignore[name-defined]  # noqa: F821
    translations: Mapped[list["StudyTranslation"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    statements: Mapped[list["Statement"]] = relationship(
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )
    participants: Mapped[list["Participant"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="study", cascade="all, delete-orphan", lazy="raise"
    )
    recruitment_links: Mapped[list["RecruitmentLink"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="study", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def requires_password(self) -> bool:
        return bool(self.access_password)

    # participant_count is defined as a column_property in __init__.py after Participant


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


__all__ = [
    "DistributionMode",
    "Statement",
    "StatementTranslation",
    "Study",
    "StudyTranslation",
]
