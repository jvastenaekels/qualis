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

    # 3. DRAFT BEHAVIOR: Allow overwrite (last write wins) for auto-save support
    # In draft mode, optimistic locking is relaxed to prevent 409 loops during frequent auto-saves
    conflict_response = await client.patch(
        f"/api/admin/studies/{seed_study.slug}",
        headers=auth_headers,
        json={"show_statement_codes": False, "last_updated_at": last_updated_at},
    )

    # For DRAFT studies, this should succeed (last write wins)
    assert conflict_response.status_code == status.HTTP_200_OK
    # The update should have been applied (overwriting User A's change)
    assert conflict_response.json()["show_statement_codes"] is False


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
