"""The two global error handlers that returned or logged submitted data.

* ``sqlalchemy_exception_handler`` answered an ``IntegrityError`` with
  ``str(exc.orig)``, which on asyncpg carries the constraint name, the
  column and the conflicting value — an oracle that defeats the
  anti-enumeration work in ``routers/auth.py`` on every path that does
  not catch the error locally.
* ``validation_exception_handler`` returned and logged
  ``exc.errors()`` verbatim; in Pydantic v2 each entry carries ``input``,
  so a password one character too short was echoed in the 422 body and
  written to the log at ERROR.
"""

from __future__ import annotations

import logging

import pytest
from sqlalchemy.exc import IntegrityError
from starlette.requests import Request

from app.middleware.errors import sqlalchemy_exception_handler

CONFLICT_VALUE = "victim@example.org"
CONSTRAINT = "ix_users_email"
SHORT_PASSWORD = "hunter2"


def _request() -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/x",
        "headers": [],
        "query_string": b"",
        "server": ("test", 80),
        "scheme": "http",
    }
    return Request(scope)


@pytest.mark.asyncio
async def test_integrity_error_response_names_no_constraint_or_value() -> None:
    orig = Exception(
        f'duplicate key value violates unique constraint "{CONSTRAINT}"\n'
        f"DETAIL:  Key (email)=({CONFLICT_VALUE}) already exists."
    )
    exc = IntegrityError("INSERT INTO users ...", {"email": CONFLICT_VALUE}, orig)

    response = await sqlalchemy_exception_handler(_request(), exc)

    assert response.status_code == 409
    body = bytes(response.body).decode()
    assert CONFLICT_VALUE not in body
    assert CONSTRAINT not in body


@pytest.mark.asyncio
async def test_422_body_and_log_carry_no_submitted_value(
    client, caplog: pytest.LogCaptureFixture
) -> None:
    payload = {
        "email": "someone@example.org",
        "password": SHORT_PASSWORD,
        "full_name": "Someone",
    }
    with caplog.at_level(logging.DEBUG, logger="app.middleware.errors"):
        r = await client.post("/api/register", json=payload)

    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "validation_error"
    assert isinstance(body["details"], list) and body["details"]
    assert "msg" in body["details"][0] and "loc" in body["details"][0]
    assert SHORT_PASSWORD not in r.text

    ours = [rec for rec in caplog.records if rec.name == "app.middleware.errors"]
    assert ours, "handler logged nothing"
    for rec in ours:
        assert SHORT_PASSWORD not in rec.getMessage()
        assert rec.levelno < logging.ERROR, "a client-side 422 is not an ERROR"
