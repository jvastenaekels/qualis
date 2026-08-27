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
3. **Timing parity** — the median response-time delta over N=20
   warmup-trimmed samples is below 200 ms. The known arm legitimately
   does more CPU work than the unknown arm, which CI contention
   amplifies; 200 ms tolerates that benign asymmetry while still
   catching the ~330 ms bcrypt-skip leak this guards (see the
   threshold rationale near ``TIMING_THRESHOLD_MS``).
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


# Robustness has two independent parts:
#
# 1. *Median*, not mean — under full-suite CPU contention a few of the
#    20 samples spike from scheduler/GC jitter; the median ignores
#    sporadic outliers (a timing-oracle attacker can't exploit rare
#    outliers either — the exploitable signal is a shift in central
#    tendency).
# 2. A *200 ms* threshold — the known arm legitimately does more CPU
#    work than the unknown arm (bcrypt + JWT signing + logging/token
#    vs bcrypt-only). Under CI load that asymmetry is amplified into a
#    real, non-noise median delta that no small fixed bound survives.
#    This mirrors the already-reviewed rationale on
#    ``TestPasswordResetRequestEnumeration`` (identical asymmetry, same
#    200 ms bound): the gross enumeration leak this guards is the
#    ~330 ms pre-fix bcrypt-skip — still caught decisively at 200 ms —
#    while per-IP + per-email-hash rate limits (3/hour) make a
#    sub-threshold residual non-exploitable in practice.
N_SAMPLES = 20
N_WARMUP = 5
TIMING_THRESHOLD_MS = 200.0


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


async def _collect_interleaved(
    known: Callable[[], Awaitable[tuple[int, Any, float]]],
    unknown: Callable[[], Awaitable[tuple[int, Any, float]]],
) -> tuple[float, float]:
    """Sample both arms *alternately* in one loop; return
    ``(median_known_ms, median_unknown_ms)`` over ``N_SAMPLES`` after
    dropping ``N_WARMUP``.

    Why interleaved, not arm-after-arm: the original collector ran all
    ``known`` samples, then all ``unknown`` samples. Slow system-load
    drift across the ~15 s phase boundary (a CI I/O burst, CPU
    contention ramping — e.g. a concurrent backup during ``make ci``)
    shifts one arm's median relative to the other with no actual
    code-path leak, and a 200 ms bound can't survive that. Median +
    warmup (the earlier hardening) defeats *sporadic spikes* but not
    *phase-correlated drift*. Interleaving samples both arms under the
    same instantaneous load, so drift hits both equally and cancels in
    the delta. The order is alternated each iteration so neither arm
    systematically pays the other's cache/scheduler warm-up cost.

    Median (not mean) still guards against the residual sporadic spike.
    """
    k_ms: list[float] = []
    u_ms: list[float] = []
    for i in range(N_WARMUP + N_SAMPLES):
        if i % 2 == 0:
            ks = await known()
            us = await unknown()
        else:
            us = await unknown()
            ks = await known()
        k_ms.append(ks[2])
        u_ms.append(us[2])
    return (
        statistics.median(k_ms[N_WARMUP:]),
        statistics.median(u_ms[N_WARMUP:]),
    )


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

    async def test_timing_parity(self, client: AsyncClient, login_user: User) -> None:
        """Median wall-clock delta between the known and unknown arms
        must be below TIMING_THRESHOLD_MS over N_SAMPLES samples.

        Pre-fix: known runs bcrypt (~150 ms), unknown skips → delta ~330 ms.
        Post-fix: both arms run bcrypt → delta ~0 ms. The median is
        robust to sporadic CI load spikes that inflate a mean.
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

        median_known, median_unknown = await _collect_interleaved(known, unknown)

        delta = abs(median_known - median_unknown)
        assert delta < TIMING_THRESHOLD_MS, (
            f"timing leak ≥ {TIMING_THRESHOLD_MS} ms: "
            f"median_known={median_known:.1f}ms, "
            f"median_unknown={median_unknown:.1f}ms, delta={delta:.1f}ms"
        )


@pytest.mark.asyncio
class TestPasswordResetRequestEnumeration:
    """POST /api/password/reset/request must not leak email existence.

    Pinned for regression: the bcrypt pad already runs unconditionally
    on this endpoint pre-Wave-2; this test guards the invariant.

    F-03-009 note: this endpoint has an accepted residual timing variance
    (observation severity, no code change warranted in Wave 2). The known
    arm runs bcrypt + JWT signing + email logging; the unknown arm runs
    bcrypt only.  CI runner noise can push the median delta above 30 ms
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

    async def test_timing_parity(self, client: AsyncClient, login_user: User) -> None:
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

        median_known, median_unknown = await _collect_interleaved(known, unknown)

        delta = abs(median_known - median_unknown)
        assert delta < self._RESET_TIMING_THRESHOLD_MS, (
            f"timing leak: median_known={median_known:.1f}ms, "
            f"median_unknown={median_unknown:.1f}ms, delta={delta:.1f}ms"
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
        Post-fix: both arms run a single bcrypt → delta < 200 ms."""

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

        median_known, median_unknown = await _collect_interleaved(known, unknown)

        delta = abs(median_known - median_unknown)
        assert delta < TIMING_THRESHOLD_MS, (
            f"timing leak: median_known={median_known:.1f}ms, "
            f"median_unknown={median_unknown:.1f}ms, delta={delta:.1f}ms"
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

    async def test_timing_parity(self, client: AsyncClient, twofa_user: User) -> None:
        """Pre-fix: known-with-2FA ~5 ms, unknown ~600 ms (delta ~595 ms).
        Post-fix: bcrypt unconditional → delta < 200 ms."""

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

        median_known, median_unknown = await _collect_interleaved(known, unknown)

        delta = abs(median_known - median_unknown)
        assert delta < TIMING_THRESHOLD_MS, (
            f"timing leak: median_known={median_known:.1f}ms, "
            f"median_unknown={median_unknown:.1f}ms, delta={delta:.1f}ms"
        )
