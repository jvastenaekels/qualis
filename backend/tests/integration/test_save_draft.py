"""Integration tests for participant draft saving (PUT /save-draft)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, Study


@pytest.mark.asyncio
class TestSaveDraftEndpoint:
    """Tests for PUT /api/study/{slug}/save-draft."""

    async def _create_participant(
        self, client: AsyncClient, study: Study
    ) -> str:
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

    async def test_save_draft_persists_payload(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        token = await self._create_participant(client, active_study)

        resp = await client.put(
            f"/api/study/{active_study.slug}/save-draft",
            json={
                "session_token": token,
                "draft_responses": {"presort": {"q1": "a"}},
            },
        )
        assert resp.status_code == 200

        result = await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
        p = result.scalar_one()
        assert p.draft_responses == {"presort": {"q1": "a"}}

    async def test_rough_key_dropped_when_rough_disabled(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """A draft with a stale `rough` slice is silently dropped when
        the study has rough_sort_enabled=False (defensive against
        legacy clients).
        """
        active_study.rough_sort_enabled = False
        await db.commit()

        token = await self._create_participant(client, active_study)

        resp = await client.put(
            f"/api/study/{active_study.slug}/save-draft",
            json={
                "session_token": token,
                "draft_responses": {
                    "presort": {"q1": "a"},
                    "rough": {"agree": [1], "neutral": [], "disagree": []},
                },
            },
        )
        assert resp.status_code == 200

        result = await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
        p = result.scalar_one()
        assert "rough" not in p.draft_responses
        assert p.draft_responses["presort"] == {"q1": "a"}

    async def test_rough_key_preserved_when_rough_enabled(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """A draft with a `rough` slice is preserved when the study
        has rough_sort_enabled=True (default behaviour).
        """
        # active_study defaults to rough_sort_enabled=True (server_default)
        token = await self._create_participant(client, active_study)

        resp = await client.put(
            f"/api/study/{active_study.slug}/save-draft",
            json={
                "session_token": token,
                "draft_responses": {
                    "presort": {"q1": "a"},
                    "rough": {"agree": [1], "neutral": [], "disagree": []},
                },
            },
        )
        assert resp.status_code == 200

        result = await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
        p = result.scalar_one()
        assert p.draft_responses["rough"] == {
            "agree": [1],
            "neutral": [],
            "disagree": [],
        }
