# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""F-06-007 — POST /api/register email-enumeration via response body and status.

Pre-fix attack model
--------------------

Two body+status enumeration oracles existed on ``/api/register``:

- **400 pre-check at auth.py:256-260** — a SELECT on ``users.email``
  short-circuited duplicate emails with
  ``HTTPException(400, "A user with this email already exists.")``.
  The 400 status alone is the oracle; the detail string is
  corroborating.
- **409 race fallback at auth.py:323-331** — an IntegrityError raised
  in the create path returned ``HTTPException(409, "A user with this
  email likely already exists")``.

A campaign at the rate-limit ceiling (5/minute per IP) could
enumerate registered accounts at ~7 200/day per source IP without any
response-side mitigation. The original Wave 2 finding classified the
risk as **minor** (rate-limited, but unrecoverable without redesign);
F-06-007 closes the carry-over from Wave 2 backlog.

Post-fix invariants
-------------------

- The duplicate-email arm and the fresh-email arm return **identical
  status codes** (always 201).
- Their **bodies are byte-equal modulo the submitted email** (which the
  attacker already knows — it's their own input).
- The duplicate-email arm dispatches a "you already have a Qualis
  account" email to the registered address with a password-reset
  link, so a legitimate owner who forgot they'd registered can still
  recover. The email is sent via ``send_register_already_registered``.
- A constant-time bcrypt cycle runs on both arms (the password is
  hashed unconditionally before the existence check) so the timing
  channel does not regress.

This module pins the body+status equality and the mail-dispatch
contract; the timing channel is covered by inspection of the bcrypt
ordering in ``register_user``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.utils.security import get_password_hash


@pytest_asyncio.fixture
async def existing_user(db: AsyncSession) -> User:
    """A pre-registered user whose email is known to the attacker."""
    user = User(
        email="enum-register-known@example.com",
        hashed_password=get_password_hash("real-password"),
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
class TestRegisterStatusAndBodyEquality:
    """Status code and body must be identical across known/unknown arms."""

    async def test_status_codes_equal(
        self, client: AsyncClient, existing_user: User
    ) -> None:
        """Both arms return 201."""
        r_known = await client.post(
            "/api/register",
            json={"email": existing_user.email, "password": "any-password-12"},
        )
        r_unknown = await client.post(
            "/api/register",
            json={"email": "no-such-enum@example.com", "password": "any-password-12"},
        )
        assert r_known.status_code == r_unknown.status_code == 201, (
            f"register status arms must match: known={r_known.status_code} "
            f"unknown={r_unknown.status_code}"
        )

    async def test_body_shapes_equal_modulo_email(
        self, client: AsyncClient, existing_user: User
    ) -> None:
        """The response bodies are byte-equal once the email field
        (which the attacker submitted) is normalised away."""
        r_known = await client.post(
            "/api/register",
            json={"email": existing_user.email, "password": "any-password-12"},
        )
        r_unknown = await client.post(
            "/api/register",
            json={"email": "no-such-enum@example.com", "password": "any-password-12"},
        )

        body_known = r_known.json()
        body_unknown = r_unknown.json()

        # Same top-level keys.
        assert set(body_known.keys()) == set(body_unknown.keys())
        # Same requires_email_verification — the operator setting
        # cannot leak account state either.
        assert (
            body_known["requires_email_verification"]
            == body_unknown["requires_email_verification"]
        )

        # User shape: same keys.
        u_known = body_known["user"]
        u_unknown = body_unknown["user"]
        assert set(u_known.keys()) == set(u_unknown.keys())

        # Strip email (the attacker's own input) and compare.
        u_known_no_email = {k: v for k, v in u_known.items() if k != "email"}
        u_unknown_no_email = {k: v for k, v in u_unknown.items() if k != "email"}
        assert u_known_no_email == u_unknown_no_email, (
            f"register response user shapes diverge: known={u_known_no_email!r} "
            f"unknown={u_unknown_no_email!r}"
        )

        # Anti-leakage: the duplicate arm must not emit the registered
        # user's id, full_name, totp state, etc. — the placeholder is
        # id=0, full_name=None, is_active=False.
        assert u_known["id"] == 0
        assert u_known["full_name"] is None
        assert u_known["is_active"] is False
        assert u_known["is_totp_enabled"] is False

    async def test_no_already_exists_string_in_body(
        self, client: AsyncClient, existing_user: User
    ) -> None:
        """Negative regression on the prior 400 detail string — must not
        appear in any response body for the duplicate path."""
        r = await client.post(
            "/api/register",
            json={"email": existing_user.email, "password": "any-password-12"},
        )
        body_text = r.text.lower()
        assert "already exists" not in body_text
        assert "likely already exists" not in body_text


@pytest.mark.asyncio
class TestDuplicateDispatchesEmail:
    """The duplicate-email arm sends an out-of-band notification."""

    @patch("app.routers.auth.send_register_already_registered")
    @patch("app.routers.auth.send_email_verification")
    async def test_duplicate_sends_already_registered_email(
        self,
        mock_send_verify,
        mock_send_already,
        client: AsyncClient,
        existing_user: User,
    ) -> None:
        """A duplicate-email register call must call
        ``send_register_already_registered`` for the existing address —
        and must NOT call the verify-email helper (no row was created)."""
        r = await client.post(
            "/api/register",
            json={"email": existing_user.email, "password": "x" * 12},
        )
        assert r.status_code == 201
        mock_send_already.assert_called_once()
        called_kwargs = mock_send_already.call_args.kwargs
        assert called_kwargs["email_to"] == existing_user.email
        assert "reset_url" in called_kwargs
        # Verify-email helper must NOT fire on the duplicate arm.
        mock_send_verify.assert_not_called()

    @patch("app.routers.auth.send_register_already_registered")
    @patch("app.routers.auth.send_email_verification")
    async def test_fresh_email_does_not_send_already_registered(
        self,
        mock_send_verify,
        mock_send_already,
        client: AsyncClient,
    ) -> None:
        """A fresh-email register call must NOT call the
        already-registered helper. (We don't assert on
        send_email_verification here because that depends on the
        operator's verification setting.)"""
        r = await client.post(
            "/api/register",
            json={"email": "fresh-enum@example.com", "password": "x" * 12},
        )
        assert r.status_code == 201
        mock_send_already.assert_not_called()


class TestImplementationContract:
    """Static guards on the F-06-007 invariants."""

    def test_register_hashes_password_before_existence_check(self) -> None:
        """The bcrypt cycle must run BEFORE the SELECT on users.email so
        the duplicate and fresh arms spend the same wall-clock on the
        password hash. Pin the source ordering."""
        import inspect

        from app.routers.auth import register_user

        source = inspect.getsource(register_user)
        # We expect: get_password_hash(...) call BEFORE the existence query.
        hash_idx = source.find("get_password_hash(user_in.password)")
        select_idx = source.find("select(User).where(User.email")
        assert hash_idx > 0, (
            "register_user must hash the password (get_password_hash). "
            "Source:\n" + source[:1000]
        )
        assert select_idx > 0, (
            "register_user must SELECT on users.email. Source:\n" + source[:1000]
        )
        assert hash_idx < select_idx, (
            "register_user must call get_password_hash BEFORE the SELECT "
            "on users.email so duplicate/fresh arms have equal bcrypt "
            "cost (anti-timing). hash_idx=%d, select_idx=%d" % (hash_idx, select_idx)
        )

    def test_register_no_hardcoded_400_409_on_duplicate(self) -> None:
        """Pin that the prior 400 / 409 detail strings have been
        removed from the duplicate path. A future refactor can't
        re-introduce them without breaking this assertion."""
        import inspect

        from app.routers.auth import register_user

        source = inspect.getsource(register_user)
        assert "A user with this email already exists" not in source, (
            "register_user must not raise the prior 400 'already exists' "
            "detail (F-06-007). Source preview:\n" + source[:1500]
        )
        assert "A user with this email likely already exists" not in source, (
            "register_user must not raise the prior 409 'likely already "
            "exists' detail (F-06-007). Source preview:\n" + source[:1500]
        )
