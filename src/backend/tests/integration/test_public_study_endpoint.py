"""Integration tests for the public study endpoints' password-gate paths.

Covers:
- POST /api/study/{slug}/unlock — `unlock_study` (annotated with AckResponse in T2.2 of api-cleanup; previously had zero coverage).
- GET /api/study/{slug} — the password-gate branch (`requires_password=True` early return) flagged by reviewer of T5; the resolved-config branch is exercised transitively elsewhere but the gate path was untested.

The `unlock_study` endpoint is the only consumer of `AckResponse` whose
behaviour materially depends on the password being set on the study. Test
all four observable outcomes: no-password study, correct password, wrong
password, unknown slug. The password-gate tests verify the response shape
(`requires_password` boolean) without asserting on the full resolved-config
extras, which `extra='allow'` would absorb anyway.
"""

import pytest
from httpx import AsyncClient

from app.models import Study
from app.utils.security import get_password_hash


@pytest.mark.asyncio
class TestUnlockStudyEndpoint:
    """POST /api/study/{slug}/unlock — validate study access password."""

    async def test_unlock_no_password_returns_unlocked(
        self, client: AsyncClient, active_study: Study
    ):
        """A study with no access_password set unlocks unconditionally."""
        resp = await client.post(
            f"/api/study/{active_study.slug}/unlock?password=anything"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "unlocked"
        assert data["details"] == "No password required"

    async def test_unlock_correct_password(
        self, client: AsyncClient, db, active_study: Study
    ):
        """Correct password returns status='unlocked' (no details)."""
        active_study.access_password = get_password_hash("hunter2")
        await db.commit()

        resp = await client.post(
            f"/api/study/{active_study.slug}/unlock?password=hunter2"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "unlocked"
        # AckResponse omits details when not set; presence is fine but
        # the previous wire shape did not include it on this branch.
        assert data.get("details") is None

    async def test_unlock_wrong_password_403(
        self, client: AsyncClient, db, active_study: Study
    ):
        """Wrong password returns 403."""
        active_study.access_password = get_password_hash("hunter2")
        await db.commit()

        resp = await client.post(
            f"/api/study/{active_study.slug}/unlock?password=wrong"
        )
        assert resp.status_code == 403

    async def test_unlock_unknown_slug_404(self, client: AsyncClient):
        """Unknown study slug returns 404."""
        resp = await client.post(
            "/api/study/no-such-study/unlock?password=anything"
        )
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestStudyConfigPasswordGate:
    """GET /api/study/{slug} — password-gate early-return path."""

    async def test_no_password_returns_full_config(
        self, client: AsyncClient, active_study: Study
    ):
        """Unprotected study returns the resolved config without a password param.

        Smoke check on the non-gated branch: the response carries the
        well-known top-level fields and `requires_password` is False
        (the resolved config emits the key with a False value).
        """
        resp = await client.get(f"/api/study/{active_study.slug}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == active_study.slug
        assert "title" in data
        # The resolved-config branch emits requires_password=False for
        # studies that have no access_password; the gate branch emits True.
        # Either way the key is present — what matters is the value.
        assert data["requires_password"] is False

    async def test_password_protected_no_password_param_returns_metadata(
        self, client: AsyncClient, db, active_study: Study
    ):
        """Password-protected study with no password param returns the basic
        metadata + requires_password=True (the gate path).
        """
        active_study.access_password = get_password_hash("hunter2")
        await db.commit()

        resp = await client.get(f"/api/study/{active_study.slug}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == active_study.slug
        assert data["requires_password"] is True

    async def test_password_protected_wrong_password_returns_metadata(
        self, client: AsyncClient, db, active_study: Study
    ):
        """Wrong password also returns metadata + requires_password=True
        (no 403 — the endpoint deliberately gates without revealing whether
        the password attempt was even validated).
        """
        active_study.access_password = get_password_hash("hunter2")
        await db.commit()

        resp = await client.get(f"/api/study/{active_study.slug}?password=wrong")
        assert resp.status_code == 200
        data = resp.json()
        assert data["requires_password"] is True

    async def test_password_protected_correct_password_returns_full_config(
        self, client: AsyncClient, db, active_study: Study
    ):
        """Correct password returns the full resolved config (gate skipped)."""
        active_study.access_password = get_password_hash("hunter2")
        await db.commit()

        resp = await client.get(
            f"/api/study/{active_study.slug}?password=hunter2"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == active_study.slug
        # Gate not entered → resolved-config branch emits False.
        assert data["requires_password"] is False
