# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 3 Task 5 — Recruitment-token replay across studies.

A recruitment token issued for Study A must not be replayable against
Study B, even when both studies live under the same tenant or different
tenants. The token-validation chain in
:func:`app.services.recruitment_service.RecruitmentService.validate_link_token`
explicitly checks ``link.study_id != study_id`` and returns ``None`` on
mismatch, so the participant-facing handler raises 403.

This regression guard pins that behaviour: it issues a real link for
Study A, then attempts to use it on Study B's ``GET /api/study/{slug}``
endpoint and asserts a 403 denial.

Status: filed as F-04-002 (observation — the cross-study check exists
and is correct).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from .conftest import TenancyFixtures


@pytest.mark.asyncio
class TestRecruitmentTokenReplay:
    """Recruitment tokens are scoped to the issuing study."""

    async def test_token_for_study_a_rejected_on_study_b(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
    ) -> None:
        """Token issued for study_in_a must be rejected on study_in_b's URL."""
        token = tenancy.recruitment_link_in_a.token

        # Sanity: the token works against its own study (study_in_a).
        # The handler returns 200 even if the link is valid, regardless of
        # study state — the link-token branch only rejects with 403 on
        # invalid/mismatched/expired tokens.
        own_response = await client.get(
            f"/api/study/{tenancy.study_in_a.slug}",
            params={"link_token": token},
        )
        assert own_response.status_code == 200, (
            f"Token must be accepted on its own study; got {own_response.status_code}"
        )

        # Cross-study replay: same token, study_in_b's slug.
        replay_response = await client.get(
            f"/api/study/{tenancy.study_in_b.slug}",
            params={"link_token": token},
        )
        assert replay_response.status_code == 403, (
            "Cross-study token replay must be rejected with 403; "
            f"got {replay_response.status_code} body={replay_response.text!r}"
        )
        assert "recruitment link" in replay_response.text.lower()

    async def test_token_for_study_b_rejected_on_study_a(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
    ) -> None:
        """Symmetric guard: token issued for study_in_b rejected on study_in_a."""
        token = tenancy.recruitment_link_in_b.token

        replay_response = await client.get(
            f"/api/study/{tenancy.study_in_a.slug}",
            params={"link_token": token},
        )
        assert replay_response.status_code == 403, (
            "Cross-study token replay (B→A) must be rejected with 403; "
            f"got {replay_response.status_code} body={replay_response.text!r}"
        )
