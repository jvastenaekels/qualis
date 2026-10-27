"""Unit tests for the access-log token-query scrubber."""

import logging

import pytest

from app.middleware.log_scrub import scrub_token_query


class TestScrubTokenQuery:
    def test_strips_token_param(self) -> None:
        assert (
            scrub_token_query("/api/email/verify?token=abc.def.ghi")
            == "/api/email/verify?token=REDACTED"
        )

    def test_preserves_other_params(self) -> None:
        assert (
            scrub_token_query("/api/email/verify?token=secret&lang=fr")
            == "/api/email/verify?token=REDACTED&lang=fr"
        )

    def test_no_token_param_passes_through(self) -> None:
        assert scrub_token_query("/api/me") == "/api/me"

    def test_empty_token_value(self) -> None:
        assert scrub_token_query("/x?token=") == "/x?token=REDACTED"

    def test_handles_uppercase_token_param(self) -> None:
        # Treat case-insensitively to be safe
        assert scrub_token_query("/x?Token=abc") == "/x?Token=REDACTED"

    def test_token_in_middle(self) -> None:
        assert (
            scrub_token_query("/x?lang=fr&token=secret&page=2")
            == "/x?lang=fr&token=REDACTED&page=2"
        )


class TestScrubResumePath:
    def test_redacts_resume_code_in_path(self) -> None:
        assert (
            scrub_token_query("/api/study/s/resume/brave-tiger-427?x=1")
            == "/api/study/s/resume/REDACTED?x=1"
        )

    def test_redacts_resume_code_in_access_log_line(self) -> None:
        assert "REDACTED" in scrub_token_query("GET /resume/brave-tiger-427 500")
        assert "brave-tiger-427" not in scrub_token_query(
            "GET /resume/brave-tiger-427 500"
        )

    def test_bare_resume_segment_passes_through(self) -> None:
        assert scrub_token_query("/api/study/s/resume") == "/api/study/s/resume"


async def test_frontend_log_context_is_scrubbed(
    client, caplog: pytest.LogCaptureFixture
) -> None:
    body = {
        "level": "error",
        "message": "boom",
        "context": {"endpoint": "/api/study/s/resume/brave-tiger-427", "n": 3},
    }
    with caplog.at_level(logging.INFO, logger="frontend_error"):
        r = await client.post("/api/logs", json=body)
    assert r.status_code == 200
    records = [rec for rec in caplog.records if rec.name == "frontend_error"]
    assert records
    for rec in records:
        assert "brave-tiger-427" not in str(vars(rec))
    assert any(
        rec.context == {"endpoint": "/api/study/s/resume/REDACTED", "n": 3}
        for rec in records
    )
