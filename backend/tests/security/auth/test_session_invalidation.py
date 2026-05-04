# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression test for F-03-010 — access tokens are invalidated when
``password_changed_at`` advances.

Pre-fix attack model
--------------------

``create_access_token`` did not embed an ``iat`` claim, and
``dependencies.get_current_user`` decoded the JWT and looked the user
up by email without consulting ``user.password_changed_at``. An
attacker holding a stolen access token (cached in browser storage,
proxy log, mobile-app keychain backup, etc.) kept access for the full
remaining 8h of the token's lifetime even after the legitimate owner
changed or reset their password — the password rotation killed
in-flight 2FA-email OTPs but not the bearer token itself.

Post-fix invariants
-------------------

1. ``create_access_token`` now embeds ``iat`` (epoch seconds at
   issue time).
2. ``get_current_user`` rejects any token whose ``iat`` is strictly
   less than the user's current ``password_changed_at`` epoch second.
3. Tokens issued in the same second the password rotated are still
   accepted (``iat == pwa`` passes), so the rotation handler can
   re-mint a fresh token without bricking the caller.
4. Tokens minted before the rollout (no ``iat`` claim) are treated as
   ``iat=0`` and therefore rejected after any password change.
5. ``POST /api/me/password`` itself bumps ``password_changed_at``;
   pre-fix it only updated ``hashed_password``, leaving the bump to
   the (rarer) reset flow.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import cast

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import User
from app.utils.security import create_access_token, get_password_hash


async def _user(db: AsyncSession, email: str, password: str = "password123") -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
class TestAccessTokenInvalidation:
    async def test_iat_claim_is_present(self) -> None:
        """``create_access_token`` must embed an ``iat`` claim.

        Without this, ``get_current_user`` cannot tell whether a token
        predates a password change.
        """
        before = int(datetime.now(timezone.utc).timestamp())
        token = create_access_token(subject="probe@example.com")
        after = int(datetime.now(timezone.utc).timestamp())

        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        assert "iat" in payload
        assert before <= cast(int, payload["iat"]) <= after

    async def test_old_token_rejected_after_password_change(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Login → /me OK → change password → /me with OLD token = 401.

        This is the F-03-010 regression. Pre-fix the second /me call
        returned 200 because get_current_user did not consult
        password_changed_at.
        """
        user = await _user(db, "rotate@example.com", "password123")

        # 1. Capture an access token via /api/token.
        login = await client.post(
            "/api/token",
            data={"username": user.email, "password": "password123"},
        )
        assert login.status_code == 200, login.text
        old_token = login.json()["access_token"]

        # 2. Confirm the token works.
        ok = await client.get(
            "/api/me", headers={"Authorization": f"Bearer {old_token}"}
        )
        assert ok.status_code == 200, ok.text

        # 3. Sleep one second so password_changed_at strictly exceeds
        #    the token's iat (epoch second resolution).
        time.sleep(1)

        # 4. Change the password — this advances password_changed_at.
        change = await client.post(
            "/api/me/password",
            headers={"Authorization": f"Bearer {old_token}"},
            json={
                "current_password": "password123",
                "new_password": "newpassword456",
            },
        )
        assert change.status_code == 200, change.text

        # 5. The old token must now be rejected.
        denied = await client.get(
            "/api/me", headers={"Authorization": f"Bearer {old_token}"}
        )
        assert denied.status_code == 401, denied.text

    async def test_fresh_token_after_password_change_works(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """A token issued AFTER the password change is accepted.

        Pin the post-rotation login flow: the user logs in with the
        new password, gets a fresh token, and that token's iat is
        ≥ password_changed_at so /me returns 200.
        """
        user = await _user(db, "rotate-fresh@example.com", "password123")

        # Bump password_changed_at via the password-change endpoint.
        login = await client.post(
            "/api/token",
            data={"username": user.email, "password": "password123"},
        )
        assert login.status_code == 200
        old_token = login.json()["access_token"]
        time.sleep(1)
        change = await client.post(
            "/api/me/password",
            headers={"Authorization": f"Bearer {old_token}"},
            json={
                "current_password": "password123",
                "new_password": "newpassword456",
            },
        )
        assert change.status_code == 200

        # Fresh login with new password.
        relogin = await client.post(
            "/api/token",
            data={"username": user.email, "password": "newpassword456"},
        )
        assert relogin.status_code == 200, relogin.text
        new_token = relogin.json()["access_token"]

        ok = await client.get(
            "/api/me", headers={"Authorization": f"Bearer {new_token}"}
        )
        assert ok.status_code == 200, ok.text

    async def test_legacy_token_without_iat_rejected_after_rotation(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Legacy tokens (no ``iat`` claim) are rejected after password change.

        The fix treats ``iat`` missing as ``iat == 0``. Before any
        password change a legacy token still works — there is no
        rotation to invalidate against — but the first password
        change kicks every legacy holder out, which is the desired
        upgrade behaviour.
        """
        user = await _user(db, "legacy@example.com", "password123")

        # Hand-craft a legacy token: the canonical pre-F-03-010 shape
        # (sub + exp only).
        expire = datetime.now(timezone.utc) + timedelta(hours=8)
        legacy_token = jwt.encode(
            {"exp": expire, "sub": user.email},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )

        # Pre-rotation: legacy token still works (iat=0 < pwa fails
        # only AFTER a rotation; user.password_changed_at default is
        # row-creation time, which is in the past, so iat=0 < pwa is
        # already true here — the legacy token should be rejected
        # immediately even without a rotation).
        denied = await client.get(
            "/api/me", headers={"Authorization": f"Bearer {legacy_token}"}
        )
        # New users get password_changed_at = now() at row creation,
        # which is a non-zero epoch, so iat=0 < pwa → 401 even on a
        # freshly-rolled-out legacy token. This is the expected upgrade
        # cliff: legacy tokens stop working immediately.
        assert denied.status_code == 401, denied.text

    async def test_token_iat_equal_to_pwa_accepted(
        self, db: AsyncSession
    ) -> None:
        """Boundary: iat == password_changed_at is accepted.

        The check is strict ``<``, not ``<=``. A token minted in the
        exact same second the rotation handler ran (the legitimate
        re-mint case) must still validate.
        """
        from app.dependencies import get_current_user

        user = await _user(db, "boundary@example.com")
        # Force iat and pwa to the same epoch second.
        same_second = datetime.now(timezone.utc).replace(microsecond=0)
        user.password_changed_at = same_second
        await db.commit()

        token_payload = {
            "exp": same_second + timedelta(hours=1),
            "iat": int(same_second.timestamp()),
            "sub": user.email,
        }
        token = jwt.encode(
            token_payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM
        )

        # Direct dependency call (bypasses OAuth2 scheme parsing).
        result = await get_current_user(token=token, db=db)
        assert result.email == user.email
