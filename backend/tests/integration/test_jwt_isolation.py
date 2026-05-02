"""Regression: JWT family isolation across access / invitation / email-flow tokens.

The three families share SECRET_KEY + ALGORITHM. Mitigation against
confusion-attack is via strict claim validation. This file pins the
mitigation so a future refactor cannot silently break it.
"""

from datetime import timedelta

import pytest
from httpx import AsyncClient

from app.models import User
from app.utils.security import (
    create_access_token,
    create_email_token,
    create_invitation_token,
    decode_email_token,
    decode_invitation_token,
)


@pytest.mark.asyncio
class TestJWTFamilyIsolation:
    """Verify that no token of one family can be consumed by another's decoder."""

    # --- Decoder-level isolation ---

    async def test_access_token_rejected_by_decode_email_token(
        self, test_user: User
    ):
        access = create_access_token(
            subject=test_user.email, expires_delta=timedelta(hours=1)
        )
        with pytest.raises(ValueError):
            decode_email_token(access, expected_purpose="email_verify")

    async def test_invitation_token_rejected_by_decode_email_token(
        self, test_user: User
    ):
        from app.models import ProjectRole

        inv = create_invitation_token(
            email=test_user.email, role=ProjectRole.member.value
        )
        with pytest.raises(ValueError):
            decode_email_token(inv, expected_purpose="email_verify")

    async def test_email_token_rejected_by_decode_invitation_token(
        self, test_user: User
    ):
        # email-flow token has no `type='invitation'` claim and carries
        # an `aud` claim. decode_invitation_token does not pass
        # `audience=`, so PyJWT raises InvalidAudienceError; even if it
        # accepted the audience, the missing `type` claim would trip
        # the explicit check inside decode_invitation_token.
        email_tok = create_email_token(
            email=test_user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=1),
        )
        with pytest.raises(Exception):
            decode_invitation_token(email_tok)

    async def test_email_purpose_mismatch_within_family(
        self, test_user: User
    ):
        verify_tok = create_email_token(
            email=test_user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=1),
        )
        with pytest.raises(ValueError, match="purpose"):
            decode_email_token(verify_tok, expected_purpose="twofa_disable")

    # --- Route-level isolation (end-to-end via the FastAPI app) ---

    async def test_access_token_cannot_consume_email_verify_endpoint(
        self, client: AsyncClient, test_user: User
    ):
        access = create_access_token(
            subject=test_user.email, expires_delta=timedelta(hours=1)
        )
        r = await client.post("/api/email/verify", json={"token": access})
        assert r.status_code == 400

    async def test_invitation_token_cannot_consume_email_verify(
        self, client: AsyncClient, test_user: User
    ):
        from app.models import ProjectRole

        inv = create_invitation_token(
            email=test_user.email, role=ProjectRole.member.value
        )
        r = await client.post("/api/email/verify", json={"token": inv})
        assert r.status_code == 400

    async def test_email_verify_token_cannot_consume_password_reset(
        self, client: AsyncClient, test_user: User
    ):
        # A token issued for the email_verify purpose must not be
        # accepted by the password-reset confirm endpoint.
        verify_tok = create_email_token(
            email=test_user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=1),
        )
        r = await client.post(
            "/api/password/reset/confirm",
            json={"token": verify_tok, "new_password": "newpass123"},
        )
        assert r.status_code == 400

    async def test_email_verify_token_cannot_consume_2fa_disable(
        self, client: AsyncClient, test_user: User
    ):
        verify_tok = create_email_token(
            email=test_user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=1),
        )
        r = await client.post(
            "/api/2fa/disable/confirm", json={"token": verify_tok}
        )
        assert r.status_code == 400

    async def test_email_token_cannot_be_used_as_access_token(
        self, client: AsyncClient, test_user: User
    ):
        """An email-flow JWT presented as a Bearer access token must be rejected.

        This is the most security-critical isolation: if the access-token
        decoder is lax about iss/aud/purpose, an attacker who phishes an
        email-flow token (e.g., a verification link) could elevate to a
        full session. The access-token decoder MUST reject anything with
        iss=qualis or aud=auth-email or any unexpected claim shape.
        """
        email_tok = create_email_token(
            email=test_user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=1),
        )
        r = await client.get(
            "/api/me", headers={"Authorization": f"Bearer {email_tok}"}
        )
        # 401 = correctly rejected. If 200, that's a real vuln to surface.
        assert r.status_code == 401, (
            f"SECURITY: access-token decoder accepted an email-flow JWT "
            f"as Bearer credentials. Response: {r.text}"
        )
