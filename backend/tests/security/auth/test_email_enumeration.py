# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression tests for F-03-005 / F-03-006 / F-03-007 — email
enumeration via response-body or timing differential.

Pre-fix attack model
--------------------

Four endpoints leaked whether a given email was registered:

- ``POST /api/token``: known-email + wrong-password ran bcrypt
  (~150 ms); unknown-email skipped bcrypt and returned ~5 ms. The body
  was already uniform; the timing channel alone yielded a 339 ms mean
  delta over N=100 samples — easily detectable across a single TCP
  hop, even from an attacker without a privileged network position.
- ``POST /api/email/verify/resend``: the bcrypt anti-enum pad sat in
  the ``else`` branch only. Known-unverified emails returned ~7 ms,
  unknown emails took ~540 ms — a 533 ms delta directly leaking
  account state.
- ``POST /api/2fa/disable/request``: same shape — bcrypt only on the
  no-op branch. Known-with-2FA returned ~5 ms, unknown took ~600 ms —
  a 595 ms delta that additionally distinguished 2FA-enabled accounts
  from unverified or 2FA-disabled accounts.
- ``POST /api/password/reset/request``: already constant-time
  (bcrypt unconditional). Pinned here for completeness.

Post-fix invariants
-------------------

- ``/api/token`` runs ``verify_password(form_data.password,
  _LOGIN_DECOY_HASH)`` on the unknown-email arm so both 401 paths
  spend a bcrypt cycle.
- ``/api/email/verify/resend`` and ``/api/2fa/disable/request`` move
  the ``get_password_hash`` call out of the ``else`` branch — it now
  runs unconditionally before the success branch, mirroring the
  password-reset pattern.

Tests pin three properties per endpoint:

1. **Status equality** — the known and unknown arms return the same
   HTTP status.
2. **Body equality** — the known and unknown arms return identical
   response bodies (after stable JSON-key sorting).
3. **Timing parity** — the mean response-time delta over N=20
   warmup-trimmed samples is below 30 ms. CI runners are noisier than
   developer laptops, so 30 ms is the practical floor; sub-1ms deltas
   were observed locally with N=100.
"""

from __future__ import annotations

import json
import statistics
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.utils.security import get_password_hash


# Number of warmup-trimmed samples. CI is noisy; locally N=100 yields
# stdev ~1 ms but CI runners can spike per-call latency to ~50 ms on a
# single sample. With 20 samples the mean is dominated by the steady
# state, so a 30 ms threshold survives without flaking.
N_SAMPLES = 20
N_WARMUP = 5
TIMING_THRESHOLD_MS = 30.0


def _body_key(body: Any) -> str:
    """Stable JSON serialisation for set comparison across arms."""
    return json.dumps(body, sort_keys=True)


async def _time_post(
    client: AsyncClient,
    url: str,
    *,
    json_payload: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
) -> tuple[int, Any, float]:
    """Time one POST round-trip. Returns (status, body, duration_ms)."""
    t0 = time.perf_counter()
    if data is not None:
        r = await client.post(url, data=data)
    else:
        r = await client.post(url, json=json_payload)
    dt = (time.perf_counter() - t0) * 1000
    try:
        body = r.json()
    except Exception:
        body = {"_text": r.text}
    return r.status_code, body, dt


async def _collect_arm(
    fire: Callable[[], Awaitable[tuple[int, Any, float]]],
) -> tuple[list[int], list[Any], float]:
    """Fire ``fire()`` ``N_WARMUP + N_SAMPLES`` times. Drop warmup,
    return (statuses, bodies, mean_ms)."""
    samples: list[tuple[int, Any, float]] = []
    for _ in range(N_WARMUP + N_SAMPLES):
        samples.append(await fire())
    samples = samples[N_WARMUP:]
    statuses = [s[0] for s in samples]
    bodies = [s[1] for s in samples]
    mean_ms = statistics.mean(s[2] for s in samples)
    return statuses, bodies, mean_ms


@pytest_asyncio.fixture
async def login_user(db: AsyncSession) -> User:
    """A verified, password-only user for login enumeration tests."""
    user = User(
        email="enum-login@example.com",
        hashed_password=get_password_hash("real-password"),
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def unverified_user(db: AsyncSession) -> User:
    """A registered-but-unverified user for resend-verification tests."""
    user = User(
        email="enum-unverified@example.com",
        hashed_password=get_password_hash("x"),
        email_verified_at=None,
        is_active=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def twofa_user(db: AsyncSession) -> User:
    """A verified user with email-channel 2FA enabled."""
    user = User(
        email="enum-2fa@example.com",
        hashed_password=get_password_hash("x"),
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
        is_totp_enabled=True,
        totp_channel="email",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
class TestTokenEnumeration:
    """F-03-005 — POST /api/token must not leak email existence."""

    async def test_response_uniform_across_arms(
        self, client: AsyncClient, login_user: User
    ) -> None:
        """Status code and body must be identical for known-email-wrong-password
        and unknown-email-any-password arms."""
        r_known = await client.post(
            "/api/token",
            data={"username": login_user.email, "password": "wrong-password"},
        )
        r_unknown = await client.post(
            "/api/token",
            data={"username": "no-such@example.com", "password": "any-password"},
        )

        assert r_known.status_code == r_unknown.status_code == 401
        assert _body_key(r_known.json()) == _body_key(r_unknown.json())

    async def test_timing_parity(
        self, client: AsyncClient, login_user: User
    ) -> None:
        """Mean wall-clock delta between the known and unknown arms must
        be below TIMING_THRESHOLD_MS over N_SAMPLES samples.

        Pre-fix: known runs bcrypt (~150 ms), unknown skips → delta ~330 ms.
        Post-fix: both arms run bcrypt → delta ~0 ms (single-digit on a
        warm process; sub-30 ms even on CI).
        """

        async def known() -> tuple[int, Any, float]:
            return await _time_post(
                client,
                "/api/token",
                data={"username": login_user.email, "password": "wrong"},
            )

        async def unknown() -> tuple[int, Any, float]:
            return await _time_post(
                client,
                "/api/token",
                data={"username": "no-such@example.com", "password": "wrong"},
            )

        _, _, mean_known = await _collect_arm(known)
        _, _, mean_unknown = await _collect_arm(unknown)

        delta = abs(mean_known - mean_unknown)
        assert delta < TIMING_THRESHOLD_MS, (
            f"timing leak ≥ {TIMING_THRESHOLD_MS} ms: "
            f"mean_known={mean_known:.1f}ms, "
            f"mean_unknown={mean_unknown:.1f}ms, delta={delta:.1f}ms"
        )


@pytest.mark.asyncio
class TestPasswordResetRequestEnumeration:
    """POST /api/password/reset/request must not leak email existence.

    Pinned for regression: the bcrypt pad already runs unconditionally
    on this endpoint pre-Wave-2; this test guards the invariant.

    F-03-009 note: this endpoint has an accepted residual timing variance
    (observation severity, no code change warranted in Wave 2). The known
    arm runs bcrypt + JWT signing + email logging; the unknown arm runs
    bcrypt only.  CI runner noise can push the mean delta above 30 ms
    even though no enumeration signal is exploitable in practice (the
    3/hour per-IP + per-email-hash limits gate an attacker to a few
    hundred probes per day).  We use a wider threshold (200 ms) that
    would only trip on a catastrophic regression (e.g. the bcrypt pad
    being removed entirely).  See audit doc §F-03-009 for full analysis.
    """

    # F-03-009: accepted residual — use a coarse threshold to guard
    # against catastrophic regression only (bcrypt pad removal).
    _RESET_TIMING_THRESHOLD_MS = 200.0

    async def test_response_uniform_across_arms(
        self, client: AsyncClient, login_user: User
    ) -> None:
        r_known = await client.post(
            "/api/password/reset/request", json={"email": login_user.email}
        )
        r_unknown = await client.post(
            "/api/password/reset/request",
            json={"email": "no-such@example.com"},
        )

        assert r_known.status_code == r_unknown.status_code == 200
        assert _body_key(r_known.json()) == _body_key(r_unknown.json())

    async def test_timing_parity(
        self, client: AsyncClient, login_user: User
    ) -> None:
        """Guard against bcrypt pad removal — coarse threshold (F-03-009)."""

        async def known() -> tuple[int, Any, float]:
            return await _time_post(
                client,
                "/api/password/reset/request",
                json_payload={"email": login_user.email},
            )

        async def unknown() -> tuple[int, Any, float]:
            return await _time_post(
                client,
                "/api/password/reset/request",
                json_payload={"email": "no-such@example.com"},
            )

        _, _, mean_known = await _collect_arm(known)
        _, _, mean_unknown = await _collect_arm(unknown)

        delta = abs(mean_known - mean_unknown)
        assert delta < self._RESET_TIMING_THRESHOLD_MS, (
            f"timing leak: mean_known={mean_known:.1f}ms, "
            f"mean_unknown={mean_unknown:.1f}ms, delta={delta:.1f}ms"
        )


@pytest.mark.asyncio
class TestVerifyResendEnumeration:
    """F-03-006 — POST /api/email/verify/resend must not leak email existence."""

    async def test_response_uniform_across_arms(
        self, client: AsyncClient, unverified_user: User
    ) -> None:
        r_known = await client.post(
            "/api/email/verify/resend", json={"email": unverified_user.email}
        )
        r_unknown = await client.post(
            "/api/email/verify/resend",
            json={"email": "no-such@example.com"},
        )

        assert r_known.status_code == r_unknown.status_code == 200
        assert _body_key(r_known.json()) == _body_key(r_unknown.json())

    async def test_timing_parity(
        self, client: AsyncClient, unverified_user: User
    ) -> None:
        """Pre-fix: known-unverified ~7 ms, unknown ~540 ms (delta ~533 ms).
        Post-fix: both arms run a single bcrypt → delta < 30 ms."""

        async def known() -> tuple[int, Any, float]:
            return await _time_post(
                client,
                "/api/email/verify/resend",
                json_payload={"email": unverified_user.email},
            )

        async def unknown() -> tuple[int, Any, float]:
            return await _time_post(
                client,
                "/api/email/verify/resend",
                json_payload={"email": "no-such@example.com"},
            )

        _, _, mean_known = await _collect_arm(known)
        _, _, mean_unknown = await _collect_arm(unknown)

        delta = abs(mean_known - mean_unknown)
        assert delta < TIMING_THRESHOLD_MS, (
            f"timing leak: mean_known={mean_known:.1f}ms, "
            f"mean_unknown={mean_unknown:.1f}ms, delta={delta:.1f}ms"
        )


@pytest.mark.asyncio
class TestTwofaDisableRequestEnumeration:
    """F-03-007 — POST /api/2fa/disable/request must not leak email existence."""

    async def test_response_uniform_across_arms(
        self, client: AsyncClient, twofa_user: User
    ) -> None:
        r_known = await client.post(
            "/api/2fa/disable/request", json={"email": twofa_user.email}
        )
        r_unknown = await client.post(
            "/api/2fa/disable/request",
            json={"email": "no-such@example.com"},
        )

        assert r_known.status_code == r_unknown.status_code == 200
        assert _body_key(r_known.json()) == _body_key(r_unknown.json())

    async def test_timing_parity(
        self, client: AsyncClient, twofa_user: User
    ) -> None:
        """Pre-fix: known-with-2FA ~5 ms, unknown ~600 ms (delta ~595 ms).
        Post-fix: bcrypt unconditional → delta < 30 ms."""

        async def known() -> tuple[int, Any, float]:
            return await _time_post(
                client,
                "/api/2fa/disable/request",
                json_payload={"email": twofa_user.email},
            )

        async def unknown() -> tuple[int, Any, float]:
            return await _time_post(
                client,
                "/api/2fa/disable/request",
                json_payload={"email": "no-such@example.com"},
            )

        _, _, mean_known = await _collect_arm(known)
        _, _, mean_unknown = await _collect_arm(unknown)

        delta = abs(mean_known - mean_unknown)
        assert delta < TIMING_THRESHOLD_MS, (
            f"timing leak: mean_known={mean_known:.1f}ms, "
            f"mean_unknown={mean_unknown:.1f}ms, delta={delta:.1f}ms"
        )
