# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""F-06-006 — Submission idempotency and ownership-claim integrity.

Threat model
------------

``POST /api/submit`` is the most security-load-bearing participant
endpoint: it writes the Q-sort entries that become research data, the
participant's PII (presort/postsort answers, hashed IP, hashed UA),
and the consent/recruitment-link bindings. Three abuse vectors must
be closed:

1. **Double-submit replay** — a participant clicking "Submit" twice
   (or a malicious replay) must not produce two distinct
   ``participant`` rows or two parallel sets of ``qsort_entries``.
2. **Submit-on-behalf** — a session_token issued for study A must
   not be usable to submit a sort to study B (cross-study tamper).
3. **Already-completed short-circuit** — re-submitting a completed
   participant must return the existing confirmation code without
   touching the prior data.

Post-fix invariants (already in place at audit time)
----------------------------------------------------

- ``Participant.session_token`` carries ``unique=True``
  (`backend/app/models/participant.py:44`); a double-insert raises
  IntegrityError and is caught at
  ``submission_service.py:383-393`` (rollback + re-fetch).
- ``_find_or_create_participant`` runs ``SELECT … FOR UPDATE`` on the
  session_token (line 333-337), so concurrent submissions serialize.
- ``_find_or_create_participant`` checks
  ``participant.study_id != study.id`` (line 341-342) and raises
  ``ValidationError`` — submit-on-behalf with a token from another
  study is rejected.
- ``_update_existing_participant`` returns the
  ``already_submitted=True`` short-circuit at line 425-431 when the
  participant is already in ``ParticipantStatus.completed``.

Note on prior-finding cite: the Wave 5 plan referenced "F-04-003
pinned ownership for submissions" — F-04-003 actually pinned the
**audio** session_token-bound ownership. The submission shape uses
the same session_token-only bearer model under a different prior
ID; this finding makes that explicit.

Tests pin all three invariants.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, QSortEntry, Statement, Study, StudyState


@pytest.mark.asyncio
class TestDoubleSubmitIdempotent:
    """A double-submit on the same session_token must be a no-op."""

    async def test_completed_submit_then_resubmit_short_circuits(
        self, client: AsyncClient, db: AsyncSession, active_study: Study
    ) -> None:
        """First submit completes the participant; second submit on the
        same token must return ``already_submitted`` and must not append
        new qsort_entries."""
        session_token = str(uuid.uuid4())

        # Record consent first (consent_hash is required by validate stage).
        consent = await client.post(
            f"/api/study/{active_study.slug}/consent",
            json={
                "session_token": session_token,
                "study_slug": active_study.slug,
                "language_code": "en",
                "consent_hash": "test-hash",
            },
        )
        assert consent.status_code == 200

        statements = active_study.statements
        qsort = [
            {"statement_id": statements[0].id, "grid_score": -1, "col": 0, "row": 0},
            {"statement_id": statements[1].id, "grid_score": 0, "col": 1, "row": 0},
            {"statement_id": statements[2].id, "grid_score": 0, "col": 1, "row": 1},
            {"statement_id": statements[3].id, "grid_score": 1, "col": 2, "row": 0},
        ]
        payload = {
            "session_token": session_token,
            "study_slug": active_study.slug,
            "language_used": "en",
            "status": "completed",
            "qsort": qsort,
            "postsort_answers": {"x": "y"},
        }
        r1 = await client.post("/api/submit", json=payload)
        assert r1.status_code == 200, r1.text
        body1 = r1.json()
        assert body1["status"] == "success"
        confirmation = body1["confirmation_code"]

        # Count qsort_entries after first submit.
        rows1 = await db.execute(
            select(QSortEntry).join(Participant).where(
                Participant.session_token == uuid.UUID(session_token)
            )
        )
        n_after_first = len(rows1.scalars().all())
        assert n_after_first == 4

        # Second submit on the same token — must short-circuit.
        r2 = await client.post("/api/submit", json=payload)
        assert r2.status_code == 200, r2.text
        body2 = r2.json()
        # Confirmation code should match (same participant).
        assert body2.get("confirmation_code") == confirmation
        # Already-submitted flag must be set.
        assert body2.get("already_submitted") is True, (
            f"Resubmit on completed participant must carry "
            f"already_submitted=True; got {body2!r}"
        )

        # Crucial: no extra qsort entries.
        rows2 = await db.execute(
            select(QSortEntry).join(Participant).where(
                Participant.session_token == uuid.UUID(session_token)
            )
        )
        n_after_second = len(rows2.scalars().all())
        assert n_after_second == 4, (
            "Resubmit must not append new qsort_entries; "
            f"had {n_after_first}, now {n_after_second}"
        )


@pytest.mark.asyncio
class TestCrossStudySubmitOnBehalf:
    """A token issued for study A cannot submit to study B."""

    async def test_token_from_study_a_rejected_on_study_b(
        self,
        client: AsyncClient,
        db: AsyncSession,
        active_study: Study,
        user_factory,
        project_factory,
        study_factory,
    ) -> None:
        """Seed a participant on study_a (via consent), then attempt to
        submit a Q-sort to study_b reusing study_a's session_token."""
        # Consent on study_a → creates the participant row bound to study_a.
        session_token = str(uuid.uuid4())
        consent = await client.post(
            f"/api/study/{active_study.slug}/consent",
            json={
                "session_token": session_token,
                "study_slug": active_study.slug,
                "language_code": "en",
                "consent_hash": "test-hash",
            },
        )
        assert consent.status_code == 200

        # Build study_b (active, with its own statements).
        u = await user_factory()
        proj_b = await project_factory(owner=u)
        study_b = Study(
            slug="study-b-cross",
            project_id=proj_b.id,
            state=StudyState.active,
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study_b)
        await db.flush()
        s_b = Statement(study_id=study_b.id, code="B1")
        db.add(s_b)
        await db.commit()

        # Submit to study_b using study_a's token.
        payload = {
            "session_token": session_token,
            "study_slug": "study-b-cross",
            "language_used": "en",
            "status": "started",
            "qsort": [{"statement_id": s_b.id, "grid_score": 0}],
        }
        r = await client.post("/api/submit", json=payload)
        # The validation error surfaces as a 400 (ValidationError →
        # HTTPException 400 in the router error pipeline).
        assert r.status_code == 400, (
            f"Cross-study submit must be rejected; got {r.status_code} "
            f"body={r.text!r}"
        )
        assert "does not belong" in r.text.lower(), (
            f"Cross-study rejection should mention token does not belong "
            f"to this study; got body={r.text!r}"
        )


class TestImplementationContract:
    """Static guards on the idempotency mechanism."""

    def test_session_token_unique_constraint(self) -> None:
        """The unique constraint on session_token is what makes
        IntegrityError-on-double-insert a real gate (not a fluke).
        Without it, the rollback-and-refetch path at
        submission_service.py:383-393 has no error to catch and the
        race window opens."""
        from app.models import Participant as ParticipantModel

        col = ParticipantModel.__table__.c.session_token
        assert col.unique is True, (
            "Participant.session_token must carry unique=True for "
            "IntegrityError-driven idempotency to work"
        )

    def test_for_update_lock_in_find_or_create(self) -> None:
        """The session_token lookup must run under SELECT FOR UPDATE so
        concurrent submissions on the same token serialize."""
        import inspect

        from app.services.submission_service import SubmissionService

        source = inspect.getsource(SubmissionService._find_or_create_participant)
        assert "with_for_update" in source, (
            "_find_or_create_participant must take a row-level lock on "
            "the session_token query. Source preview:\n" + source[:600]
        )

    def test_cross_study_check_in_find_or_create(self) -> None:
        """The submit-on-behalf gate is a participant.study_id != study.id
        check at line 341-342. Pin it via source assertion so a refactor
        can't quietly drop it."""
        import inspect

        from app.services.submission_service import SubmissionService

        source = inspect.getsource(SubmissionService._find_or_create_participant)
        # The gate is "if participant and participant.study_id != study.id"
        # which raises ValidationError("Session token does not belong to
        # this study.").
        assert "participant.study_id != study.id" in source, (
            "_find_or_create_participant must reject submit-on-behalf "
            "by checking participant.study_id != study.id. Source:\n"
            + source[:800]
        )

    def test_already_completed_short_circuit(self) -> None:
        """The already-submitted short-circuit lives in
        _update_existing_participant; pin its presence."""
        import inspect

        from app.services.submission_service import SubmissionService

        source = inspect.getsource(SubmissionService._update_existing_participant)
        assert "already_submitted" in source, (
            "_update_existing_participant must surface "
            "already_submitted=True for already-completed participants. "
            "Source:\n" + source[:600]
        )
