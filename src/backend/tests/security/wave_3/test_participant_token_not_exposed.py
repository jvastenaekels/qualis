# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Audit Wave A (A1) regression — ``ParticipantRead`` must not leak the raw
``session_token``.

The study participant list (``GET /api/admin/studies/{slug}/participants``)
is reachable by the **lowest** role, ``viewer``. Before the fix,
``ParticipantRead`` serialised the full ``session_token`` — the participant's
sole bearer credential (resume, draft read, submission, GDPR self-erasure).
A viewer could therefore harvest every participant's credential and
impersonate them or erase their data.

The schema now exposes only a truncated, non-reversible ``code``
(``session_token[:8]`` uppercased — exactly what the admin UI already
rendered). ``recruitment_token`` and ``user_agent`` are research metadata,
not credentials, and remain available.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from .conftest import TenancyFixtures


@pytest.mark.asyncio
async def test_viewer_participant_list_exposes_code_not_session_token(
    tenancy: TenancyFixtures,
    client: AsyncClient,
) -> None:
    """A project viewer listing participants gets the display code, never the token."""
    response = await client.get(
        f"/api/admin/studies/{tenancy.study_in_a.slug}/participants",
        headers={"Authorization": f"Bearer {tenancy.token_a_viewer}"},
    )
    assert response.status_code == 200, response.text

    items = response.json()["items"]
    record = next((it for it in items if it["id"] == tenancy.participant_in_a.id), None)
    assert record is not None, "seeded participant_in_a should be in the list"

    # The bearer credential must never be serialised to any client...
    assert "session_token" not in record, (
        "session_token leaked in ParticipantRead — a viewer could impersonate "
        "or erase any participant"
    )
    assert "resume_code" not in record
    assert "confirmation_code" not in record

    # ...only the truncated, non-reversible display code is exposed.
    expected_code = str(tenancy.participant_in_a.session_token)[:8].upper()
    assert record["code"] == expected_code
    assert len(record["code"]) == 8

    # Research metadata (not credentials) stays available to the viewer.
    assert "recruitment_token" in record
    assert "user_agent" in record


@pytest.mark.asyncio
async def test_participant_detail_exposes_code_not_session_token(
    tenancy: TenancyFixtures,
    client: AsyncClient,
) -> None:
    """The member/owner detail view is also free of the raw session_token."""
    response = await client.get(
        f"/api/admin/studies/participants/{tenancy.participant_in_a.id}",
        headers={"Authorization": f"Bearer {tenancy.token_a_member}"},
    )
    assert response.status_code == 200, response.text

    record = response.json()
    assert "session_token" not in record
    assert record["code"] == str(tenancy.participant_in_a.session_token)[:8].upper()
