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

    @pytest.mark.parametrize("revision", [1, 2, None])
    async def test_withdraw_keeps_revision_so_old_saves_cannot_restore_draft(
        self, client, active_study, revision
    ):
        token = await self._create_participant(client, active_study)
        base = f"/api/study/{active_study.slug}"
        payload = {
            "session_token": token,
            "draft_responses": {"presort": {"q": "old"}},
            "draft_revision": 2,
        }
        assert (await client.put(f"{base}/save-draft", json=payload)).status_code == 200
        assert (
            await client.delete(f"{base}/draft", params={"session_token": token})
        ).status_code == 204
        payload["draft_revision"] = revision
        assert (await client.put(f"{base}/save-draft", json=payload)).status_code == 409
        resumed = (await client.get(f"{base}/resume/{token}")).json()
        assert resumed["draft_responses"] == {}
        assert resumed["draft_revision"] == 2

    async def test_legacy_resume_then_versioned_save_advances_watermark(
        self, client, active_study
    ):
        token = await self._create_participant(client, active_study)
        base = f"/api/study/{active_study.slug}"
        for answer in ["one", "two"]:
            response = await client.put(
                f"{base}/save-draft",
                json={
                    "session_token": token,
                    "draft_responses": {"presort": {"q": answer}},
                },
            )
            assert response.status_code == 200
        resumed = (await client.get(f"{base}/resume/{token}")).json()
        assert resumed["draft_revision"] is None
        assert resumed["draft_responses"]["presort"]["q"] == "two"
        for revision in [1, 9007199254740991]:
            assert (
                await client.put(
                    f"{base}/save-draft",
                    json={
                        "session_token": token,
                        "draft_responses": {"presort": {"q": str(revision)}},
                        "draft_revision": revision,
                    },
                )
            ).status_code == 200
            resumed = (await client.get(f"{base}/resume/{token}")).json()
            assert resumed["draft_revision"] == revision
            assert resumed["draft_responses"]["presort"]["q"] == str(revision)

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

    @pytest.mark.parametrize("older_revision", [1, 2, None])
    async def test_stale_delivery_cannot_replace_newer_draft(
        self, client: AsyncClient, active_study: Study, older_revision: int | None
    ):
        token = await self._create_participant(client, active_study)
        url = f"/api/study/{active_study.slug}/save-draft"
        newest = {
            "session_token": token,
            "draft_responses": {"presort": {"q1": "newest answer"}},
            "draft_revision": 2,
        }
        assert (await client.put(url, json=newest)).status_code == 200
        stale = {
            "session_token": token,
            "draft_responses": {"presort": {"q1": "older answer"}},
        }
        if older_revision is not None:
            stale["draft_revision"] = older_revision
        assert (await client.put(url, json=stale)).status_code == 409
        resumed = await client.get(f"/api/study/{active_study.slug}/resume/{token}")
        assert resumed.status_code == 200
        assert resumed.json()["draft_responses"]["presort"]["q1"] == "newest answer"
        assert resumed.json()["draft_revision"] == 2

    @pytest.mark.parametrize("revision", [-1, 0, 9007199254740992, 1.5, True])
    async def test_revision_requires_positive_safe_integer(
        self, client: AsyncClient, active_study: Study, revision: object
    ):
        token = await self._create_participant(client, active_study)
        response = await client.put(
            f"/api/study/{active_study.slug}/save-draft",
            json={
                "session_token": token,
                "draft_responses": {"presort": {}},
                "draft_revision": revision,
            },
        )
        assert response.status_code == 422

    async def test_equal_revision_retry_compares_normalized_draft(
        self, client, db, active_study
    ):
        active_study.rough_sort_enabled = False
        await db.commit()
        token = await self._create_participant(client, active_study)
        url = f"/api/study/{active_study.slug}/save-draft"
        payload = {
            "session_token": token,
            "draft_revision": 1,
            "draft_responses": {"presort": {"q": "saved"}},
        }
        assert (await client.put(url, json=payload)).status_code == 200
        payload["draft_responses"]["rough"] = {"agree": [1]}
        assert (await client.put(url, json=payload)).status_code == 200
        payload["draft_responses"]["presort"]["q"] = "conflicting edit"
        assert (await client.put(url, json=payload)).status_code == 409
        resumed = (
            await client.get(f"/api/study/{active_study.slug}/resume/{token}")
        ).json()
        assert resumed["draft_responses"] == {"presort": {"q": "saved"}}
        assert resumed["draft_revision"] == 1

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
