# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Regression test for F-03-013 — log-scrub regex coverage and logger
attachment.

Pre-fix the scrubber regex matched only ``token`` and ``Token`` keys
(``([?&])([Tt]oken)=[^&]*``); other casings such as ``TOKEN`` or other
sensitive query keys (``otp``, ``code``) slipped through. The filter
also attached only to ``uvicorn.access`` — application loggers like
``app.middleware.errors`` (which logs ``request.url`` on 5xx paths)
were unfiltered.

Post-fix the regex matches ``token``, ``otp`` and ``code`` keys
case-insensitively, and ``install_access_log_scrub`` attaches the same
filter to ``app.middleware.errors`` in addition to ``uvicorn.access``.

The corpus below pins every redaction outcome we care about:

* known-key, known-case (already covered pre-fix);
* known-key, missed casing (``TOKEN``);
* alternate sensitive keys (``otp``, ``code``);
* multi-param URL (redacted key only, neighbours intact);
* no-op cases (``bar=baz``, no query, ``token`` as a *value* not a key).

These tests drive both the pure ``scrub_token_query`` helper and the
``TokenLogScrubFilter`` end-to-end, and verify that
``install_access_log_scrub`` attaches the filter to the application
loggers we want covered.
"""

from __future__ import annotations

import logging

import pytest

from app.middleware.log_scrub import (
    TokenLogScrubFilter,
    install_access_log_scrub,
    scrub_token_query,
)


# -- Synthetic-log corpus -----------------------------------------------------

# (path_with_query, expected_after_scrub)
CORPUS: list[tuple[str, str]] = [
    # current pattern catches these (regression: must keep working):
    (
        "/api/email/verify?token=eyJhbGc...",
        "/api/email/verify?token=REDACTED",
    ),
    (
        "/api/password/reset/confirm?Token=eyJhbGc...&k=v",
        "/api/password/reset/confirm?Token=REDACTED&k=v",
    ),
    # missed pre-fix (broadened-regex coverage):
    (
        "/api/email/verify?TOKEN=eyJhbGc...",
        "/api/email/verify?TOKEN=REDACTED",
    ),
    (
        "/api/2fa/email/verify?otp=123456",
        "/api/2fa/email/verify?otp=REDACTED",
    ),
    (
        "/api/2fa/email/verify?code=123456",
        "/api/2fa/email/verify?code=REDACTED",
    ),
    (
        "/api/email-change/confirm?token=A&also=B",
        "/api/email-change/confirm?token=REDACTED&also=B",
    ),
    # negative cases — must NOT scrub:
    ("/api/foo?bar=baz", "/api/foo?bar=baz"),
    ("/api/study/123", "/api/study/123"),
    # 'token' as VALUE, not key — must stay intact:
    ("/api/projects?name=token", "/api/projects?name=token"),
]


@pytest.mark.parametrize("path_in,expected", CORPUS)
def test_scrub_token_query_corpus(path_in: str, expected: str) -> None:
    """Every CORPUS entry redacts to its expected form."""
    assert scrub_token_query(path_in) == expected


def test_filter_mutates_record_args() -> None:
    """End-to-end: the logging.Filter rewrites string args in place."""
    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=0,
        msg='%s "%s %s HTTP/1.1" %s',
        args=("127.0.0.1:1234", "GET", "/api/email/verify?token=secret123", 200),
        exc_info=None,
    )

    f = TokenLogScrubFilter()
    assert f.filter(record) is True
    assert record.args is not None
    rendered = record.getMessage()
    assert "secret123" not in rendered
    assert "token=REDACTED" in rendered


def test_filter_mutates_otp_record() -> None:
    """The same filter scrubs ``otp=`` parameters."""
    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=0,
        msg='%s "%s %s HTTP/1.1" %s',
        args=("127.0.0.1:1234", "POST", "/api/2fa/email/verify?otp=999111", 200),
        exc_info=None,
    )

    TokenLogScrubFilter().filter(record)
    rendered = record.getMessage()
    assert "999111" not in rendered
    assert "otp=REDACTED" in rendered


def test_install_access_log_scrub_is_idempotent() -> None:
    """Calling install twice must not stack duplicate filters."""
    install_access_log_scrub()
    install_access_log_scrub()

    access_logger = logging.getLogger("uvicorn.access")
    n_access = sum(
        1 for f in access_logger.filters if isinstance(f, TokenLogScrubFilter)
    )
    assert n_access == 1


def test_install_attaches_to_application_loggers() -> None:
    """The scrubber attaches to the application loggers that emit URLs.

    ``app.middleware.errors`` formats ``request.url`` directly into its
    error lines (lines 95, 153, 182). ``app.routers.logs`` writes
    frontend-error context which may include path-with-query strings.
    Both must carry the filter so a 5xx during a token-link consume
    cannot leak the raw token through the application-error pipeline.
    """
    install_access_log_scrub()

    for name in ("app.middleware.errors", "app.routers.logs"):
        target = logging.getLogger(name)
        assert any(isinstance(f, TokenLogScrubFilter) for f in target.filters), (
            f"TokenLogScrubFilter not attached to {name!r}"
        )


def test_filter_redacts_fstring_msg_when_args_empty() -> None:
    """The fix for the f-string bypass: when a logger is called with a
    pre-formatted message string (typical of f-string calls), the filter
    must rewrite record.msg, not just record.args.

    Pre-fix: f-string call sites in ``app.middleware.errors`` (lines 80,
    95, 153, 182) passed the rendered URL inside ``record.msg`` with
    ``record.args`` empty; the filter's ``if record.args and …``
    short-circuit let the raw token reach handlers. Post-fix the
    second branch scrubs ``record.msg`` directly.
    """
    install_access_log_scrub()
    target = logging.getLogger("app.middleware.errors")
    captured: list[logging.LogRecord] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    h = _Capture()
    target.addHandler(h)
    try:
        url = "/api/email/verify?token=SECRET_JWT"
        # f-string call: msg is pre-formatted, args is empty
        target.error(f"Service error on GET {url}: boom")
        assert len(captured) == 1
        rendered = captured[0].getMessage()
        assert "SECRET_JWT" not in rendered, rendered
        assert "token=REDACTED" in rendered, rendered
    finally:
        target.removeHandler(h)


def test_application_logger_emits_redacted_url(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """End-to-end: an error logged on ``app.middleware.errors`` with a
    sensitive query string is redacted before it reaches handlers."""
    install_access_log_scrub()

    target = logging.getLogger("app.middleware.errors")
    # caplog adds its own handler; the filter on the logger fires first
    # (filters run before handlers in stdlib logging).
    with caplog.at_level(logging.ERROR, logger="app.middleware.errors"):
        target.error(
            "Service error on %s %s: %s",
            "GET",
            "/api/email/verify?token=verysecretvalue",
            "boom",
        )

    rendered = "\n".join(record.getMessage() for record in caplog.records)
    assert "verysecretvalue" not in rendered
    assert "token=REDACTED" in rendered
