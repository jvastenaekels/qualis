"""Security utilities."""

from datetime import datetime, timedelta, timezone
from typing import Any, cast

import bcrypt
import jwt
import pyotp

from app.core.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    try:
        return cast(
            bool,
            bcrypt.checkpw(
                plain_password.encode("utf-8"), hashed_password.encode("utf-8")
            ),
        )
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return cast(
        str,
        bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8"),
    )


def create_access_token(
    subject: str | Any, expires_delta: timedelta | None = None
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
    return cast(str, encoded_jwt)


def create_invitation_token(
    email: str,
    role: str,
    study_id: int | None = None,
    workspace_id: int | None = None,
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
    if workspace_id:
        to_encode["workspace_id"] = workspace_id
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return cast(str, encoded_jwt)


def decode_invitation_token(token: str) -> dict[str, Any]:
    """Decode and validate an invitation token."""
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("type") != "invitation":
        raise jwt.InvalidTokenError("Not an invitation token")
    return cast(dict[str, Any], payload)


def generate_totp_secret() -> str:
    """Generate a new TOTP secret."""
    return pyotp.random_base32()


def get_totp_uri(email: str, secret: str) -> str:
    """Generate a TOTP provisioning URI for QR codes."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name="Open-Q")


def verify_totp_token(secret: str, token: str) -> bool:
    """Verify a TOTP token against a secret."""
    totp = pyotp.TOTP(secret)
    return totp.verify(token, valid_window=1)
