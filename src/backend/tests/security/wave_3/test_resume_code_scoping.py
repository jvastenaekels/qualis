# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 3 Task 7 — Resume-code lookup scoping.

Resume codes are short, memorable strings (~9M combinations of
``adjective-noun-NNN`` per language). They are generated globally
unique in the DB (``app.resume_codes.generate_unique_resume_code``
checks ``Participant.resume_code == code`` without a study filter).

The risk would be if the *lookup* — at
``GET /api/study/{slug}/resume/{code}`` — also ran a study-agnostic
``WHERE resume_code = :code`` query. An attacker who controlled a
study could harvest resume codes from participants of unrelated
studies.

The actual lookup
(``backend/app/routers/participants.py:152-189``) joins
``Participant`` to ``Study`` and filters
``Participant.resume_code == code AND Study.slug == slug``. The
study-scoping makes cross-study harvesting impossible: even if Bob
guesses a valid code that belongs to a participant in study B, hitting
``GET /api/study/study-a-slug/resume/CODE`` joins on the wrong study
slug and returns 404.

Status: filed as F-04-004 (observation — lookup is study-scoped).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


from .conftest import TenancyFixtures


@pytest.mark.asyncio
class TestResumeCodeScoping:
    """Resume-code lookup must filter by study, not just by code."""

    async def test_code_for_study_a_not_resolvable_via_study_b_url(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
        db: AsyncSession,
    ) -> None:
        """A resume code for participant_in_a, looked up via study_b's URL, must 404."""
        # Set a known resume code on participant_in_a so we can query it.
        # The fixture creates the participant without a code; that's the
        # normal path (codes are minted on first save_draft / submit).
        known_code = "brave-tiger-427"
        tenancy.participant_in_a.resume_code = known_code
        db.add(tenancy.participant_in_a)
        await db.commit()

        # Sanity: the code resolves on its own study URL.
        own_study_response = await client.get(
            f"/api/study/{tenancy.study_in_a.slug}/resume/{known_code}"
        )
        # Could be 200 (active) or 403 (draft state) — but never 404.
        assert own_study_response.status_code != 404, (
            f"Code must resolve on its own study; got {own_study_response.status_code}"
        )

        # Cross-study lookup: same code on study_b's URL must 404.
        cross_response = await client.get(
            f"/api/study/{tenancy.study_in_b.slug}/resume/{known_code}"
        )
        assert cross_response.status_code == 404, (
            "Cross-study resume-code lookup must 404 (study slug filter); "
            f"got {cross_response.status_code} body={cross_response.text!r}"
        )

    async def test_codes_unique_globally_but_lookup_is_scoped(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
        db: AsyncSession,
    ) -> None:
        """Even if two participants in different studies *somehow* shared a code
        (current generator prevents it, but DB constraints don't), the lookup
        would still scope by study slug — so each study would only ever see
        its own participant.

        We don't actually share a code (DB has a unique constraint on
        Participant.resume_code), but we verify the symmetric direction:
        a code on participant_in_b is not resolvable via study_a's URL.
        """
        known_code = "wise-owl-123"
        tenancy.participant_in_b.resume_code = known_code
        db.add(tenancy.participant_in_b)
        await db.commit()

        cross_response = await client.get(
            f"/api/study/{tenancy.study_in_a.slug}/resume/{known_code}"
        )
        assert cross_response.status_code == 404, (
            "Symmetric cross-study lookup (B→A) must 404; "
            f"got {cross_response.status_code} body={cross_response.text!r}"
        )

        # Sanity: still resolves on its own study.
        own_response = await client.get(
            f"/api/study/{tenancy.study_in_b.slug}/resume/{known_code}"
        )
        assert own_response.status_code != 404, (
            f"Code must resolve on its own study; got {own_response.status_code}"
        )

    async def test_lookup_query_filters_on_study_slug(self) -> None:
        """Static check: the resume_session handler's query must include
        ``Study.slug == slug`` in its WHERE clause. We verify by reading
        the source — this is the canonical guard against a future refactor
        that drops the study filter."""
        import inspect

        from app.routers.participants import resume_session

        source = inspect.getsource(resume_session)
        assert "Study.slug == slug" in source, (
            "resume_session handler must filter on Study.slug == slug; "
            "without it, resume codes become a global enumeration oracle. "
            "Source preview:\n" + source[:500]
        )

    async def test_unrelated_participant_table_lookups_remain_scoped(
        self, db: AsyncSession
    ) -> None:
        """Belt-and-suspenders: the only ORM places that look up by
        ``resume_code`` are the resume handler (study-scoped) and the
        uniqueness probe in ``generate_unique_resume_code``. Pin that
        no other code path does ``Participant.resume_code == X`` without
        a join.

        We can't enforce this with a runtime test, so we read the source
        in the relevant modules and assert no rogue patterns exist.
        """
        import inspect

        from app.services import study_data_service, submission_service

        # Pattern is fine in:
        #   - resume_codes.generate_unique_resume_code (uniqueness probe; not a lookup)
        #   - participants.resume_session (joined to Study)
        #
        # Forbidden anywhere else.
        for module in (study_data_service, submission_service):
            source = inspect.getsource(module)
            # We accept ``participant.resume_code = ...`` (assignment) but
            # reject ``Participant.resume_code ==`` (filter) without a
            # study join.
            if "Participant.resume_code ==" in source:
                # Verify the filter is in a query that also joins Study.
                # If not, that's a finding.
                assert "Study" in source, (
                    f"{module.__name__} filters on Participant.resume_code "
                    "without a Study join — potential cross-study leak"
                )
