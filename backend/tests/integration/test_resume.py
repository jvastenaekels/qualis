"""Integration tests for the resume endpoint."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, ParticipantStatus, Study


@pytest.mark.asyncio
class TestResumeEndpoint:
    """Tests for GET /api/study/{slug}/resume/{code}."""

    async def _consent_participant(
        self, client: AsyncClient, study: Study, lang: str = "en"
    ) -> tuple[str, str]:
        """Helper: consent a participant and return (session_token, resume_code)."""
        token = str(uuid.uuid4())
        resp = await client.post(
            f"/api/study/{study.slug}/consent",
            json={
                "study_slug": study.slug,
                "session_token": token,
                "language_code": lang,
                "consent_hash": "abc123",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "resume_code" in data
        return token, data["resume_code"]

    async def test_resume_by_code(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """Resume with a valid code returns session data."""
        token, code = await self._consent_participant(client, active_study)

        # Advance progress so we have a non-trivial last_step_reached
        await client.patch(
            f"/api/study/{active_study.slug}/progress",
            json={"session_token": token, "step": 3},
        )

        resp = await client.get(f"/api/study/{active_study.slug}/resume/{code}")
        assert resp.status_code == 200

        data = resp.json()
        assert data["session_token"] == token
        assert data["language"] == "en"
        assert data["last_step_reached"] == 3
        assert data["resume_code"] == code
        assert isinstance(data["draft_responses"], dict)

    async def test_resume_by_legacy_uuid(
        self, client: AsyncClient, active_study: Study
    ):
        """Resume with a UUID (legacy path) also works."""
        token, _code = await self._consent_participant(client, active_study)

        resp = await client.get(f"/api/study/{active_study.slug}/resume/{token}")
        assert resp.status_code == 200
        assert resp.json()["session_token"] == token

    async def test_resume_case_insensitive(
        self, client: AsyncClient, active_study: Study
    ):
        """Resume codes are case-insensitive (auto-capitalized input still works)."""
        _token, code = await self._consent_participant(client, active_study)

        # Simulate mobile auto-capitalize: first letter uppercase
        upper_code = code[0].upper() + code[1:]
        resp = await client.get(
            f"/api/study/{active_study.slug}/resume/{upper_code}"
        )
        assert resp.status_code == 200

    async def test_resume_unknown_code_404(
        self, client: AsyncClient, active_study: Study
    ):
        """Unknown resume code returns 404."""
        resp = await client.get(
            f"/api/study/{active_study.slug}/resume/nonexistent-code-999"
        )
        assert resp.status_code == 404

    async def test_resume_completed_session_410(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ):
        """Completed session returns 410."""
        token, code = await self._consent_participant(client, active_study)

        # Mark participant as completed
        result = await db.execute(
            select(Participant).where(
                Participant.session_token == uuid.UUID(token)
            )
        )
        p = result.scalar_one()
        p.status = ParticipantStatus.completed
        await db.commit()

        resp = await client.get(f"/api/study/{active_study.slug}/resume/{code}")
        assert resp.status_code == 410

    async def test_resume_wrong_study_404(
        self,
        client: AsyncClient,
        db: AsyncSession,
        active_study: Study,
        user_factory,
        workspace_factory,
    ):
        """Resume code from study A does not work on study B."""
        _token, code = await self._consent_participant(client, active_study)

        # Create a different active study
        u = await user_factory()
        ws = await workspace_factory(owner=u)
        from app.models import StudyState, StudyTranslation

        other = Study(
            slug="other-study",
            workspace_id=ws.id,
            state=StudyState.active,
            grid_config=[],
            presort_config={},
            postsort_config={},
        )
        db.add(other)
        await db.flush()
        db.add(
            StudyTranslation(
                study_id=other.id,
                language_code="en",
                title="Other",
                description="D",
                consent_title="C",
                consent_description="L",
            )
        )
        await db.commit()

        resp = await client.get(f"/api/study/other-study/resume/{code}")
        assert resp.status_code == 404

    async def test_consent_returns_resume_code(
        self, client: AsyncClient, active_study: Study
    ):
        """Consent endpoint returns a resume_code in the response."""
        token = str(uuid.uuid4())
        resp = await client.post(
            f"/api/study/{active_study.slug}/consent",
            json={
                "study_slug": active_study.slug,
                "session_token": token,
                "language_code": "en",
                "consent_hash": "test",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "recorded"
        assert isinstance(data["resume_code"], str)
        assert len(data["resume_code"]) > 5

    async def test_reconsent_preserves_resume_code(
        self, client: AsyncClient, active_study: Study
    ):
        """Re-consenting with the same token preserves the existing resume code."""
        token = str(uuid.uuid4())
        payload = {
            "study_slug": active_study.slug,
            "session_token": token,
            "language_code": "en",
            "consent_hash": "v1",
        }

        resp1 = await client.post(
            f"/api/study/{active_study.slug}/consent", json=payload
        )
        code1 = resp1.json()["resume_code"]

        # Re-consent
        payload["consent_hash"] = "v2"
        resp2 = await client.post(
            f"/api/study/{active_study.slug}/consent", json=payload
        )
        code2 = resp2.json()["resume_code"]

        assert code1 == code2
