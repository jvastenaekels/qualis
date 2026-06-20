# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Audit Wave C — participant-flow correctness (backend: C1, C4)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, Statement, Study


async def _fresh_participant(db: AsyncSession, token: str) -> Participant:
    # populate_existing overwrites the identity-map copy with fresh DB values
    # (async-safe), without expire_all() — which would also expire `active_study`
    # and trigger a lazy reload outside the greenlet on the next attribute access.
    return (
        await db.execute(
            select(Participant)
            .where(Participant.session_token == uuid.UUID(token))
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


@pytest.mark.asyncio
async def test_reconsent_does_not_overwrite_consent_timestamp_or_hash(
    client: AsyncClient, db: AsyncSession, active_study: Study
) -> None:
    """C1: re-POSTing consent must NOT reset consented_at / consent_hash.

    consented_at is the duration metric's start anchor (and the legal record
    of consent); overwriting it on a re-mount / retry / back-nav produces
    artificially short or negative durations (negatives are silently dropped,
    skewing the median).
    """
    token = str(uuid.uuid4())

    async def consent(consent_hash: str):
        return await client.post(
            f"/api/study/{active_study.slug}/consent",
            json={
                "session_token": token,
                "study_slug": active_study.slug,
                "language_code": "en",
                "consent_hash": consent_hash,
            },
        )

    r1 = await consent("hash-A")
    assert r1.status_code == 200, r1.text
    p1 = await _fresh_participant(db, token)
    original_ts = p1.consented_at
    assert original_ts is not None
    assert p1.consent_hash == "hash-A"

    # Re-consent with a different hash — first-consent must win on both fields.
    r2 = await consent("hash-B")
    assert r2.status_code == 200, r2.text
    p2 = await _fresh_participant(db, token)
    assert p2.consented_at == original_ts, "consented_at must not change on re-consent"
    assert p2.consent_hash == "hash-A", "consent_hash must not change on re-consent"


@pytest.mark.asyncio
async def test_resubmit_completed_after_study_edit_returns_confirmation_not_422(
    client: AsyncClient, db: AsyncSession, active_study: Study
) -> None:
    """C4: a completed participant re-POSTing after the study was edited (so the
    stored Q-sort no longer validates) must idempotently get its confirmation
    back, not a 422 ValidationError."""
    token = str(uuid.uuid4())

    consent = await client.post(
        f"/api/study/{active_study.slug}/consent",
        json={
            "session_token": token,
            "study_slug": active_study.slug,
            "language_code": "en",
            "consent_hash": "test-hash",
        },
    )
    assert consent.status_code == 200, consent.text

    statements = active_study.statements
    qsort = [
        {"statement_id": statements[0].id, "grid_score": -1, "col": 0, "row": 0},
        {"statement_id": statements[1].id, "grid_score": 0, "col": 1, "row": 0},
        {"statement_id": statements[2].id, "grid_score": 0, "col": 1, "row": 1},
        {"statement_id": statements[3].id, "grid_score": 1, "col": 2, "row": 0},
    ]
    payload = {
        "session_token": token,
        "study_slug": active_study.slug,
        "language_used": "en",
        "status": "completed",
        "qsort": qsort,
        "postsort_answers": {},
    }

    r1 = await client.post("/api/submit", json=payload)
    assert r1.status_code == 200, r1.text
    confirmation = r1.json()["confirmation_code"]

    # Operator edits the study after completion: adding a statement makes the
    # stored 4-card Q-sort fail validate_distribution (len(qsort) != stmt_count)
    # in every distribution mode.
    db.add(Statement(study_id=active_study.id, code="EXTRA-AFTER"))
    await db.commit()

    # Re-POST the original (now-invalid) completed payload.
    r2 = await client.post("/api/submit", json=payload)
    assert r2.status_code == 200, (
        f"Completed re-submit after a study edit must short-circuit to the "
        f"stored confirmation, not 422. Got {r2.status_code}: {r2.text}"
    )
    body2 = r2.json()
    assert body2.get("already_submitted") is True
    assert body2.get("confirmation_code") == confirmation
