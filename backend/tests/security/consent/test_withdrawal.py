# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 4 Task 3 — Pre-submission withdrawal mechanism (F-05-001).

Pre-fix gap
-----------

The default consent text shipped in ``study_defaults.py:109`` promises:

    "Pre-submission: If you withdraw before finalizing your sort, no
     partial data will be retained."

The Wave 4 inventory (`05-consent-anonymisation.md` §2.2) confirmed that
the implementation contradicted this promise:

* No participant-side withdrawal endpoint existed. The only
  ``DELETE`` route accessible by ``session_token`` was
  ``/personal-data`` — a full GDPR Art. 17 erasure that nukes hashed
  IP / UA / answers / audio. Disproportionate for a "I want to start
  over" UX.
* Closing the browser left ``participants.draft_responses`` populated
  forever. The row stayed at ``status='started'`` with consent_hash,
  hashed IP, raw UA, and free-text draft data — until manual admin
  cleanup or study hard-delete.
* No retention sweep for abandoned sessions.

Post-fix invariants
-------------------

The new endpoint ``DELETE /api/study/{slug}/draft?session_token=…`` is
the participant-facing "withdraw draft" channel:

1. Clears ``participants.draft_responses`` to ``None`` for the matching
   row.
2. Resets ``last_step_reached`` to 1 so a subsequent resume goes back
   to the start of the Q-sort.
3. Preserves the row identity (consented_at, consent_hash, hashed IP,
   etc.) so the participant can resume if they change their mind. Full
   erasure remains the Art. 17 route.
4. Authenticated by ``session_token`` (same bearer model as resume,
   save-draft, audio upload).
5. Returns 404 for an unknown session_token (no enumeration oracle
   beyond what the existing routes already disclose).
6. Idempotent: repeated calls return 204.
7. No-op once the participant has submitted (``status=completed``):
   the consent-text promise applies pre-submission only.

Operator follow-up: an abandoned-draft sweeper (`scripts/cleanup_…`)
remains on the Wave 4b backlog so the consent-text promise does not
depend on the participant remembering to click "withdraw". This test
pins the explicit-action half of the fix.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, ParticipantStatus, Project, Study, StudyState


async def _seed_active_study(db: AsyncSession) -> Study:
    """Minimal active study with no statements (sufficient for the
    withdrawal endpoint, which never touches statement payload).
    """
    project = Project(
        title=f"P-{uuid4().hex[:6]}",
        slug=f"p-{uuid4().hex[:6]}",
    )
    db.add(project)
    await db.flush()
    study = Study(
        slug=f"withdraw-{uuid4().hex[:6]}",
        project_id=project.id,
        state=StudyState.active,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()
    return study


async def _seed_participant_with_draft(
    db: AsyncSession,
    study: Study,
    *,
    status: ParticipantStatus = ParticipantStatus.started,
) -> Participant:
    """Seed a participant in the given status with a populated draft."""
    p = Participant(
        study_id=study.id,
        session_token=uuid4(),
        language_used="en",
        status=status,
        consent_hash="abc123",
        consented_at=datetime.now(timezone.utc),
        ip_address="hashed-ip-placeholder",
        user_agent="Mozilla/5.0 (probe)",
        draft_responses={
            "presort": {"age": 42, "free_text_field": "I might be John Smith"},
            "rough": {"unsorted": [1, 2, 3], "agree": []},
            "fine": {},
        },
        last_step_reached=3,
        last_step_reached_at=datetime.now(timezone.utc),
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@pytest.mark.asyncio
class TestWithdrawDraft:
    """``DELETE /api/study/{slug}/draft`` — pre-submission withdrawal."""

    async def test_clears_draft_responses_for_matching_session(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Happy path: with a valid session_token, draft_responses is
        nulled and last_step_reached is reset to 1.
        """
        # Seed an active study + a participant who's mid-draft.
        study = await _seed_active_study(db)
        participant = await _seed_participant_with_draft(db, study)
        token = str(participant.session_token)

        # Pre-condition: draft is populated, last_step_reached advanced.
        assert participant.draft_responses is not None
        assert participant.last_step_reached == 3

        # Act.
        response = await client.delete(
            f"/api/study/{study.slug}/draft",
            params={"session_token": token},
        )

        # 204 No Content.
        assert response.status_code == 204, response.text

        # Re-fetch and confirm the row was rewritten in place.
        await db.refresh(participant)
        assert participant.draft_responses is None
        assert participant.last_step_reached == 1
        # Identity preserved — the row is still resumable.
        assert str(participant.session_token) == token
        assert participant.status == ParticipantStatus.started
        assert participant.consent_hash == "abc123"

    async def test_unknown_session_token_returns_404(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """An unknown session_token gets 404 (no draft side-effect)."""
        study = await _seed_active_study(db)
        # Seed an unrelated participant we should NOT touch.
        bystander = await _seed_participant_with_draft(db, study)
        bystander_draft = bystander.draft_responses

        # Act with a freshly-minted (unbound) token.
        response = await client.delete(
            f"/api/study/{study.slug}/draft",
            params={"session_token": str(uuid4())},
        )

        assert response.status_code == 404

        # Bystander's draft is intact.
        await db.refresh(bystander)
        assert bystander.draft_responses == bystander_draft

    async def test_wrong_study_slug_returns_404(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Session bound to study A cannot be withdrawn via study B's slug."""
        study_a = await _seed_active_study(db)
        study_b = await _seed_active_study(db)
        participant = await _seed_participant_with_draft(db, study_a)

        # Use study_b's slug with study_a's token.
        response = await client.delete(
            f"/api/study/{study_b.slug}/draft",
            params={"session_token": str(participant.session_token)},
        )

        assert response.status_code == 404

        # Draft on study_a's row is untouched.
        await db.refresh(participant)
        assert participant.draft_responses is not None

    async def test_completed_participant_is_noop(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """A submitted participant's row is not modified — the consent
        promise applies pre-submission only. This protects against an
        accidental post-submit click clearing research data.
        """
        study = await _seed_active_study(db)
        participant = await _seed_participant_with_draft(
            db, study, status=ParticipantStatus.completed
        )
        snapshot_draft = participant.draft_responses
        snapshot_step = participant.last_step_reached

        response = await client.delete(
            f"/api/study/{study.slug}/draft",
            params={"session_token": str(participant.session_token)},
        )

        assert response.status_code == 204
        await db.refresh(participant)
        assert participant.draft_responses == snapshot_draft
        assert participant.last_step_reached == snapshot_step
        assert participant.status == ParticipantStatus.completed

    async def test_idempotent(
        self, client: AsyncClient, db: AsyncSession
    ) -> None:
        """Repeated calls return 204; the row stays at draft=None."""
        study = await _seed_active_study(db)
        participant = await _seed_participant_with_draft(db, study)
        token = str(participant.session_token)

        # First call clears.
        first = await client.delete(
            f"/api/study/{study.slug}/draft",
            params={"session_token": token},
        )
        assert first.status_code == 204

        # Second call is a no-op (still 204; row state unchanged).
        second = await client.delete(
            f"/api/study/{study.slug}/draft",
            params={"session_token": token},
        )
        assert second.status_code == 204

        await db.refresh(participant)
        assert participant.draft_responses is None
        assert participant.last_step_reached == 1
