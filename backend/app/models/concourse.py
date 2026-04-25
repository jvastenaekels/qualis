# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Concourse, ConcourseItem, ConcourseItemTranslation, ConcourseTag,
ConcourseItemTag, ConcourseItemVersion, and ConcourseItemComment models."""

from .base import (
    Base,
    ConcourseItemStatus,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Mapped,
    SAEnum,
    String,
    UniqueConstraint,
    datetime,
    func,
    mapped_column,
    relationship,
)


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

    project: Mapped["Project"] = relationship(back_populates="concourses", lazy="raise")  # type: ignore[name-defined]  # noqa: F821
    items: Mapped[list["ConcourseItem"]] = relationship(
        back_populates="concourse", cascade="all, delete-orphan", lazy="raise"
    )
    creator: Mapped["User | None"] = relationship(lazy="raise")  # type: ignore[name-defined]  # noqa: F821


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
    creator: Mapped["User | None"] = relationship(lazy="raise")  # type: ignore[name-defined]  # noqa: F821

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

    project: Mapped["Project"] = relationship(  # type: ignore[name-defined]  # noqa: F821
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
    user: Mapped["User | None"] = relationship(lazy="raise")  # type: ignore[name-defined]  # noqa: F821

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
    user: Mapped["User | None"] = relationship(lazy="raise")  # type: ignore[name-defined]  # noqa: F821


__all__ = [
    "Concourse",
    "ConcourseItem",
    "ConcourseItemTranslation",
    "ConcourseTag",
    "ConcourseItemTag",
    "ConcourseItemVersion",
    "ConcourseItemComment",
]
