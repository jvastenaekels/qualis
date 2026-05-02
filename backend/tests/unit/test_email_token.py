"""Unit tests for email-token JWT helpers."""

import time
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
import pytest

from app.core.config import settings
from app.utils.security import (
    create_email_token,
    decode_email_token,
)


class TestCreateEmailToken:
    def test_email_verify_token_roundtrips(self):
        token = create_email_token(
            email="alice@example.com",
            purpose="email_verify",
            expires_delta=timedelta(hours=24),
        )
        payload = decode_email_token(token, expected_purpose="email_verify")
        assert payload["sub"] == "alice@example.com"
        assert payload["purpose"] == "email_verify"
        assert payload["iss"] == "qualis"
        assert payload["aud"] == "auth-email"
        assert "jti" in payload and len(payload["jti"]) >= 16

    def test_password_reset_carries_pwa_claim(self):
        dt = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
        ts_us = int(dt.timestamp() * 1_000_000)
        token = create_email_token(
            email="alice@example.com",
            purpose="password_reset",
            expires_delta=timedelta(hours=1),
            password_changed_at=datetime.fromtimestamp(ts_us / 1_000_000, tz=timezone.utc),
        )
        payload = decode_email_token(token, expected_purpose="password_reset")
        assert payload["pwa"] == ts_us

    def test_password_reset_requires_pwa_arg(self):
        with pytest.raises(ValueError, match="password_changed_at"):
            create_email_token(
                email="alice@example.com",
                purpose="password_reset",
                expires_delta=timedelta(hours=1),
            )

    def test_decode_rejects_wrong_purpose(self):
        token = create_email_token(
            email="alice@example.com",
            purpose="email_verify",
            expires_delta=timedelta(hours=24),
        )
        with pytest.raises(ValueError, match="purpose"):
            decode_email_token(token, expected_purpose="password_reset")

    def test_decode_rejects_wrong_audience(self):
        forged = pyjwt.encode(
            {
                "sub": "alice@example.com",
                "purpose": "email_verify",
                "iss": "qualis",
                "aud": "wrong-aud",
                "exp": int(time.time()) + 3600,
                "iat": int(time.time()),
                "jti": "deadbeefdeadbeef",
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        with pytest.raises(ValueError):
            decode_email_token(forged, expected_purpose="email_verify")

    def test_decode_rejects_wrong_issuer(self):
        forged = pyjwt.encode(
            {
                "sub": "alice@example.com",
                "purpose": "email_verify",
                "iss": "wrong-issuer",
                "aud": "auth-email",
                "exp": int(time.time()) + 3600,
                "iat": int(time.time()),
                "jti": "deadbeefdeadbeef",
            },
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )
        with pytest.raises(ValueError):
            decode_email_token(forged, expected_purpose="email_verify")

    def test_decode_rejects_expired(self):
        token = create_email_token(
            email="alice@example.com",
            purpose="email_verify",
            expires_delta=timedelta(seconds=-1),
        )
        with pytest.raises(ValueError, match="expired"):
            decode_email_token(token, expected_purpose="email_verify")

    def test_jti_is_unique_across_tokens(self):
        t1 = create_email_token("a@x.com", "email_verify", timedelta(hours=1))
        t2 = create_email_token("a@x.com", "email_verify", timedelta(hours=1))
        p1 = decode_email_token(t1, expected_purpose="email_verify")
        p2 = decode_email_token(t2, expected_purpose="email_verify")
        assert p1["jti"] != p2["jti"]
