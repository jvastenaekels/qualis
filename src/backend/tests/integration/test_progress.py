"""Integration tests for participant step progress tracking."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, Study


@pytest.mark.asyncio
class TestProgressEndpoint:
    """Tests for PATCH /api/study/{slug}/progress."""

    async def _create_participant(self, client: AsyncClient, study: Study) -> str:
        """Helper: consent a participant and return the session token."""
        token = str(uuid.uuid4())
        resp = await client.post(
            f"/api/study/{study.slug}/consent",
            json={
                "study_slug": study.slug,
                "session_token": token,
                "language_code": "en",
                "consent_hash": "abc123",
            },
        )
        assert resp.status_code == 200
        return token

    async def test_advance_step(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """Step advances forward correctly."""
        token = await self._create_participant(client, active_study)

        # Verify initial state is step 1
        result = await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
        p = result.scalar_one()
        assert p.last_step_reached == 1
        assert p.last_step_reached_at is not None

        # Advance to step 3
        resp = await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": token, "step": 3},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        await db.refresh(p)
        assert p.last_step_reached == 3
        assert p.last_step_reached_at is not None

    async def test_no_regress(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """Step never goes backward."""
        token = await self._create_participant(client, active_study)

        # Advance to step 4
        await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": token, "step": 4},
        )

        result = await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
        p = result.scalar_one()
        assert p.last_step_reached == 4
        timestamp_at_step_4 = p.last_step_reached_at

        # Try to go back to step 2 — should be ignored
        resp = await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": token, "step": 2},
        )
        assert resp.status_code == 200

        await db.refresh(p)
        assert p.last_step_reached == 4  # unchanged
        assert p.last_step_reached_at == timestamp_at_step_4  # timestamp unchanged too

    async def test_unknown_token_404(self, client: AsyncClient, active_study: Study):
        """Unknown session token returns 404."""
        resp = await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": str(uuid.uuid4()), "step": 3},
        )
        assert resp.status_code == 404

    async def test_invalid_step_rejected(
        self, client: AsyncClient, active_study: Study
    ):
        """Step values outside 1-5 are rejected by validation."""
        token = str(uuid.uuid4())
        resp = await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": token, "step": 0},
        )
        assert resp.status_code == 422  # Pydantic validation error

        resp = await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": token, "step": 6},
        )
        assert resp.status_code == 422

    async def test_step_3_rejected_when_rough_disabled(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """A study with rough_sort_enabled=False rejects /progress targeting step 3."""
        active_study.rough_sort_enabled = False
        await db.commit()

        token = await self._create_participant(client, active_study)

        resp = await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": token, "step": 3},
        )
        assert resp.status_code == 400
        body = resp.json()
        assert "step 3" in body["message"].lower()

        result = await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
        p = result.scalar_one()
        assert p.last_step_reached == 1  # unchanged

    async def test_step_4_allowed_when_rough_disabled(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """Step 4 (fine sort) is reachable directly when rough is disabled."""
        active_study.rough_sort_enabled = False
        await db.commit()

        token = await self._create_participant(client, active_study)

        resp = await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": token, "step": 4},
        )
        assert resp.status_code == 200

        result = await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
        p = result.scalar_one()
        assert p.last_step_reached == 4

    async def test_completion_sets_step_5(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """Completing a submission sets last_step_reached to 5."""
        statements = active_study.statements
        token = str(uuid.uuid4())

        # Record consent first
        consent_resp = await client.post(
            f"/api/study/{active_study.slug}/consent",
            json={
                "session_token": token,
                "study_slug": active_study.slug,
                "language_code": "en",
                "consent_hash": "test-hash",
            },
        )
        assert consent_resp.status_code == 200

        qsort = [
            {"statement_id": statements[0].id, "grid_score": -1},
            {"statement_id": statements[1].id, "grid_score": 0},
            {"statement_id": statements[2].id, "grid_score": 0},
            {"statement_id": statements[3].id, "grid_score": 1},
        ]

        payload = {
            "session_token": token,
            "study_slug": active_study.slug,
            "language_used": "en",
            "status": "completed",
            "presort_answers": {},
            "qsort": qsort,
            "postsort_answers": {},
        }

        resp = await client.post("/api/submit", json=payload)
        assert resp.status_code == 200

        result = await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
        p = result.scalar_one()
        assert p.last_step_reached == 5
        assert p.last_step_reached_at is not None
