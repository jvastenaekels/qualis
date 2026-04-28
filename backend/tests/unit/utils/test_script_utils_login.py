"""Unit tests for APIClient.login() in app.utils.script_utils.

Covers the response-shape handling for /api/admin/projects, which became
paginated ({items, total, limit, offset}) but the helper still treated it
as a flat list and raised KeyError on the first projects[0] lookup.
"""

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.utils.script_utils import APIClient


def _make_client_with_responses(
    token_response: dict[str, object], projects_response: object
) -> tuple[httpx.AsyncClient, MagicMock]:
    """Build an httpx.AsyncClient mock whose .post and .get return canned responses."""
    client = MagicMock(spec=httpx.AsyncClient)
    client.headers = httpx.Headers()

    post_resp = MagicMock(spec=httpx.Response)
    post_resp.status_code = 200
    post_resp.json = MagicMock(return_value=token_response)
    client.post = AsyncMock(return_value=post_resp)

    get_resp = MagicMock(spec=httpx.Response)
    get_resp.status_code = 200
    get_resp.json = MagicMock(return_value=projects_response)
    client.get = AsyncMock(return_value=get_resp)

    client.aclose = AsyncMock()
    return client, client


@pytest.mark.asyncio
async def test_login_handles_paginated_projects_response() -> None:
    """The /api/admin/projects endpoint returns {items, total, ...}; .login() must unwrap."""
    client, _ = _make_client_with_responses(
        token_response={"access_token": "tok", "token_type": "bearer"},
        projects_response={
            "items": [{"id": 7, "title": "P", "slug": "p"}],
            "total": 1,
            "limit": 50,
            "offset": 0,
        },
    )
    api = APIClient(client=client)
    await api.login(email="a@b.c", password="x")

    assert api.client.headers.get("X-Project-ID") == "7"


@pytest.mark.asyncio
async def test_login_handles_empty_paginated_projects() -> None:
    """An empty paginated response must not raise; X-Project-ID is left unset."""
    client, _ = _make_client_with_responses(
        token_response={"access_token": "tok", "token_type": "bearer"},
        projects_response={"items": [], "total": 0, "limit": 50, "offset": 0},
    )
    api = APIClient(client=client)
    await api.login(email="a@b.c", password="x")

    assert "X-Project-ID" not in api.client.headers


@pytest.mark.asyncio
async def test_login_handles_legacy_list_response() -> None:
    """Backwards-compat: a flat-list response (legacy) still resolves the first project."""
    client, _ = _make_client_with_responses(
        token_response={"access_token": "tok", "token_type": "bearer"},
        projects_response=[{"id": 42, "title": "Legacy", "slug": "legacy"}],
    )
    api = APIClient(client=client)
    await api.login(email="a@b.c", password="x")

    assert api.client.headers.get("X-Project-ID") == "42"
