"""Integration tests for administrative API scripts."""

import json
import os

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.utils.script_utils as script_utils_module
from app.models import Study, User
from app.utils.script_utils import APIClient, sync_study_from_file


@pytest.mark.asyncio
async def test_api_client_login(client: AsyncClient, test_user: User):
    """Test APIClient utility with the test app."""
    from tests.conftest import TEST_EMAIL, TEST_PASSWORD

    # Use the client fixture which already has dependency overrides
    api = APIClient(client=client)

    await api.login(email=TEST_EMAIL, password=TEST_PASSWORD)
    assert api.token is not None
    assert "Authorization" in api.client.headers


@pytest.mark.asyncio
async def test_sync_study_create(
    client: AsyncClient, db: AsyncSession, test_user: User
):
    """Test sync_study_from_file logic (create mode)."""
    from tests.conftest import TEST_EMAIL, TEST_PASSWORD

    # Set env vars for seeds
    os.environ["ADMIN_EMAIL"] = TEST_EMAIL
    os.environ["ADMIN_PASSWORD"] = TEST_PASSWORD

    study_data = {
        "slug": "seed-via-api",
        "default_language": "en",
        "grid_config": [{"score": 0, "capacity": 1}],
        "presort_config": {},
        "postsort_config": {},
        "translations": {
            "en": {
                "title": "Seed Title",
                "instructions": "test",
                "consent_title": "consent",
            }
        },
        "statements": [{"code": "S1", "translations": {"en": "Statement 1"}}],
    }

    tmp_path = os.path.join(os.path.dirname(__file__), "tmp_study.json")
    with open(tmp_path, "w") as f:
        json.dump(study_data, f)

    # Monkeypatch APIClient in the script_utils module
    orig_api_cls = script_utils_module.APIClient

    def mock_api_factory(*args, **kwargs):
        # Always return an instance using our test client
        return orig_api_cls(client=client)

    script_utils_module.APIClient = mock_api_factory  # type: ignore

    try:
        await sync_study_from_file(tmp_path)

        # Verify in DB
        result = await db.execute(select(Study).where(Study.slug == "seed-via-api"))
        study = result.scalars().first()
        assert study is not None
        assert study.slug == "seed-via-api"
    finally:
        script_utils_module.APIClient = orig_api_cls  # type: ignore
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@pytest.mark.asyncio
async def test_sync_study_update(
    client: AsyncClient, db: AsyncSession, seed_study: Study
):
    """Test sync_study_from_file logic (update mode)."""
    from tests.conftest import TEST_EMAIL, TEST_PASSWORD

    os.environ["ADMIN_EMAIL"] = TEST_EMAIL
    os.environ["ADMIN_PASSWORD"] = TEST_PASSWORD

    study_data = {
        "slug": seed_study.slug,
        "default_language": "fr",
        "presort_config": {},
        "postsort_config": {},
        "translations": {
            # Note: transform_study_data will handle list vs dict conversion
            "en": {
                "title": "Updated Title",
                "instructions": "test",
                "consent_title": "consent",
            }
        },
        "statements": [{"code": "S1", "translations": {"en": "Updated Statement 1"}}],
    }

    tmp_path = os.path.join(os.path.dirname(__file__), "tmp_update_study.json")
    with open(tmp_path, "w") as f:
        json.dump(study_data, f)

    # Monkeypatch
    orig_api_cls = script_utils_module.APIClient

    def mock_api_factory(*args, **kwargs):
        return orig_api_cls(client=client)

    script_utils_module.APIClient = mock_api_factory  # type: ignore

    try:
        await sync_study_from_file(tmp_path)

        await db.refresh(seed_study)
        assert seed_study.default_language == "fr"
    finally:
        script_utils_module.APIClient = orig_api_cls  # type: ignore
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
