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

from unittest.mock import AsyncMock, patch

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
        resp = await client.post("/api/study/no-such-study/unlock?password=anything")
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

        resp = await client.get(f"/api/study/{active_study.slug}?password=hunter2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == active_study.slug
        # Gate not entered → resolved-config branch emits False.
        assert data["requires_password"] is False


@pytest.mark.asyncio
class TestGetStudyPasswordShortCircuit:
    async def test_get_study_without_password_skips_bcrypt(
        self, client: AsyncClient, db, active_study: Study
    ):
        """No password in the request: locked metadata, no bcrypt call at all."""
        active_study.access_password = get_password_hash("pw")
        await db.commit()

        with patch(
            "app.routers.submissions.verify_password_async", new=AsyncMock()
        ) as mock_verify:
            resp = await client.get(f"/api/study/{active_study.slug}")

        assert resp.status_code == 200
        assert resp.json()["requires_password"] is True
        mock_verify.assert_not_called()


@pytest.mark.asyncio
class TestConsentRequiresStudyPassword:
    """POST /api/study/{slug}/consent creates the participant, so it checks the password."""

    @staticmethod
    def _body(study: Study, token: str, **extra) -> dict:
        return {
            "session_token": token,
            "study_slug": study.slug,
            "language_code": "en",
            "consent_hash": "h",
            **extra,
        }

    @staticmethod
    async def _participants(db, token: str) -> int:
        from sqlalchemy import func, select

        from app.models import Participant

        return (
            await db.execute(
                select(func.count())
                .select_from(Participant)
                .where(Participant.session_token == token)
            )
        ).scalar_one()

    async def _protect(self, db, study: Study) -> None:
        study.access_password = get_password_hash("hunter2")
        await db.commit()

    async def test_consent_without_password_is_refused(
        self, client: AsyncClient, db, active_study: Study
    ):
        import uuid

        await self._protect(db, active_study)
        token = str(uuid.uuid4())
        resp = await client.post(
            f"/api/study/{active_study.slug}/consent",
            json=self._body(active_study, token),
        )
        assert resp.status_code == 403
        assert await self._participants(db, token) == 0

    async def test_consent_with_wrong_password_is_refused(
        self, client: AsyncClient, db, active_study: Study
    ):
        import uuid

        await self._protect(db, active_study)
        token = str(uuid.uuid4())
        resp = await client.post(
            f"/api/study/{active_study.slug}/consent",
            json=self._body(active_study, token, password="wrong"),
        )
        assert resp.status_code == 403
        assert await self._participants(db, token) == 0

    async def test_consent_with_password_succeeds(
        self, client: AsyncClient, db, active_study: Study
    ):
        import uuid

        await self._protect(db, active_study)
        token = str(uuid.uuid4())
        resp = await client.post(
            f"/api/study/{active_study.slug}/consent",
            json=self._body(active_study, token, password="hunter2"),
        )
        assert resp.status_code == 200
        assert await self._participants(db, token) == 1

    async def test_consent_after_unconsented_submit_still_requires_password(
        self, client: AsyncClient, db, active_study: Study
    ):
        import uuid

        from sqlalchemy import select

        from app.models import Participant

        await self._protect(db, active_study)
        token = str(uuid.uuid4())
        resp = await client.post(
            "/api/submit",
            json={
                "session_token": token,
                "study_slug": active_study.slug,
                "language_used": "en",
                "status": "started",
                "presort_answers": {},
                "qsort": [],
                "postsort_answers": {},
            },
        )
        assert resp.status_code == 200
        resp = await client.post(
            f"/api/study/{active_study.slug}/consent",
            json=self._body(active_study, token),
        )
        assert resp.status_code == 403
        db.expire_all()
        participant = (
            await db.execute(
                select(Participant).where(Participant.session_token == token)
            )
        ).scalar_one()
        assert participant.consented_at is None

    async def test_reconsent_of_consented_session_needs_no_password(
        self, client: AsyncClient, db, active_study: Study
    ):
        import uuid

        await self._protect(db, active_study)
        token = str(uuid.uuid4())
        url = f"/api/study/{active_study.slug}/consent"
        first = await client.post(
            url, json=self._body(active_study, token, password="hunter2")
        )
        assert first.status_code == 200
        again = await client.post(url, json=self._body(active_study, token))
        assert again.status_code == 200

    async def test_completed_submit_without_consent_still_refused(
        self, client: AsyncClient, db, active_study: Study
    ):
        import uuid

        await self._protect(db, active_study)
        st = active_study.statements
        resp = await client.post(
            "/api/submit",
            json={
                "session_token": str(uuid.uuid4()),
                "study_slug": active_study.slug,
                "language_used": "en",
                "status": "completed",
                "presort_answers": {},
                "qsort": [
                    {"statement_id": st[0].id, "grid_score": -1, "col": 0, "row": 0},
                    {"statement_id": st[1].id, "grid_score": 0, "col": 1, "row": 0},
                    {"statement_id": st[2].id, "grid_score": 0, "col": 1, "row": 1},
                    {"statement_id": st[3].id, "grid_score": 1, "col": 2, "row": 0},
                ],
                "postsort_answers": {},
            },
        )
        assert 400 <= resp.status_code < 500
        assert "consent has not been recorded" in resp.text
