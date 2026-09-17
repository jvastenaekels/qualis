"""Participant session rules, extracted from routers/participants.py.

progress, save-draft, withdraw, resume and self-erase each re-ran the
same session lookup inline and applied their rules in the handler. The
service owns both; the pure pieces below are the ones a handler could not
expose to a test before.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from app.services.participant_session_service import (
    SessionRejected,
    resume_lookup,
    should_advance,
    strip_rough_slice,
)


def test_resume_lookup_treats_a_uuid_as_a_legacy_session_token() -> None:
    kind, value = resume_lookup("3F2504E0-4F89-11D3-9A0C-0305E82C3301")
    assert kind == "session_token"
    assert value == UUID("3f2504e0-4f89-11d3-9a0c-0305e82c3301")


def test_resume_lookup_lowercases_a_memorable_code() -> None:
    # Mobile keyboards capitalise the first letter; codes are stored lowercase.
    assert resume_lookup("Blue-Fox-42") == ("resume_code", "blue-fox-42")


def test_should_advance_only_moves_forward() -> None:
    assert should_advance(None, 1)
    assert should_advance(2, 3)
    assert not should_advance(3, 3)
    assert not should_advance(3, 2)


def test_strip_rough_slice_drops_the_slice_when_the_step_is_disabled() -> None:
    draft = {"rough": {"a": 1}, "qsort": {"b": 2}}
    assert strip_rough_slice(draft, rough_sort_enabled=False) == {"qsort": {"b": 2}}
    assert strip_rough_slice(draft, rough_sort_enabled=True) == draft
    assert draft == {"rough": {"a": 1}, "qsort": {"b": 2}}  # input untouched


def test_session_rejected_carries_the_status_the_route_answers() -> None:
    err = SessionRejected(410, "Session has expired")
    assert (err.status_code, err.detail, str(err)) == (410, "Session has expired", "Session has expired")


@pytest.mark.asyncio
async def test_consent_refuses_a_body_slug_that_differs_from_the_path(
    client, seed_study
) -> None:
    """The route is mounted under /api/study/{slug}; the body used to carry
    its own study_slug and the handler recorded consent on the body's study,
    ignoring the URL. The path is authoritative now."""
    r = await client.post(
        f"/api/study/{seed_study.slug}/consent",
        json={
            "study_slug": "some-other-study",
            "session_token": str(uuid4()),
            "language_code": "en",
        },
    )
    assert r.status_code == 400
    assert "study_slug" in r.json()["message"]
