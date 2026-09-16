"""``POST /api/logs`` is an unauthenticated write into the server logs.

Three properties, each of which was false before wave 7:

* the token scrubber must act on the logger the endpoint actually writes
  to — it was attached to ``app.routers.logs`` while the module logged as
  ``frontend_error``, so the wave-2 attachment test passed on a filter
  that never saw a record;
* the scrubber must cover the bearer keys Qualis puts in query strings
  (``session_token``, ``link_token``, ``password``), not only ``token``;
* nothing goes to stdout via ``print`` (unfilterable, unstructured), and
  the endpoint carries a per-IP rate limit like every other anonymous
  write path.
"""

from __future__ import annotations

import inspect
import logging

import pytest

from app.middleware.log_scrub import scrub_token_query

SECRET = "SECRETVALUE0123"


@pytest.mark.parametrize(
    "path",
    [
        f"/api/study/x?session_token={SECRET}",
        f"/api/study/x?link_token={SECRET}&password={SECRET}",
        f"/api/study/x/audio?other=1&session_token={SECRET}",
        f"/verify?token={SECRET}",
    ],
)
def test_scrubber_covers_every_bearer_query_key(path: str) -> None:
    assert SECRET not in scrub_token_query(path)


def test_scrubber_leaves_non_secret_keys_alone() -> None:
    assert scrub_token_query("/api/study/x?lang=fr&page=2") == (
        "/api/study/x?lang=fr&page=2"
    )


@pytest.mark.asyncio
async def test_frontend_error_record_is_scrubbed(
    client, caplog: pytest.LogCaptureFixture
) -> None:
    body = {
        "level": "error",
        "message": f"fetch failed for /verify?token={SECRET}",
        "stack": f"Error: at https://qualis.example/verify?token={SECRET}",
        "url": f"https://qualis.example/study/demo?session_token={SECRET}",
    }
    with caplog.at_level(logging.INFO, logger="frontend_error"):
        r = await client.post("/api/logs", json=body)
    assert r.status_code == 200
    records = [rec for rec in caplog.records if rec.name == "frontend_error"]
    assert records, "frontend_error emitted no record"
    rendered = "\n".join(
        [rec.getMessage() for rec in records]
        + [str(getattr(rec, "url", "")) for rec in records]
        + [str(getattr(rec, "stack", "")) for rec in records]
    )
    assert SECRET not in rendered


@pytest.mark.asyncio
async def test_nothing_is_printed_to_stdout(
    client, capsys: pytest.CaptureFixture[str]
) -> None:
    body = {"level": "error", "message": "boom", "stack": "Error: at x:1"}
    r = await client.post("/api/logs", json=body)
    assert r.status_code == 200
    assert capsys.readouterr().out == ""


def test_report_log_is_rate_limited() -> None:
    """Static guard in the style of wave 5: the handler must sit under a
    per-IP ``@limiter.limit``. The limiter is disabled under TESTING, so
    the decorator's presence is the only thing a test can observe."""
    from app.routers import logs as logs_module

    src = inspect.getsource(logs_module)
    idx = src.find("async def report_log")
    assert idx != -1
    decorators = src[max(0, idx - 300) : idx]
    assert "@limiter.limit(" in decorators, decorators
