"""Authentication and TOTP schemas."""

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    """Schema for returning an access token or 2FA requirement.

    `requires_2fa=True` (with no access token) signals the frontend to
    prompt for the authenticator-app code; a successful response carries
    the access token instead.
    """

    access_token: str | None = None
    token_type: str | None = None
    requires_2fa: bool = False
    temp_token: str | None = None


class TokenData(BaseModel):
    """Schema for data stored in JWT."""

    email: str | None = None


class TOTPSetup(BaseModel):
    """Schema for TOTP setup response."""

    secret: str
    qr_code_uri: str


class TOTPVerify(BaseModel):
    """Schema for TOTP verification."""

    token: str


class TwoFAEnableRequest(BaseModel):
    """Body of POST /me/2fa/enable.

    `token` is the 6-digit TOTP code from the authenticator app, verified
    against the secret seeded by /me/2fa/setup.
    """

    token: str | None = None


class EmailTokenSubmit(BaseModel):
    """Schema for submitting an email-link JWT (verify, password-reset, etc.)."""

    token: str


class EmailRequest(BaseModel):
    """Schema for submitting an email address (resend flows)."""

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Schema for confirming a password reset via email-link JWT."""

    token: str
    new_password: str = Field(min_length=8)
