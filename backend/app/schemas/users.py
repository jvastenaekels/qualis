"""User schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .common import QuotaInfo, validate_non_empty_string


class UserBase(BaseModel):
    """Base schema for users."""

    email: str
    full_name: str | None = Field(None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class UserCreate(UserBase):
    """Schema for creating a new user."""

    password: str = Field(..., min_length=8)
    is_active: bool = True
    is_superuser: bool = False
    invitation_token: str | None = None


class UserRead(UserBase):
    """Schema for reading user details."""

    id: int
    is_active: bool
    is_superuser: bool
    is_totp_enabled: bool
    # F-03-011: requested-but-unconfirmed email-change destination,
    # NULL when no change is in flight. Frontend uses it to surface a
    # "Pending: <new>" hint and offer a "cancel" / "resend" action.
    pending_email: str | None = None
    # Populated by /auth/me; absent (None) elsewhere — nested UserRead
    # objects (e.g. inside ProjectMemberRead.user) don't need to carry it.
    owned_project_quota: QuotaInfo | None = None
    model_config = ConfigDict(from_attributes=True)


class UserReadAdmin(UserRead):
    """Extended user read schema for superuser-only admin endpoints.

    Carries audit fields that we do NOT expose on the public /api/me path:
    superusers see them so they can audit account hygiene
    (last login, password age, email verification status).
    """

    email_verified_at: datetime | None = None
    password_changed_at: datetime
    last_login_at: datetime | None = None


class UserAdminUpdate(BaseModel):
    """PATCH payload for /api/admin/users/{id}.

    Each field is optional so superusers can change one flag at a time
    (e.g. demote without touching activation status). Email and password
    are deliberately absent: email goes through the user-driven
    /me email-change flow; password goes through force-password-reset.
    """

    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class UserUpdate(BaseModel):
    """Schema for updating user profile."""

    email: str | None = None
    full_name: str | None = Field(None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class UserCreateResponse(BaseModel):
    """Response from POST /api/register: the user + a verification flag."""

    user: UserRead
    requires_email_verification: bool

    model_config = ConfigDict(from_attributes=True)


class PasswordChange(BaseModel):
    """Schema for changing password."""

    current_password: str
    new_password: str = Field(..., min_length=8)


class PasswordConfirm(BaseModel):
    """Schema for confirming identity with current password."""

    current_password: str
