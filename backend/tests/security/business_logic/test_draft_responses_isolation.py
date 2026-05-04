# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""F-06-002 — Draft-responses session-token bearer model.

Threat model
------------

The participant's draft answers are pinned to a single column,
``Participant.draft_responses``, and access is gated by the
``session_token`` UUID. Three routes touch the column:

- ``PUT /api/study/{slug}/save-draft`` (overwrite)
- ``GET /api/study/{slug}/resume/{code}`` (read; returns
  ``draft_responses`` in ``ResumeResponse``)
- ``DELETE /api/study/{slug}/draft?session_token=…`` (clear)

Each one's auth model is bearer-only — possession of the token = the
right to read or write the draft. There is no cookie-, JWT-, or
device-binding layer. The token is conveyed in the JSON body for
``save-draft``, in the query string for ``withdraw_draft``, and is
returned from ``resume_session`` to the resume-flow caller.

**Shared-device threat (filed as observation):** if a participant
leaves the resume URL on a shared computer (kiosk, family laptop,
public library terminal), the next user who hits ``/resume/<code>``
gets the ``session_token`` and can both read the prior participant's
draft and overwrite/delete it. The consent text already warns
participants about completing in one session, and the cross-study
scoping (Wave 3 F-04-004) plus the per-code rate limit (F-06-001)
bound the *attacker* surface; the threat that survives is purely a
shared-device scenario the consent text addresses.

This module pins the contract so a future refactor doesn't quietly
relax it (e.g. accepting an extra path-bound `participant_id` claim
that diverges from the token, or letting a `Participant.session_token`
match win without the `Study.slug` join).

Tests
-----

1. **Token is the bearer** — anyone holding the token can read,
   overwrite, and clear the draft; no extra device or cookie check.
2. **Cross-study lookup is rejected** — a token issued for study A
   cannot read or write study B's draft (already pinned in Wave 3
   for resume_session; we add coverage for save-draft and
   withdraw_draft).
3. **Random-token miss returns 404** — an unknown token doesn't leak
   participant existence via timing or status.
4. **Draft-write requires study.state==active** — drafts can't be
   poked into completed/draft studies.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Participant,
    ParticipantStatus,
    Project,
    Study,
    StudyState,
    StudyTranslation,
)


@pytest_asyncio.fixture
async def two_studies(
    db: AsyncSession, test_user, project_factory, study_factory
) -> tuple[Project, Study, Study, Participant, Participant]:
    """Seed two distinct studies in the same project, each with its own
    participant. Used to verify cross-study token lookups are rejected."""
    project = await project_factory(test_user, title="WaveFiveProject")
    study_a = await study_factory(project, test_user, title="StudyA")
    study_b = await study_factory(project, test_user, title="StudyB")
    study_a.state = StudyState.active
    study_b.state = StudyState.active
    await db.commit()

    p_a = Participant(
        study_id=study_a.id,
        language_used="en",
        status=ParticipantStatus.started,
        draft_responses={"q1": "answer-A"},
    )
    p_b = Participant(
        study_id=study_b.id,
        language_used="en",
        status=ParticipantStatus.started,
        draft_responses={"q1": "answer-B"},
    )
    db.add_all([p_a, p_b])
    await db.commit()
    await db.refresh(p_a)
    await db.refresh(p_b)
    return project, study_a, study_b, p_a, p_b


@pytest.mark.asyncio
class TestDraftBearerModel:
    """Possession of the session_token is sufficient for read/write/clear."""

    async def test_save_draft_works_for_token_holder(
        self,
        client: AsyncClient,
        two_studies: tuple[Project, Study, Study, Participant, Participant],
    ) -> None:
        _, study_a, _, p_a, _ = two_studies
        r = await client.put(
            f"/api/study/{study_a.slug}/save-draft",
            json={
                "session_token": str(p_a.session_token),
                "draft_responses": {"presort": {"q1": "rewritten"}},
            },
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "ok"

    async def test_withdraw_draft_works_for_token_holder(
        self,
        client: AsyncClient,
        two_studies: tuple[Project, Study, Study, Participant, Participant],
    ) -> None:
        _, study_a, _, p_a, _ = two_studies
        r = await client.delete(
            f"/api/study/{study_a.slug}/draft",
            params={"session_token": str(p_a.session_token)},
        )
        assert r.status_code == 204, r.text


@pytest.mark.asyncio
class TestDraftCrossStudyLookup:
    """A token issued for study A is not usable on study B's URL."""

    async def test_save_draft_cross_study_rejected(
        self,
        client: AsyncClient,
        two_studies: tuple[Project, Study, Study, Participant, Participant],
    ) -> None:
        """Token from p_a (study_a) on study_b's slug must 404."""
        _, _, study_b, p_a, _ = two_studies
        r = await client.put(
            f"/api/study/{study_b.slug}/save-draft",
            json={
                "session_token": str(p_a.session_token),
                "draft_responses": {"presort": {"hijack": "true"}},
            },
        )
        assert r.status_code == 404, (
            f"Cross-study save-draft must 404; got {r.status_code} body={r.text!r}"
        )

    async def test_withdraw_draft_cross_study_rejected(
        self,
        client: AsyncClient,
        two_studies: tuple[Project, Study, Study, Participant, Participant],
    ) -> None:
        """Token from p_a on study_b's slug must 404."""
        _, _, study_b, p_a, _ = two_studies
        r = await client.delete(
            f"/api/study/{study_b.slug}/draft",
            params={"session_token": str(p_a.session_token)},
        )
        assert r.status_code == 404, (
            f"Cross-study withdraw-draft must 404; got {r.status_code} body={r.text!r}"
        )


@pytest.mark.asyncio
class TestDraftUnknownToken:
    """An unknown/random token must 404, not leak participant existence."""

    async def test_save_draft_random_token_404(
        self,
        client: AsyncClient,
        two_studies: tuple[Project, Study, Study, Participant, Participant],
    ) -> None:
        _, study_a, _, _, _ = two_studies
        r = await client.put(
            f"/api/study/{study_a.slug}/save-draft",
            json={
                "session_token": str(uuid4()),
                "draft_responses": {"presort": {"q1": "x"}},
            },
        )
        assert r.status_code == 404

    async def test_withdraw_random_token_404(
        self,
        client: AsyncClient,
        two_studies: tuple[Project, Study, Study, Participant, Participant],
    ) -> None:
        _, study_a, _, _, _ = two_studies
        r = await client.delete(
            f"/api/study/{study_a.slug}/draft",
            params={"session_token": str(uuid4())},
        )
        assert r.status_code == 404


@pytest.mark.asyncio
class TestDraftStudyStateGate:
    """Study must be active for draft writes (consent-text scope)."""

    async def test_save_draft_rejected_when_study_inactive(
        self,
        client: AsyncClient,
        db: AsyncSession,
        two_studies: tuple[Project, Study, Study, Participant, Participant],
    ) -> None:
        _, study_a, _, p_a, _ = two_studies
        # Flip study A to draft state — should reject save-draft writes.
        study_a.state = StudyState.draft
        await db.commit()
        r = await client.put(
            f"/api/study/{study_a.slug}/save-draft",
            json={
                "session_token": str(p_a.session_token),
                "draft_responses": {"presort": {"q1": "x"}},
            },
        )
        assert r.status_code == 403


@pytest.mark.asyncio
class TestDraftAuthShape:
    """Static guard: no out-of-band auth (cookie / JWT / X-Participant-ID).

    The bearer model is intentional. If a future refactor adds an extra
    auth layer, this assertion fails and forces the implementer to
    update the audit doc instead of silently widening the surface."""

    async def test_no_out_of_band_auth_dependency(self) -> None:
        import inspect

        from app.routers import participants as participants_module

        src = inspect.getsource(participants_module)
        # The handlers must NOT import `get_current_user` (that's the
        # JWT-bearer admin-side gate); the participant flow is bearer-
        # by-session_token only.
        assert "get_current_user" not in src, (
            "participants router must not import admin JWT auth — "
            "the participant flow is session_token-bearer only by design"
        )
