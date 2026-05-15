# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""User model."""

from .base import (
    Base,
    Boolean,
    DateTime,
    Mapped,
    String,
    datetime,
    func,
    mapped_column,
    relationship,
    timezone,
)


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

    # Email verification + password audit
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    totp_channel: Mapped[str | None] = mapped_column(String, nullable=True)
    password_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    # F-03-011: pending email-change destination. NULL when no change is
    # in flight; populated by PATCH /me when the user requests an email
    # change. Cleared by /email-change/confirm (after the swap) and
    # /email-change/cancel (without a swap). See migration
    # a3f1c2e9b4d7_add_pending_email_column.py.
    pending_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    memberships: Mapped[list["ProjectMember"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="raise",
    )


__all__ = ["User"]
