import pytest
from httpx import AsyncClient
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Study


@pytest.mark.asyncio
async def test_update_study_optimistic_locking(
    client: AsyncClient,
    db: AsyncSession,
    seed_study: Study,
    test_user,
    auth_token_factory,
):
    """Test that concurrent updates are prevented by optimistic locking."""
    auth_headers = auth_token_factory(test_user)

    # 1. Get initial state
    response = await client.get(
        f"/api/admin/studies/{seed_study.slug}", headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    study_data = response.json()
    last_updated_at = study_data["updated_at"]

    # 2. Simulate User A updating the study
    import asyncio

    await asyncio.sleep(1.1)
    update_response = await client.patch(
        f"/api/admin/studies/{seed_study.slug}",
        headers=auth_headers,
        json={"show_statement_codes": True, "last_updated_at": last_updated_at},
    )
    assert update_response.status_code == status.HTTP_200_OK
    updated_study = update_response.json()
    new_updated_at = updated_study["updated_at"]
    assert new_updated_at != last_updated_at

    # 3. User B saves with the timestamp from before A's write. The study is
    #    a draft — the state in which two researchers actually edit the same
    #    configuration — and the lock applies there too. The 409 carries the
    #    server's current study so the designer can run its three-way merge
    #    (useStudyPersistence.applyConflict) instead of overwriting A.
    conflict_response = await client.patch(
        f"/api/admin/studies/{seed_study.slug}",
        headers=auth_headers,
        json={"show_statement_codes": False, "last_updated_at": last_updated_at},
    )

    assert conflict_response.status_code == status.HTTP_409_CONFLICT
    body = conflict_response.json()
    assert body["code"] == "conflict"
    server_state = body["details"]["server_state"]
    assert server_state["slug"] == seed_study.slug
    assert server_state["show_statement_codes"] is True  # A's write, untouched
    assert server_state["updated_at"] == new_updated_at

    # 4. B retries with the server's timestamp (what the merge hands back).
    retry = await client.patch(
        f"/api/admin/studies/{seed_study.slug}",
        headers=auth_headers,
        json={"show_statement_codes": False, "last_updated_at": new_updated_at},
    )
    assert retry.status_code == status.HTTP_200_OK
    assert retry.json()["show_statement_codes"] is False


@pytest.mark.asyncio
async def test_update_study_no_locking_if_timestamp_missing(
    client: AsyncClient,
    db: AsyncSession,
    seed_study: Study,
    test_user,
    auth_token_factory,
):
    """Verify that updates still work without last_updated_at (LWW fallback or legacy)."""
    auth_headers = auth_token_factory(test_user)
    # This ensures we don't break existing scripts/clients that don't use the feature yet.
    response = await client.patch(
        f"/api/admin/studies/{seed_study.slug}",
        headers=auth_headers,
        json={"show_statement_codes": True},
    )
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_update_study_same_timestamp_works(
    client: AsyncClient,
    db: AsyncSession,
    seed_study: Study,
    test_user,
    auth_token_factory,
):
    """Verify that update works if timestamps match exactly."""
    auth_headers = auth_token_factory(test_user)
    response = await client.get(
        f"/api/admin/studies/{seed_study.slug}", headers=auth_headers
    )
    last_updated_at = response.json()["updated_at"]

    update_response = await client.patch(
        f"/api/admin/studies/{seed_study.slug}",
        headers=auth_headers,
        json={
            "show_statement_codes": not seed_study.show_statement_codes,
            "last_updated_at": last_updated_at,
        },
    )
    assert update_response.status_code == status.HTTP_200_OK
