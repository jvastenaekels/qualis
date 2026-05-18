"""The repo docs/ directory is served statically so in-app guide links resolve."""

import pytest


@pytest.mark.asyncio
async def test_running_without_smtp_guide_served(client):
    r = await client.get("/docs/guides/running-without-smtp.md")
    assert r.status_code == 200
    assert "Running Qualis without SMTP" in r.text


@pytest.mark.asyncio
async def test_running_without_s3_guide_served(client):
    r = await client.get("/docs/guides/running-without-s3.md")
    assert r.status_code == 200
    assert "Running Qualis without S3" in r.text
