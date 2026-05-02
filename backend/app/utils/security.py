"""Security utilities."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, TypedDict, cast

import bcrypt
import jwt
import pyotp
from typing_extensions import Required

from app.core.config import settings

EmailTokenPurpose = Literal["email_verify", "password_reset", "twofa_disable"]

EMAIL_TOKEN_ISSUER = "qualis"
EMAIL_TOKEN_AUDIENCE = "auth-email"


class EmailTokenPayload(TypedDict, total=False):
    sub: Required[str]
    purpose: Required[EmailTokenPurpose]
    iss: Required[str]
    aud: Required[str]
    exp: Required[int]
    iat: Required[int]
    jti: Required[str]
    pwa: int  # password_reset only


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(
    subject: str | object, expires_delta: timedelta | None = None
) -> str:
    """Create a JWT access token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def create_invitation_token(
    email: str,
    role: str,
    study_id: int | None = None,
    project_id: int | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT invitation token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=7)  # Default 7 days

    to_encode = {
        "exp": expire,
        "sub": email,
        "role": role,
        "type": "invitation",
    }
    if study_id:
        to_encode["study_id"] = study_id
    if project_id:
        to_encode["project_id"] = project_id
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_invitation_token(token: str) -> dict[str, Any]:  # type: ignore[explicit-any]
    """Decode and validate an invitation token.

    The return type is `dict[str, Any]` because JWT payloads carry
    untyped wire data; callers downcast individual fields. Using
    `Any` here is a deliberate exception to the strict module rule.
    """
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("type") != "invitation":
        raise jwt.InvalidTokenError("Not an invitation token")
    return payload


def create_email_token(
    email: str,
    purpose: EmailTokenPurpose,
    expires_delta: timedelta,
    password_changed_at: datetime | None = None,
) -> str:
    """Issue a signed JWT for one of the link-based auth-email flows.

    For purpose='password_reset', password_changed_at is REQUIRED — its
    epoch-second value is encoded as `pwa` claim and re-validated at
    consume time as replay defense (a rotated password kills the token).
    """
    if purpose == "password_reset" and password_changed_at is None:
        raise ValueError(
            "password_reset token requires password_changed_at for replay defense"
        )

    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {  # type: ignore[explicit-any]
        "sub": email,
        "purpose": purpose,
        "iss": EMAIL_TOKEN_ISSUER,
        "aud": EMAIL_TOKEN_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    if password_changed_at is not None:
        payload["pwa"] = int(password_changed_at.timestamp() * 1_000_000)

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_email_token(
    token: str, expected_purpose: EmailTokenPurpose
) -> EmailTokenPayload:
    """Decode + validate an auth-email JWT. Raises ValueError on any failure."""
    try:
        raw = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            audience=EMAIL_TOKEN_AUDIENCE,
            issuer=EMAIL_TOKEN_ISSUER,
        )
    except jwt.ExpiredSignatureError as e:
        raise ValueError("token expired") from e
    except jwt.InvalidTokenError as e:
        raise ValueError(f"token invalid: {e}") from e

    if raw.get("purpose") != expected_purpose:
        raise ValueError(
            f"purpose mismatch: expected {expected_purpose}, got {raw.get('purpose')!r}"
        )

    return cast(EmailTokenPayload, raw)


def generate_totp_secret() -> str:
    """Generate a new TOTP secret."""
    return pyotp.random_base32()


def get_totp_uri(email: str, secret: str) -> str:
    """Generate a TOTP provisioning URI for QR codes."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name="Qualis")


def verify_totp_token(secret: str, token: str) -> bool:
    """Verify a TOTP token against a secret."""
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=1)
