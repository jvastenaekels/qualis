# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Project and ProjectMember models."""

from .base import (
    Base,
    DateTime,
    ForeignKey,
    JSON,
    Mapped,
    ProjectRole,
    SAEnum,
    String,
    Any,
    func,
    mapped_column,
    relationship,
    datetime,
)


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
    studies: Mapped[list["Study"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="project", cascade="all, delete-orphan", lazy="raise"
    )
    members: Mapped[list["ProjectMember"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", lazy="raise"
    )
    concourses: Mapped[list["Concourse"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="project", cascade="all, delete-orphan", lazy="raise"
    )
    concourse_tags: Mapped[list["ConcourseTag"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
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
    user: Mapped["User"] = relationship(back_populates="memberships", lazy="raise")  # type: ignore[name-defined]  # noqa: F821


__all__ = ["Project", "ProjectMember"]
