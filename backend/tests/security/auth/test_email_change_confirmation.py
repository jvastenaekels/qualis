# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression tests for F-03-011 — email-change dual-confirmation flow.

Pre-fix attack model
--------------------

``PATCH /me`` accepted ``user_update.email`` and wrote the new value
to ``users.email`` directly, with no second-factor email loop. An
attacker who briefly held an authenticated session (XSS, leaked bearer
token, hijacked browser) could silently move the account to an
attacker-controlled mailbox. Once the email was rotated, every
auth-email flow (password-reset, 2FA-disable) would deliver to the
attacker; the legitimate owner had no notification on their old address
and no path back into the account.

Post-fix invariants
-------------------

1. ``PATCH /me`` with a new email parks the address on
   ``users.pending_email`` instead of overwriting ``users.email``.
2. Two single-use JWTs are issued: a confirmation link to the new
   address, a cancellation link to the old address.
3. ``POST /api/email-change/confirm`` swaps ``email <- pending_email``
   and clears ``pending_email``. Single-use is enforced by the
   ``new_email`` claim cross-check against ``pending_email``.
4. ``POST /api/email-change/cancel`` clears ``pending_email`` without
   touching ``email``.
5. PATCH /me is uniform-by-response whether the requested address is
   free or already taken — the address-taken case fails at confirm
   time, not at PATCH time, so the endpoint cannot be used to
   enumerate registered emails.
6. A second PATCH /me with a different new email replaces the pending
   request; the prior confirm token now mismatches ``new_email`` vs
   ``pending_email`` and is rejected.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import User
from app.utils.security import create_email_token, get_password_hash


async def _user(
    db: AsyncSession, email: str, password: str = "password123"
) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _login(client: AsyncClient, email: str, password: str = "password123") -> str:
    resp = await client.post(
        "/api/token",
        data={"username": email, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return str(resp.json()["access_token"])


@pytest.mark.asyncio
class TestEmailChangeHappyPath:
    async def test_patch_me_parks_pending_email_and_sends_two_emails(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """PATCH /me with new email → pending_email set, two emails sent.

        ``users.email`` must NOT be rotated yet — the change is in
        flight until the confirmation link is clicked.
        """
        user = await _user(db, "happy@example.com")
        token = await _login(client, user.email)

        with patch(
            "app.services.email_change_service.send_email_change_confirmation"
        ) as mock_confirm, patch(
            "app.services.email_change_service.send_email_change_notification"
        ) as mock_notify:
            resp = await client.patch(
                "/api/me",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "happy-new@example.com"},
            )
            assert resp.status_code == 200, resp.text

            # Confirmation goes to NEW address.
            assert mock_confirm.call_count == 1
            assert mock_confirm.call_args.kwargs["email_to"] == "happy-new@example.com"
            assert "/email-change/confirm?token=" in mock_confirm.call_args.kwargs[
                "confirm_url"
            ]

            # Notification goes to OLD address and includes the new one.
            assert mock_notify.call_count == 1
            assert mock_notify.call_args.kwargs["email_to"] == "happy@example.com"
            assert mock_notify.call_args.kwargs["new_email"] == "happy-new@example.com"
            assert "/email-change/cancel?token=" in mock_notify.call_args.kwargs[
                "cancel_url"
            ]

        # users.email unchanged; users.pending_email holds the request.
        await db.refresh(user)
        assert user.email == "happy@example.com"
        assert user.pending_email == "happy-new@example.com"

        # Response carries the still-old email and surfaces pending_email.
        body = resp.json()
        assert body["email"] == "happy@example.com"
        assert body["pending_email"] == "happy-new@example.com"

    async def test_confirm_swaps_email_and_clears_pending(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Consuming the confirm token swaps email and clears pending."""
        user = await _user(db, "confirm@example.com")

        # Manually set up the pending state + mint a confirm token.
        user.pending_email = "confirm-new@example.com"
        await db.commit()

        token = create_email_token(
            email=user.email,
            purpose="email_change_confirm",
            expires_delta=timedelta(hours=1),
            new_email="confirm-new@example.com",
        )

        resp = await client.post(
            "/api/email-change/confirm", json={"token": token}
        )
        assert resp.status_code == 200, resp.text

        await db.refresh(user)
        assert user.email == "confirm-new@example.com"
        assert user.pending_email is None

    async def test_password_changed_at_not_bumped_on_confirm(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Email change is NOT a credential rotation.

        Existing access tokens must remain valid through the swap.
        Pinning password_changed_at unchanged guarantees that
        get_current_user (which compares iat vs pwa for F-03-010)
        still accepts pre-swap tokens.
        """
        user = await _user(db, "no-rotate@example.com")
        pwa_before = user.password_changed_at

        user.pending_email = "no-rotate-new@example.com"
        await db.commit()

        token = create_email_token(
            email=user.email,
            purpose="email_change_confirm",
            expires_delta=timedelta(hours=1),
            new_email="no-rotate-new@example.com",
        )
        resp = await client.post(
            "/api/email-change/confirm", json={"token": token}
        )
        assert resp.status_code == 200

        await db.refresh(user)
        assert user.password_changed_at == pwa_before


@pytest.mark.asyncio
class TestEmailChangeCancel:
    async def test_cancel_clears_pending_without_changing_email(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Cancellation link clears pending_email and nothing else."""
        user = await _user(db, "cancel@example.com")
        user.pending_email = "cancel-new@example.com"
        await db.commit()

        token = create_email_token(
            email=user.email,
            purpose="email_change_cancel",
            expires_delta=timedelta(hours=24),
        )
        resp = await client.post(
            "/api/email-change/cancel", json={"token": token}
        )
        assert resp.status_code == 200, resp.text

        await db.refresh(user)
        assert user.email == "cancel@example.com"
        assert user.pending_email is None

    async def test_cancel_idempotent_when_no_pending(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Cancellation against an already-clean account returns 200."""
        user = await _user(db, "no-pending@example.com")
        # No pending_email set.
        token = create_email_token(
            email=user.email,
            purpose="email_change_cancel",
            expires_delta=timedelta(hours=24),
        )
        resp = await client.post(
            "/api/email-change/cancel", json={"token": token}
        )
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestEmailChangeReplay:
    async def test_confirm_token_cannot_be_used_twice(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Replay of a consumed confirm token is rejected.

        After the first confirm the user's ``email`` was rotated and
        ``pending_email`` was cleared. A second attempt with the same
        token: the token's ``sub`` claim still names the *old* email,
        which no longer matches any user row, so the consume path
        returns 400 ``invalid_token``. (Either rejection — invalid_token
        on missing user, or token_already_consumed on pending mismatch
        if the user kept the old address but cleared pending — is
        equally fine for the security invariant: the token cannot be
        reused to mutate state. We pin 400 status only.)
        """
        user = await _user(db, "replay@example.com")
        user.pending_email = "replay-new@example.com"
        await db.commit()

        token = create_email_token(
            email=user.email,
            purpose="email_change_confirm",
            expires_delta=timedelta(hours=1),
            new_email="replay-new@example.com",
        )
        first = await client.post(
            "/api/email-change/confirm", json={"token": token}
        )
        assert first.status_code == 200, first.text

        # The swap landed.
        await db.refresh(user)
        assert user.email == "replay-new@example.com"
        assert user.pending_email is None

        # Replay is rejected (no further state mutation).
        second = await client.post(
            "/api/email-change/confirm", json={"token": token}
        )
        assert second.status_code == 400, second.text

        await db.refresh(user)
        assert user.email == "replay-new@example.com"
        assert user.pending_email is None


@pytest.mark.asyncio
class TestEmailChangeTamper:
    async def test_confirm_with_mismatched_new_email_is_rejected(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Tamper: token's new_email claim ≠ user's pending_email → 400.

        This is the anti-tamper anchor that also doubles as the
        single-use gate when a user re-PATCHes /me with a different
        target.
        """
        user = await _user(db, "tamper@example.com")
        user.pending_email = "real-new@example.com"
        await db.commit()

        # Token was minted for a DIFFERENT new_email — e.g. an attacker
        # who learned the structure of the JWT and tried to re-issue
        # one of their own (they can't sign without the secret) or a
        # legitimate token for an older PATCH whose target was
        # superseded.
        token = create_email_token(
            email=user.email,
            purpose="email_change_confirm",
            expires_delta=timedelta(hours=1),
            new_email="attacker-new@example.com",
        )
        resp = await client.post(
            "/api/email-change/confirm", json={"token": token}
        )
        assert resp.status_code == 400
        assert resp.json()["message"] == "token_already_consumed"

        # State is unchanged.
        await db.refresh(user)
        assert user.email == "tamper@example.com"
        assert user.pending_email == "real-new@example.com"


@pytest.mark.asyncio
class TestEmailChangeExpiry:
    async def test_expired_confirm_token_rejected(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Expired confirmation token → 400 token expired."""
        user = await _user(db, "expire@example.com")
        user.pending_email = "expire-new@example.com"
        await db.commit()

        # Hand-craft a token whose exp is in the past.
        now = datetime.now(timezone.utc)
        payload = {
            "sub": user.email,
            "purpose": "email_change_confirm",
            "iss": "qualis",
            "aud": "auth-email",
            "iat": int((now - timedelta(hours=2)).timestamp()),
            "exp": int((now - timedelta(hours=1)).timestamp()),
            "jti": "expired-jti",
            "new_email": "expire-new@example.com",
        }
        token = jwt.encode(
            payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM
        )

        resp = await client.post(
            "/api/email-change/confirm", json={"token": token}
        )
        assert resp.status_code == 400
        # The decode_email_token wrapper surfaces "token expired".
        assert "expired" in resp.json()["message"].lower()


@pytest.mark.asyncio
class TestEmailChangeEnumeration:
    async def test_patch_me_uniform_response_for_taken_vs_free_target(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """PATCH /me responds identically whether the target is taken.

        Anti-enumeration: the address-taken case must not be
        observable to the API caller at PATCH time. The unique
        constraint on users.email is checked at confirm time
        (where the token reaches a 409 instead of a 200), but the
        PATCH /me response shape is the same for both cases — same
        status, same body, same pending_email payload, same
        downstream emails dispatched.
        """
        # Set up two users + the actor.
        await _user(db, "taken@example.com")
        actor = await _user(db, "actor@example.com")
        token = await _login(client, actor.email)

        # Probe 1: target is free.
        with patch(
            "app.services.email_change_service.send_email_change_confirmation"
        ), patch(
            "app.services.email_change_service.send_email_change_notification"
        ):
            free = await client.patch(
                "/api/me",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "free@example.com"},
            )

        # Reset pending_email for a clean second probe.
        await db.refresh(actor)
        actor.pending_email = None
        await db.commit()

        # Probe 2: target is already taken.
        with patch(
            "app.services.email_change_service.send_email_change_confirmation"
        ), patch(
            "app.services.email_change_service.send_email_change_notification"
        ):
            taken = await client.patch(
                "/api/me",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "taken@example.com"},
            )

        # Status + shape parity.
        assert free.status_code == taken.status_code == 200
        free_body = free.json()
        taken_body = taken.json()
        # The pending_email field is populated in both cases — the
        # PATCH endpoint cannot tell the caller whether the target
        # is free or taken.
        assert free_body["pending_email"] == "free@example.com"
        assert taken_body["pending_email"] == "taken@example.com"
        assert free_body["email"] == taken_body["email"] == "actor@example.com"


@pytest.mark.asyncio
class TestEmailChangeMultiPending:
    async def test_second_patch_replaces_first_pending(
        self, db: AsyncSession, client: AsyncClient
    ) -> None:
        """Second PATCH /me with another new email replaces the pending.

        The prior confirm token is invalidated by the new_email
        mismatch at consume time — proves single-use semantics
        without needing a JTI denylist for this flow.
        """
        actor = await _user(db, "multi@example.com")
        token = await _login(client, actor.email)

        # First PATCH: target #1.
        with patch(
            "app.services.email_change_service.send_email_change_confirmation"
        ), patch(
            "app.services.email_change_service.send_email_change_notification"
        ):
            r1 = await client.patch(
                "/api/me",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "first-target@example.com"},
            )
        assert r1.status_code == 200

        # Mint a confirm token for target #1 (mirroring what was
        # emailed; since we patched send_*, we re-create it from
        # the known shape).
        first_token = create_email_token(
            email=actor.email,
            purpose="email_change_confirm",
            expires_delta=timedelta(hours=1),
            new_email="first-target@example.com",
        )

        # Second PATCH: target #2, which overwrites pending_email.
        with patch(
            "app.services.email_change_service.send_email_change_confirmation"
        ), patch(
            "app.services.email_change_service.send_email_change_notification"
        ):
            r2 = await client.patch(
                "/api/me",
                headers={"Authorization": f"Bearer {token}"},
                json={"email": "second-target@example.com"},
            )
        assert r2.status_code == 200

        await db.refresh(actor)
        assert actor.pending_email == "second-target@example.com"

        # Now consume the FIRST confirm token: must fail because
        # pending_email no longer matches its new_email claim.
        resp = await client.post(
            "/api/email-change/confirm", json={"token": first_token}
        )
        assert resp.status_code == 400
        assert resp.json()["message"] == "token_already_consumed"

        # The fresh second token must still work.
        second_token = create_email_token(
            email=actor.email,
            purpose="email_change_confirm",
            expires_delta=timedelta(hours=1),
            new_email="second-target@example.com",
        )
        resp2 = await client.post(
            "/api/email-change/confirm", json={"token": second_token}
        )
        assert resp2.status_code == 200

        await db.refresh(actor)
        assert actor.email == "second-target@example.com"
        assert actor.pending_email is None
