"""The SPA catch-all must never serve a file outside the frontend build directory.

`serve_spa` joins the request path onto FRONTEND_DIST. Starlette decodes
percent-escapes before populating the `{full_path:path}` parameter, so
`/..%2fsecret.txt` arrives as `../secret.txt` and `os.path.join` walks out
of `dist/`. This only matters where FastAPI serves the SPA itself (the
single-process Scalingo deployment); nginx in the Compose stack normalises
the path before it reaches the app.

These tests build a throwaway app against a temporary `dist/` so they run
without a frontend build and without the database.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.middleware import spa


@pytest.fixture
def spa_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>spa</html>")
    (dist / "robots.txt").write_text("User-agent: *")
    (tmp_path / "secret.txt").write_text("TOP SECRET")

    monkeypatch.setattr(spa, "FRONTEND_DIST", str(dist))
    app = FastAPI()
    spa.mount_spa(app)
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.parametrize(
    "path",
    [
        "/..%2fsecret.txt",
        "/%2e%2e/secret.txt",
        "/%2e%2e%2fsecret.txt",
        "/assets/..%2f..%2fsecret.txt",
        "/x/..%2f..%2fsecret.txt",
    ],
)
async def test_encoded_dot_segments_never_escape_dist(spa_client, path: str) -> None:
    async with spa_client as c:
        r = await c.get(path)
    assert "TOP SECRET" not in r.text
    assert r.status_code in (404, 200)
    if r.status_code == 200:
        # Falling back to index.html is acceptable; leaking is not.
        assert "spa" in r.text


async def test_legitimate_dist_root_file_still_served(spa_client) -> None:
    async with spa_client as c:
        r = await c.get("/robots.txt")
    assert r.status_code == 200
    assert r.text == "User-agent: *"


async def test_client_route_falls_back_to_index(spa_client) -> None:
    async with spa_client as c:
        r = await c.get("/study/some-slug/welcome")
    assert r.status_code == 200
    assert "spa" in r.text
