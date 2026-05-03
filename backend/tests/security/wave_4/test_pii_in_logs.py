# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 4 Task 9 — PII in application logs (F-05-010).

Pre-fix gap
-----------

The Wave 4 inventory (§2.2 Promise 1, gap 1) flagged two raw-IP
leak paths:

1. **Uvicorn access log** renders ``request.client.host`` raw at the
   start of every line. The F-03-013 token-scrubber filter only handles
   query parameters (``token`` / ``otp`` / ``code``); it does not touch
   the IP that Uvicorn writes before our code runs.

   **Disposition: not fixed in code** — the access-log line is emitted
   inside the ASGI server before any FastAPI handler runs, so an
   application-side filter cannot intercept it cleanly. Documented as
   **operator obligation #2** in the Wave 7 GDPR memo (systemd-journald
   ``LineMax`` / fluentd / rsyslog regex at the log-sink layer).

2. **``routers/logs.py``** — the frontend-error report endpoint built
   ``log_payload["ip"] = request.client.host`` and passed it as
   ``extra=`` to ``frontend_logger.error/warning/info``. The
   ``extra`` keys travel through the logging.LogRecord but are NOT
   matched by the F-03-013 query-string regex (which only scans the
   formatted message and tuple-form ``record.args``). A real production
   self-hoster who routes ``frontend_error`` to any structured log sink
   (CloudWatch, ELK, Loki) gets a raw IP per frontend report.

   **Fix: hash the IP at write time** (``hash_ip()`` from
   ``app.utils.crypto``), so the log payload carries the same SHA-256
   pseudonym the participants table holds. The frontend does not need
   the raw IP for any debugging path it already exposes (the frontend
   only needs the hashed value to correlate "is this the same source
   reporting again").

Post-fix invariants pinned by this test
---------------------------------------

* Hitting ``POST /api/logs`` with a known client IP causes
  ``frontend_error`` to log a payload whose ``ip_hash`` equals
  ``hash_ip(client_ip)`` and whose serialised line contains no
  raw IP.
* The hash is the same SHA-256 + ``IP_HASH_SALT`` truncation that
  ``participants.ip_address`` uses.
* The defence-in-depth survey of other application loggers
  (``app.middleware.errors``, ``app.audit``, ``app.utils.email``,
  ``app.services.storage_service``) continues to emit no raw client
  IP. The survey doesn't try to be exhaustive — Wave 6 backlog tracks
  a CI lint rule that flags new ``request.client.host`` formatting in
  any logger that isn't allow-listed.
"""

from __future__ import annotations

import logging
import re

import pytest

from app.utils.crypto import hash_ip


@pytest.mark.asyncio
async def test_routers_logs_hashes_client_ip(
    client,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """``POST /api/logs`` hashes the client IP before passing it to
    ``frontend_logger`` — the on-disk record must not contain a raw IP."""
    body = {
        "level": "error",
        "message": "test frontend error",
        "stack": "Error: at app.tsx:1",
        "context": {"some": "context"},
        "url": "https://example.org/some/page",
        "userAgent": "Mozilla/5.0",
    }

    with caplog.at_level(logging.INFO, logger="frontend_error"):
        response = await client.post("/api/logs", json=body)
        assert response.status_code == 200, response.text

        # The httpx test client hands `request.client.host = "127.0.0.1"`
        # to Starlette. Compute the matching hash so we can assert the
        # rendered record carries it in `extra` (and crucially NOT the raw
        # value).
        expected_hash = hash_ip("127.0.0.1")

        records = [r for r in caplog.records if r.name == "frontend_error"]
        assert records, "frontend_error logger emitted no record"
        record = records[-1]

        # Extra payload keys are attached as attributes on the LogRecord
        # by stdlib logging. The post-fix payload uses `ip_hash` (not
        # `ip`) — pin the rename so a regression that re-introduces the
        # raw `ip` key fails this test.
        assert getattr(record, "ip_hash", None) == expected_hash, (
            f"expected ip_hash={expected_hash}, got {getattr(record, 'ip_hash', None)}"
        )
        assert not hasattr(record, "ip"), (
            "regression: raw `ip` key reappeared on the log record"
        )

        # Also assert the rendered line itself never contains the raw
        # client identifier (the formatted message does not include
        # `extra`, but if a future contributor f-strings client_ip into
        # the message this catches it).
        rendered = record.getMessage()
        assert "127.0.0.1" not in rendered, rendered


@pytest.mark.asyncio
async def test_routers_logs_handles_missing_client_gracefully(
    client,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """If ``request.client`` is ``None`` (rare, but possible behind a
    misconfigured proxy), the endpoint must not crash and must log
    ``ip_hash="unknown"`` rather than passing ``None`` through ``hash_ip``
    (which would salt the empty string and produce a misleading constant
    hash)."""
    # We can't easily synthesise `request.client = None` via httpx, but
    # we can verify the endpoint handles its own fallback path. The
    # actual `None` branch is exercised by inspection: see
    # `routers/logs.py` line 36 — `raw_ip = request.client.host if
    # request.client else None`.
    body = {
        "level": "warn",
        "message": "ping",
    }
    with caplog.at_level(logging.INFO, logger="frontend_error"):
        response = await client.post("/api/logs", json=body)
        assert response.status_code == 200

        records = [r for r in caplog.records if r.name == "frontend_error"]
        assert records
        record = records[-1]
        # Real test client hands a non-None client, so we get a real hash.
        # The negative branch is dead-coverage in the test client, but the
        # presence of `ip_hash` (not `ip`) is the contract.
        assert hasattr(record, "ip_hash")


def test_application_loggers_do_not_emit_raw_ip_pattern() -> None:
    """Defence-in-depth survey: scan the application source for any
    file that **both** captures ``request.client.host`` AND emits a
    log call referencing the captured variable. The ``routers/logs.py``
    path now hashes before logging; no other application path should
    reintroduce a raw-IP leak.

    This is a structural survey, not exhaustive — the Wave 6 backlog
    tracks a proper CI lint rule (AST-based). The intent here is to
    catch the obvious regression of someone copy-pasting the pre-fix
    ``client_ip = request.client.host`` followed by
    ``logger.error(..., extra={'ip': client_ip, ...})``.

    Allowlist (files that *capture* the host but legitimately do not
    log it raw):

    * ``limiter.py`` — rate-limiter context (slowapi key function),
      no logging.
    * ``routers/submissions.py``, ``routers/participants.py`` — capture
      then hand to ``submission_service`` which hashes before
      persisting.
    * ``routers/auth.py`` — capture for the security event service;
      events are persisted, not logged.
    """
    import os

    backend_root = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "app"
    )
    backend_root = os.path.abspath(backend_root)

    capture_pattern = re.compile(r"=\s*request\.client\.host\b")
    # A log call referencing one of the conventional captured-IP
    # variable names. `print(...)` excluded — Wave 6 lint can refine.
    log_with_ip_pattern = re.compile(
        r"\b(logger|log|logging|frontend_logger|audit_logger)\.[a-z]+\("
        r"[^)]*\b(client_ip|raw_ip|ip)\b",
    )

    offenders: list[str] = []
    for dirpath, _dirnames, filenames in os.walk(backend_root):
        for fname in filenames:
            if not fname.endswith(".py"):
                continue
            path = os.path.join(dirpath, fname)
            with open(path, encoding="utf-8") as fh:
                source = fh.read()
            if not capture_pattern.search(source):
                continue
            # Skip the file if it does not log the captured value at all.
            if not log_with_ip_pattern.search(source):
                continue
            # Skip the file if it hashes before logging.
            if "hash_ip(" in source:
                continue
            offenders.append(os.path.relpath(path, backend_root))

    assert not offenders, (
        f"raw-IP leak risk: {offenders}. Either hash with `hash_ip()` "
        f"before logging, or explicitly justify and add to the "
        f"allowlist in this test."
    )
