"""Authentication and TOTP schemas."""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    """Schema for returning an access token or 2FA requirement.

    The optional `channel` field is populated when `requires_2fa=True`
    so the frontend knows whether to render the authenticator-app
    prompt ('app') or the email-OTP prompt ('email'). It stays None
    on a successful access-token response.
    """

    access_token: str | None = None
    token_type: str | None = None
    requires_2fa: bool = False
    temp_token: str | None = None
    channel: Literal["app", "email"] | None = None


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

    The `token` field is required only for channel='app' (the existing
    TOTP flow). channel='email' enrolls the user without a TOTP token;
    the email-OTP delivery is exercised at first login.
    """

    channel: Literal["app", "email"]
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
