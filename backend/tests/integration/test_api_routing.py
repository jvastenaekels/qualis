import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_workspaces_routing_no_slash(
    client: AsyncClient, test_user, auth_token_factory
):
    """
    Regression Test: Ensure that POST /api/admin/workspaces (without trailing slash)
    matches the API handler directly and does not fall through to the SPA catch-all (405).
    """
    headers = auth_token_factory(test_user)

    # Send empty payload. If routing works, we expect 422 (Validation Error).
    # If routing is broken (falling to SPA catch-all), we typically get 405 or 404.
    response = await client.post("/api/admin/workspaces", headers=headers, json={})

    assert (
        response.status_code == 422
    ), f"Expected 422 (handler reached), got {response.status_code}"


# Note: Testing trailing slash redirect (307) is omitted because the SPA catch-all route
# intercepts the request before the default redirect logic checks for path alternatives,
# resulting in 405. This is a known limitation when using catch-all routes.
# The critical fix is ensuring the no-slash path (used by frontend) works.
