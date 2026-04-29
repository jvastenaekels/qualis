# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Memo entries and threaded comments. Polymorphic on (parent_type, parent_id)."""

from .base import (
    Any,
    Base,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Mapped,
    MemoParentType,
    SAEnum,
    String,
    datetime,
    func,
    mapped_column,
    relationship,
)


class MemoEntry(Base):
    """One section of a memo (titled, ordered, free-form body)."""

    __tablename__ = "memo_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    parent_type: Mapped[MemoParentType] = mapped_column(
        SAEnum(MemoParentType), nullable=False
    )
    parent_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(String(10000), nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_edited_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    comments: Mapped[list["MemoComment"]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="MemoComment.created_at",
        lazy="raise",
    )


class MemoComment(Base):
    """A single comment in a thread attached to a `MemoEntry`."""

    __tablename__ = "memo_comments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("memo_entries.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(String(2000), nullable=False)
    mentions: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    entry: Mapped["MemoEntry"] = relationship(back_populates="comments", lazy="raise")


__all__ = ["MemoEntry", "MemoComment"]
