"""Recruitment links are counted and attributed at consent, where the participant row is created."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, RecruitmentLink, RecruitmentLinkType, Study


@pytest_asyncio.fixture
async def capped_link(db: AsyncSession, active_study: Study) -> RecruitmentLink:
    link = RecruitmentLink(
        study_id=active_study.id,
        type=RecruitmentLinkType.limited,
        token="cap-one",
        capacity=1,
    )
    db.add(link)
    await db.commit()
    return link


async def _consent(
    client: AsyncClient, slug: str, token: str, link_token: str | None = None
):
    body = {
        "session_token": token,
        "study_slug": slug,
        "language_code": "en",
        "consent_hash": "test-hash",
    }
    if link_token:
        body["link_token"] = link_token
    return await client.post(f"/api/study/{slug}/consent", json=body)


async def _complete(
    client: AsyncClient, study: Study, token: str, link_token: str | None = None
):
    s = study.statements
    payload = {
        "session_token": token,
        "study_slug": study.slug,
        "language_used": "en",
        "status": "completed",
        "presort_answers": {"age": 25},
        "qsort": [
            {"statement_id": s[0].id, "grid_score": -1, "col": 0, "row": 0},
            {"statement_id": s[1].id, "grid_score": 0, "col": 1, "row": 0},
            {"statement_id": s[2].id, "grid_score": 0, "col": 1, "row": 1},
            {"statement_id": s[3].id, "grid_score": 1, "col": 2, "row": 0},
        ],
        "postsort_answers": {},
    }
    if link_token:
        payload["link_token"] = link_token
    return await client.post("/api/submit", json=payload)


async def _participant(db: AsyncSession, token: str) -> Participant:
    db.expire_all()
    return (
        await db.execute(
            select(Participant).where(Participant.session_token == uuid.UUID(token))
        )
    ).scalar_one()


@pytest.mark.asyncio
async def test_consent_through_link_counts_usage_start_and_attribution(
    client, db, active_study, capped_link
):
    token = str(uuid.uuid4())
    resp = await _consent(client, active_study.slug, token, "cap-one")
    assert resp.status_code == 200
    await db.refresh(capped_link)
    assert capped_link.usage_count == 1
    assert capped_link.start_count == 1
    assert (await _participant(db, token)).recruitment_token == "cap-one"


@pytest.mark.asyncio
async def test_attribution_survives_final_submit(client, db, active_study, capped_link):
    token = str(uuid.uuid4())
    assert (
        await _consent(client, active_study.slug, token, "cap-one")
    ).status_code == 200
    assert (await _complete(client, active_study, token)).status_code == 200
    p = await _participant(db, token)
    assert p.recruitment_token == "cap-one"
    assert p.presort_answers["age"] == 25


@pytest.mark.asyncio
async def test_full_link_refuses_new_consent(client, db, active_study, capped_link):
    first = await _consent(client, active_study.slug, str(uuid.uuid4()), "cap-one")
    assert first.status_code == 200
    second = await _consent(client, active_study.slug, str(uuid.uuid4()), "cap-one")
    assert second.status_code == 403
    count = await db.scalar(
        select(func.count(Participant.id)).where(
            Participant.study_id == active_study.id
        )
    )
    assert count == 1


@pytest.mark.asyncio
async def test_reconsent_same_session_counts_once(
    client, db, active_study, capped_link
):
    token = str(uuid.uuid4())
    for _ in range(2):
        resp = await _consent(client, active_study.slug, token, "cap-one")
        assert resp.status_code == 200
    await db.refresh(capped_link)
    assert capped_link.usage_count == 1


@pytest.mark.asyncio
async def test_study_page_load_does_not_count_start(
    client, db, active_study, capped_link
):
    for _ in range(2):
        resp = await client.get(f"/api/study/{active_study.slug}?link_token=cap-one")
        assert resp.status_code == 200
    await db.refresh(capped_link)
    assert capped_link.start_count == 0


@pytest.mark.asyncio
async def test_old_client_link_token_on_submit_is_ignored(
    client, db, active_study, capped_link
):
    token = str(uuid.uuid4())
    assert (await _consent(client, active_study.slug, token)).status_code == 200
    resp = await _complete(client, active_study, token, link_token="cap-one")
    assert resp.status_code == 200
    await db.refresh(capped_link)
    assert capped_link.usage_count == 0


@pytest.mark.asyncio
async def test_expired_link_does_not_block_final_submit(
    client, db, active_study, capped_link
):
    token = str(uuid.uuid4())
    assert (
        await _consent(client, active_study.slug, token, "cap-one")
    ).status_code == 200
    capped_link.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db.commit()
    resp = await _complete(client, active_study, token, link_token="cap-one")
    assert resp.status_code == 200


async def _start(client: AsyncClient, study: Study, token: str, presort=None):
    """A "started" /submit creates the participant row before consent."""
    return await client.post(
        "/api/submit",
        json={
            "session_token": token,
            "study_slug": study.slug,
            "language_used": "en",
            "status": "started",
            "presort_answers": presort or {},
            "qsort": [],
            "postsort_answers": {},
        },
    )


@pytest.mark.asyncio
async def test_consent_after_started_submit_counts_link_and_attribution(
    client, db, active_study, capped_link
):
    token = str(uuid.uuid4())
    assert (await _start(client, active_study, token)).status_code == 200
    resp = await _consent(client, active_study.slug, token, "cap-one")
    assert resp.status_code == 200
    await db.refresh(capped_link)
    assert capped_link.usage_count == 1
    assert capped_link.start_count == 1
    assert (await _participant(db, token)).recruitment_token == "cap-one"


@pytest.mark.asyncio
async def test_full_link_refuses_consent_of_started_row(
    client, db, active_study, capped_link
):
    assert (
        await _consent(client, active_study.slug, str(uuid.uuid4()), "cap-one")
    ).status_code == 200
    token = str(uuid.uuid4())
    assert (await _start(client, active_study, token)).status_code == 200
    resp = await _consent(client, active_study.slug, token, "cap-one")
    assert resp.status_code == 403
    assert (await _participant(db, token)).consented_at is None


@pytest.mark.asyncio
async def test_reconsent_with_link_after_plain_consent_does_not_count(
    client, db, active_study, capped_link
):
    token = str(uuid.uuid4())
    assert (await _consent(client, active_study.slug, token)).status_code == 200
    resp = await _consent(client, active_study.slug, token, "cap-one")
    assert resp.status_code == 200
    await db.refresh(capped_link)
    assert capped_link.usage_count == 0
    assert capped_link.start_count == 0


@pytest.mark.asyncio
async def test_client_supplied_recruitment_token_is_dropped(client, db, active_study):
    token = str(uuid.uuid4())
    started = await _start(
        client, active_study, token, {"_recruitment_token": "forged", "age": 3}
    )
    assert started.status_code == 200
    assert (await _consent(client, active_study.slug, token)).status_code == 200
    p = await _participant(db, token)
    assert p.recruitment_token is None
    assert p.presort_answers["age"] == 3
