# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression test for F-03-012 — clock-skew leeway on JWT validation.

Pre-fix every ``jwt.decode`` call site (``decode_email_token``,
``decode_invitation_token``, and the access-JWT decode in
``dependencies.get_current_user``) ran with ``leeway=0``. A token whose
``exp`` had passed by even one millisecond on the verifier's clock — or
a token whose ``iat`` lay in the future on the verifier's clock — was
rejected. Operationally this hurt legitimate users on systems where
NTP drifted between issuer and verifier; it did not gain any security.

Post-fix every decode path applies ``settings.JWT_LEEWAY_SECONDS``
(default 30s) to both ``exp`` and ``iat``. 30s is tight enough to
bound the post-``exp`` replay window (an attacker who races with the
expiry gets at most 30 extra seconds) and loose enough to absorb
normal clock drift without operator intervention.

These tests pin the boundary on both sides:

* Within-leeway (5s): the wrapper must accept the token.
* Outside-leeway (60s): the wrapper must reject the token.

Both sides are exercised on ``exp`` (token expired in the past) and
``iat`` (token issued in the future). All assertions go through the
public wrappers in ``app.utils.security`` and the
``decode_access_token`` wrapper used by ``get_current_user`` — never
through raw ``jwt.decode`` — so a future refactor that reorders the
decode path or strips the ``leeway`` kwarg will fail this suite.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import settings
from app.utils.security import (
    EMAIL_TOKEN_AUDIENCE,
    EMAIL_TOKEN_ISSUER,
    decode_access_token,
    decode_email_token,
    decode_invitation_token,
)


def _mint_email_token(*, exp_offset_seconds: int, iat_offset_seconds: int = 0) -> str:
    """Mint an email-verify JWT with controllable ``exp`` / ``iat`` offsets.

    Negative ``exp_offset_seconds`` puts the token in the past; positive
    ``iat_offset_seconds`` puts the token's issue time in the future.
    """
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, object] = {
        "sub": "skew@example.com",
        "purpose": "email_verify",
        "iss": EMAIL_TOKEN_ISSUER,
        "aud": EMAIL_TOKEN_AUDIENCE,
        "iat": int((now + timedelta(seconds=iat_offset_seconds)).timestamp()),
        "exp": int((now + timedelta(seconds=exp_offset_seconds)).timestamp()),
        "jti": "skew-test-jti",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _mint_access_token(*, exp_offset_seconds: int, iat_offset_seconds: int = 0) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": "skew@example.com",
        "iat": int((now + timedelta(seconds=iat_offset_seconds)).timestamp()),
        "exp": int((now + timedelta(seconds=exp_offset_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _mint_invitation_token(
    *, exp_offset_seconds: int, iat_offset_seconds: int = 0
) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": "skew@example.com",
        "role": "viewer",
        "type": "invitation",
        "iat": int((now + timedelta(seconds=iat_offset_seconds)).timestamp()),
        "exp": int((now + timedelta(seconds=exp_offset_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


class TestEmailTokenLeeway:
    """``decode_email_token`` is the wrapper exercised by every email-link route."""

    def test_recently_expired_token_within_leeway_accepted(self) -> None:
        """A token whose ``exp`` is 5s in the past is accepted."""
        assert settings.JWT_LEEWAY_SECONDS >= 5
        token = _mint_email_token(exp_offset_seconds=-5)
        claims = decode_email_token(token, expected_purpose="email_verify")
        assert claims["sub"] == "skew@example.com"

    def test_expired_token_outside_leeway_rejected(self) -> None:
        """A token whose ``exp`` is 60s in the past is rejected."""
        assert settings.JWT_LEEWAY_SECONDS < 60
        token = _mint_email_token(exp_offset_seconds=-60)
        with pytest.raises(ValueError, match="token expired"):
            decode_email_token(token, expected_purpose="email_verify")

    def test_future_iat_within_leeway_accepted(self) -> None:
        """A token whose ``iat`` is 5s in the future is accepted.

        ``exp`` is set far in the future so the only thing under test is
        the ``iat`` (immature-token) branch.
        """
        token = _mint_email_token(
            exp_offset_seconds=3600, iat_offset_seconds=5
        )
        claims = decode_email_token(token, expected_purpose="email_verify")
        assert claims["sub"] == "skew@example.com"

    def test_future_iat_outside_leeway_rejected(self) -> None:
        """A token whose ``iat`` is 60s in the future is rejected."""
        token = _mint_email_token(
            exp_offset_seconds=3600, iat_offset_seconds=60
        )
        with pytest.raises(ValueError, match="token invalid"):
            decode_email_token(token, expected_purpose="email_verify")


class TestAccessTokenLeeway:
    """``decode_access_token`` is the wrapper used by ``get_current_user``."""

    def test_recently_expired_token_within_leeway_accepted(self) -> None:
        token = _mint_access_token(exp_offset_seconds=-5)
        payload = decode_access_token(token)
        assert payload["sub"] == "skew@example.com"

    def test_expired_token_outside_leeway_rejected(self) -> None:
        token = _mint_access_token(exp_offset_seconds=-60)
        with pytest.raises(jwt.ExpiredSignatureError):
            decode_access_token(token)

    def test_future_iat_within_leeway_accepted(self) -> None:
        token = _mint_access_token(
            exp_offset_seconds=3600, iat_offset_seconds=5
        )
        payload = decode_access_token(token)
        assert payload["sub"] == "skew@example.com"

    def test_future_iat_outside_leeway_rejected(self) -> None:
        token = _mint_access_token(
            exp_offset_seconds=3600, iat_offset_seconds=60
        )
        with pytest.raises(jwt.ImmatureSignatureError):
            decode_access_token(token)


class TestInvitationTokenLeeway:
    """``decode_invitation_token`` is exercised by both the registration and
    admin-invitation flows. The same leeway must apply.
    """

    def test_recently_expired_token_within_leeway_accepted(self) -> None:
        token = _mint_invitation_token(exp_offset_seconds=-5)
        payload = decode_invitation_token(token)
        assert payload["sub"] == "skew@example.com"

    def test_expired_token_outside_leeway_rejected(self) -> None:
        token = _mint_invitation_token(exp_offset_seconds=-60)
        with pytest.raises(jwt.ExpiredSignatureError):
            decode_invitation_token(token)

    def test_future_iat_within_leeway_accepted(self) -> None:
        token = _mint_invitation_token(
            exp_offset_seconds=3600, iat_offset_seconds=5
        )
        payload = decode_invitation_token(token)
        assert payload["sub"] == "skew@example.com"

    def test_future_iat_outside_leeway_rejected(self) -> None:
        token = _mint_invitation_token(
            exp_offset_seconds=3600, iat_offset_seconds=60
        )
        with pytest.raises(jwt.ImmatureSignatureError):
            decode_invitation_token(token)


class TestLeewaySourcedFromConfig:
    """Pin that the leeway value is configurable, not magic-numbered.

    A future refactor that hard-codes ``leeway=30`` (e.g. inlined into
    one wrapper while another is left at ``leeway=0``) is what we are
    guarding against — operators must be able to tune the value
    centrally via ``JWT_LEEWAY_SECONDS``.
    """

    def test_default_leeway_is_30_seconds(self) -> None:
        """Pin the canonical default. Changing this is a Wave-doc decision."""
        assert settings.JWT_LEEWAY_SECONDS == 30
