"""Unit tests for the access-log token-query scrubber."""

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
