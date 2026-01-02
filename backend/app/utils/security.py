"""Security utilities."""

from datetime import datetime, timedelta, timezone
from typing import Any, cast

import bcrypt
import jwt

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
    email: str, study_id: int, role: str, expires_delta: timedelta | None = None
) -> str:
    """Create a JWT invitation token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=7)  # Default 7 days

    to_encode = {
        "exp": expire,
        "sub": email,
        "study_id": study_id,
        "role": role,
        "type": "invitation",
    }
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
