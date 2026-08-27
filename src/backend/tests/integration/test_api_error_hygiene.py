# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Audit Wave B — API error hygiene & info-leak hardening (B1–B4).

These endpoints previously echoed ``str(e)`` to clients and/or caught bare
``Exception`` (masking server faults as client errors). Each test pins down
the hardened behaviour:

- B1: ``/submit`` (unauthenticated) returns a generic 500, never the
  exception text.
- B2: ``/import`` structurally validates before touching the DB → clean 400
  for malformed payloads instead of a 500 / a silently-broken empty study.
- B3: unknown / forbidden translation keys are dropped instead of being
  spread into the ORM constructor (which raised a leaky 500 or overrode the PK).
- B4: a malformed invitation token yields a generic 400 with no PyJWT internals.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.models import User
from app.services.study_service import StudyService


def _minimal_valid_config() -> dict:
    """Smallest study config that passes _run_import_checks."""
    return {
        "version": "1.0",
        "study": {
            "default_language": "en",
            "translations": [
                {
                    "language_code": "en",
                    "title": "T",
                    "description": "D",
                    "consent_title": "C",
                    "consent_description": "CD",
                }
            ],
            "statements": [
                {"code": "S1", "translations": [{"language_code": "en", "text": "s1"}]}
            ],
            "grid_config": [{"score": 0, "capacity": 1}],
        },
    }


@pytest.mark.asyncio
async def test_submit_500_does_not_leak_exception_text(
    client: AsyncClient, monkeypatch
) -> None:
    """B1: an unexpected error in /submit returns a generic 500, never str(e)."""
    secret = "SECRET_INTERNAL_COLUMN_x9q"

    async def _boom(*_args, **_kwargs):
        raise RuntimeError(secret)

    monkeypatch.setattr(StudyService, "process_submission", _boom)

    resp = await client.post(
        "/api/submit",
        json={
            "study_slug": "whatever",
            "session_token": str(uuid4()),
            "language_used": "en",
            "qsort": [],
        },
    )
    assert resp.status_code == 500
    assert secret not in resp.text


@pytest.mark.asyncio
async def test_import_invalid_payload_returns_400_not_500(
    client: AsyncClient, test_user: User, project_factory, auth_token_factory
) -> None:
    """B2: a structurally invalid import payload is a clean 400, not a broken study."""
    ws = await project_factory(owner=test_user)
    headers = {**auth_token_factory(test_user), "X-Project-ID": str(ws.id)}

    resp = await client.post(
        "/api/admin/studies/import",
        json={"config": {"version": "1.0", "study": {}}, "new_slug": "broken-study"},
        headers=headers,
    )
    assert resp.status_code == 400, resp.text


@pytest.mark.asyncio
async def test_import_drops_unknown_translation_keys(
    client: AsyncClient, test_user: User, project_factory, auth_token_factory, db
) -> None:
    """B3: unknown/forbidden translation keys are dropped, not spread into the ORM."""
    ws = await project_factory(owner=test_user)
    headers = {**auth_token_factory(test_user), "X-Project-ID": str(ws.id)}

    config = _minimal_valid_config()
    # Previously these would raise TypeError (-> leaky 500) or override the PK.
    config["study"]["translations"][0]["id"] = 999999
    config["study"]["translations"][0]["unknown_field"] = "x"

    resp = await client.post(
        "/api/admin/studies/import",
        json={"config": config, "new_slug": "clean-import"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models import Study

    study = (
        await db.execute(
            select(Study)
            .where(Study.slug == "clean-import")
            .options(selectinload(Study.translations))
        )
    ).scalar_one()
    trans = study.translations[0]
    assert trans.id != 999999  # forbidden PK override was not honoured
    assert trans.title == "T"


@pytest.mark.asyncio
async def test_verify_invitation_bad_token_400_no_leak(client: AsyncClient) -> None:
    """B4: a malformed invitation token yields a generic 400 with no PyJWT internals."""
    resp = await client.get(
        "/api/admin/invitations/verify", params={"token": "not-a-real-jwt"}
    )
    assert resp.status_code == 400
    # The app wraps HTTPException(detail=<str>) into {code, message, ...}.
    body = resp.json()
    message = body.get("message") or body.get("detail")
    assert message == "Invalid or expired invitation token"
    for leak in ("Segment", "segment", "DecodeError", "padding", "Traceback"):
        assert leak not in resp.text
