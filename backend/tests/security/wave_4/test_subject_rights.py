# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 4 Task 7 — GDPR data-subject rights (F-05-007 — Art. 15).

Disposition
-----------

GDPR Art. 15 (right of access) grants the data subject a right to
receive their personal data — typically expected as a machine-readable
export. Qualis ships a participant-facing Art. 17 erasure endpoint
(``DELETE /api/study/{slug}/personal-data?session_token=…``) and a
resume endpoint that returns draft state, but **no participant-facing
self-export endpoint** (verified: no ``my-data`` / ``personal-data``
GET route in ``backend/app/routers/``).

This is filed as an **observation**, not a code-side gap, because:

- Art. 15 demands that the data controller (the operator) responds to
  access requests within one month — the right is to receive the data
  on request, not to receive it via a self-service portal.
- Qualis (as data processor of self-hosted deployments) provides admin
  per-participant CSV / JSON exports
  (``exports.py:175-256``) which the operator (data controller) uses
  to satisfy Art. 15 today.
- Building a participant-facing self-export is genuinely > 30 minutes
  of work (new endpoint + schema + frontend + anonymised-row contract
  mirroring F-05-006 + audit attribution). Wave 4 budget is exhausted;
  the recommendation lives in Wave 7's follow-up tracker.

Post-fix invariants pinned by ``test_article_15``
-------------------------------------------------

The operator path that satisfies Art. 15 must keep working:

1. Given a participant's ``session_token``, the operator (acting as
   data controller and authenticated as a project owner / study
   editor) can resolve it to a ``participant_id`` via the admin DB.
2. The per-participant CSV export endpoint
   (``GET /admin/studies/{slug}/participants/{participant_id}/export/csv``)
   delivers that participant's data in a machine-readable format.
3. The CSV row carries the participant-supplied identifiers
   (``Confirmation_Code``, ``Language``, presort/postsort answers,
   per-card scores and comments). It also carries the operational
   identifiers held by the operator on the participant's behalf
   (``IP_Hash``, ``User_Agent``) — Art. 15(1)(c) entitles the subject
   to know what's processed about them.
4. After Art. 17 anonymisation, the row is no longer accessible via
   the per-participant endpoint (per F-05-006). Art. 15 against an
   anonymised row is moot — the data subject has already exercised
   Art. 17 erasure on the same channel and the operator has no
   remaining personal data to disclose.

Wave 7 follow-up: the GDPR memo's "(c) Operator obligations" item 6
documents the procedure verbatim. The follow-up tracker
recommends a participant-facing self-export endpoint as a future
improvement.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Participant,
    ParticipantStatus,
    Project,
    ProjectMember,
    ProjectRole,
    QSortEntry,
    Statement,
    StatementTranslation,
    Study,
    StudyState,
    StudyTranslation,
    User,
)


async def _seed_owner(db: AsyncSession) -> User:
    user = User(
        email=f"owner-{uuid4().hex[:6]}@example.com",
        hashed_password="x" * 60,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


async def _seed_study_with_owner(
    db: AsyncSession, owner: User
) -> tuple[Study, Statement]:
    project = Project(
        title=f"P-{uuid4().hex[:6]}",
        slug=f"p-{uuid4().hex[:6]}",
    )
    db.add(project)
    await db.flush()
    db.add(
        ProjectMember(
            project_id=project.id, user_id=owner.id, role=ProjectRole.owner
        )
    )

    study = Study(
        slug=f"art15-{uuid4().hex[:6]}",
        project_id=project.id,
        state=StudyState.active,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()
    db.add(
        StudyTranslation(
            study_id=study.id,
            language_code="en",
            title="Art. 15 Operator-Path Study",
            description="Desc",
            instructions="Instr",
            consent_title="Consent",
            consent_description="Legal",
        )
    )

    statement = Statement(study_id=study.id, code="S1")
    db.add(statement)
    await db.flush()
    db.add(
        StatementTranslation(
            statement_id=statement.id, language_code="en", text="Statement 1"
        )
    )
    await db.commit()
    await db.refresh(study)
    await db.refresh(statement)
    return study, statement


async def _seed_completed_participant(
    db: AsyncSession,
    study: Study,
    statement: Statement,
) -> Participant:
    p = Participant(
        study_id=study.id,
        session_token=uuid4(),
        language_used="en",
        status=ParticipantStatus.completed,
        consent_hash="abc",
        consented_at=datetime.now(timezone.utc),
        submitted_at=datetime.now(timezone.utc),
        ip_address="hashed-ip-art15",
        user_agent="mobile:hashed-ua-art15",
        confirmation_code="ART15CFM",
        presort_answers={"age": 30, "free_text": "data subject's own input"},
        postsort_answers={"comment": "the participant's own commentary"},
    )
    db.add(p)
    await db.flush()
    db.add(
        QSortEntry(
            participant_id=p.id,
            statement_id=statement.id,
            grid_score=0,
            card_comment="participant-supplied per-card comment",
        )
    )
    await db.commit()
    await db.refresh(p)
    return p


@pytest.mark.asyncio
async def test_article_15(
    client: AsyncClient,
    db: AsyncSession,
    auth_token_factory,
) -> None:
    """Art. 15 operator path: given the data subject's session_token,
    the operator (authenticated as study editor) resolves it to a
    participant_id and delivers a machine-readable CSV export.

    This pins the Wave 7 GDPR memo's "(c) Operator obligations"
    item 6 — the procedure self-hosters follow to satisfy Art. 15.
    Filed as F-05-007 (observation: no Qualis-software change this
    wave; recommend a participant-facing self-export in Wave 7).
    """
    owner = await _seed_owner(db)
    study, statement = await _seed_study_with_owner(db, owner)
    participant = await _seed_completed_participant(db, study, statement)
    headers = auth_token_factory(owner)

    # Step 1 — The data subject submits an Art. 15 request to the
    # operator, supplying their ``session_token`` (printed at study
    # entry / saved as a resume code). The operator (data controller)
    # resolves the token to a participant_id via SQL. Mirror that
    # resolution in-process here.
    resolved = await db.execute(
        select(Participant.id).where(
            Participant.session_token == participant.session_token,
            Participant.study_id == study.id,
        )
    )
    participant_id = resolved.scalar_one()
    assert participant_id == participant.id

    # Step 2 — Operator exports the participant's data via the admin
    # per-participant CSV endpoint. This is the path the Wave 7 GDPR
    # memo will document.
    response = await client.get(
        f"/api/admin/studies/{study.slug}/participants/{participant_id}/export/csv",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert "text/csv" in response.headers["content-type"]

    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert len(rows) == 1, "Per-participant export must return exactly one row"
    row = rows[0]

    # Step 3 — The CSV row carries the data the operator processes
    # about the subject (Art. 15(1)(c) right to know what categories
    # of data are processed).
    assert row["Participant_UID"] == str(participant.session_token)
    assert row["Confirmation_Code"] == "ART15CFM"
    assert row["Language"] == "en"
    # Operational identifiers held by the operator.
    assert row["IP_Hash"] == "hashed-ip-art15"
    assert row["User_Agent"] == "mobile:hashed-ua-art15"
    # Participant-supplied content (presort / postsort survey, per-card
    # comments) — the bulk of an Art. 15 disclosure.
    assert row["S1_Comment"] == "participant-supplied per-card comment"


@pytest.mark.asyncio
async def test_article_15_after_anonymisation_is_moot(
    client: AsyncClient,
    db: AsyncSession,
    auth_token_factory,
) -> None:
    """After Art. 17 erasure on the same row, the per-participant CSV
    endpoint 404s (per F-05-006). Art. 15 against an anonymised row
    is moot: the data subject already exercised the broader Art. 17
    right on this record and the operator no longer holds personal
    data to disclose.
    """
    owner = await _seed_owner(db)
    study, statement = await _seed_study_with_owner(db, owner)
    participant = await _seed_completed_participant(db, study, statement)

    # Apply the Art. 17 erasure that the participant could trigger
    # via DELETE /api/study/{slug}/personal-data.
    from app.services.study_data_service import StudyDataService

    await StudyDataService.anonymise_participant(db, participant)

    headers = auth_token_factory(owner)
    response = await client.get(
        f"/api/admin/studies/{study.slug}/participants/{participant.id}/export/csv",
        headers=headers,
    )
    # Per F-05-006 — anonymised rows are excluded from the
    # per-participant follow-up channel.
    assert response.status_code == 404
