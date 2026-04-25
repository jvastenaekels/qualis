# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""RecruitmentLink and Invitation models."""

from .base import (
    Base,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Mapped,
    ProjectRole,
    RecruitmentLinkType,
    SAEnum,
    String,
    datetime,
    func,
    mapped_column,
    relationship,
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

    study: Mapped["Study"] = relationship(  # type: ignore[name-defined]  # noqa: F821
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

    project: Mapped["Project"] = relationship(lazy="raise")  # type: ignore[name-defined]  # noqa: F821


__all__ = ["RecruitmentLink", "Invitation"]
