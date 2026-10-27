"""Client-IP extraction behind a trusted proxy: rightmost X-Forwarded-For hop."""

import pytest
from starlette.requests import Request

from app.core.config import settings
from app.limiter import _get_real_ip


def _request(xff: str | None, peer: str = "10.0.0.2") -> Request:
    headers = [] if xff is None else [(b"x-forwarded-for", xff.encode())]
    return Request(
        {"type": "http", "headers": headers, "client": (peer, 1234), "method": "GET"}
    )


def test_spoofed_leftmost_entry_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", "*")
    assert _get_real_ip(_request("6.6.6.6, 203.0.113.7")) == "203.0.113.7"


def test_untrusted_peer_ignores_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", "")
    assert _get_real_ip(_request("6.6.6.6, 203.0.113.7")) == "10.0.0.2"


@pytest.mark.parametrize("xff", [None, "", " , "])
def test_missing_or_blank_header_falls_back_to_peer(
    monkeypatch: pytest.MonkeyPatch, xff: str | None
) -> None:
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", "*")
    assert _get_real_ip(_request(xff)) == "10.0.0.2"
