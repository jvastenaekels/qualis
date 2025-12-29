"""Integration tests for administrative API scripts."""

import json
import os

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Study, User
from app.utils.script_utils import APIClient  # noqa: E402


@pytest.mark.asyncio
async def test_api_client_login(client: AsyncClient, test_user: User):
    """Test APIClient utility with the test app."""
    from tests.conftest import TEST_EMAIL, TEST_PASSWORD

    # Use the client fixture which already has dependency overrides
    api = APIClient(client=client)

    await api.login(email=TEST_EMAIL, password=TEST_PASSWORD)
    assert api.token is not None
    assert "Authorization" in api.client.headers
    # We do NOT close the client fixture as it's managed by pytest


@pytest.mark.asyncio
async def test_seed_script_integration(
    client: AsyncClient, db: AsyncSession, test_user: User
):
    """Test seed.py refactored logic indirectly."""
    import seed
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

    tmp_path = "backend/tests/tmp_study.json"
    with open(tmp_path, "w") as f:
        json.dump(study_data, f)

    # Monkeypatch APIClient in the seed module
    orig_api_client = seed.APIClient

    def mock_api_client(*args, **kwargs):
        kwargs["client"] = client  # Use the fixture
        return orig_api_client(*args, **kwargs)

    seed.APIClient = mock_api_client  # type: ignore

    try:
        await seed.seed_study(tmp_path)

        # Verify in DB
        result = await db.execute(select(Study).where(Study.slug == "seed-via-api"))
        study = result.scalars().first()
        assert study is not None
        assert study.slug == "seed-via-api"
    finally:
        seed.APIClient = orig_api_client  # type: ignore
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@pytest.mark.asyncio
async def test_update_study_script_integration(
    client: AsyncClient, db: AsyncSession, seed_study: Study
):
    """Test update_study.py refactored logic."""
    import update_study
    from tests.conftest import TEST_EMAIL, TEST_PASSWORD

    os.environ["ADMIN_EMAIL"] = TEST_EMAIL
    os.environ["ADMIN_PASSWORD"] = TEST_PASSWORD

    study_data = {
        "slug": seed_study.slug,
        "default_language": "fr",
        "presort_config": {},
        "postsort_config": {},
        "translations": {
            "en": {
                "title": "Updated Title",
                "instructions": "test",
                "consent_title": "consent",
            }
        },
        "statements": [{"code": "S1", "translations": {"en": "Updated Statement 1"}}],
    }

    tmp_path = "backend/tests/tmp_update_study.json"
    with open(tmp_path, "w") as f:
        json.dump(study_data, f)

    # Monkeypatch in update_study module
    orig_api_client = update_study.APIClient

    def mock_api_client(*args, **kwargs):
        kwargs["client"] = client
        return orig_api_client(*args, **kwargs)

    update_study.APIClient = mock_api_client  # type: ignore

    try:
        await update_study.update_study(tmp_path)

        await db.refresh(seed_study)
        assert seed_study.default_language == "fr"
    finally:
        update_study.APIClient = orig_api_client  # type: ignore
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
