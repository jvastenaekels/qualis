"""Integration tests for study synchronization script utilities."""

import json
from unittest.mock import mock_open, patch

import pytest

from app.utils.script_utils import sync_study_from_file


@pytest.mark.asyncio
async def test_sync_study_from_file_create(db, test_user, test_workspace):
    """Should create a new study if it doesn't exist."""
    # Mock JSON data
    mock_study = {
        "slug": "new-sync-study",
        "default_language": "en",
        "show_statement_codes": True,
        "translations": {
            "en": {
                "title": "Sync Study",
                "description": "Desc",
                "instructions": "Instr",
                "consent_title": "Consent",
                "consent_description": "Legal",
                "consent_accept": "Yes",
                "consent_decline": "No",
            }
        },
        "statements": [{"code": "S1", "translations": {"en": "S1 EN"}}],
        "grid_config": [{"score": 0, "capacity": 1}],
        "presort_config": {},
        "postsort_config": {},
    }

    json_path = "mock.json"
    json_content = json.dumps(mock_study)

    # Configure env for APIClient to match test_user
    TEST_EMAIL = "test@example.com"
    TEST_PASSWORD = "testpassword"

    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        with patch(
            "os.getenv",
            side_effect=lambda k, d=None: {
                "API_BASE_URL": "http://internal",
                "ADMIN_EMAIL": TEST_EMAIL,
                "ADMIN_PASSWORD": TEST_PASSWORD,
            }.get(k, d),
        ):
            with patch("os.path.exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json_content)):
                    await sync_study_from_file(json_path)
    finally:
        app.dependency_overrides.clear()

    # Verify via DB
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models import Study

    res = await db.execute(
        select(Study)
        .where(Study.slug == "new-sync-study")
        .options(selectinload(Study.translations))
    )
    study = res.scalar_one_or_none()
    assert study is not None
    assert study.translations[0].title == "Sync Study"


@pytest.mark.asyncio
async def test_sync_study_from_file_update(db, seed_study, test_user):
    """Should update an existing study."""
    # Use seed_study's slug
    mock_study = {
        "slug": seed_study.slug,
        "default_language": "en",
        "translations": {
            "en": {
                "title": "UPDATED TITLE",
                "description": "Desc",
                "instructions": "Instr",
                "consent_title": "Consent",
                "consent_description": "Legal",
                "consent_accept": "Yes",
                "consent_decline": "No",
            }
        },
        "statements": [],
        "grid_config": [{"score": 0, "capacity": 0}],  # Structural update
        "presort_config": {},
        "postsort_config": {},
    }

    json_path = "mock_update.json"
    json_content = json.dumps(mock_study)

    TEST_EMAIL = "test@example.com"
    TEST_PASSWORD = "testpassword"

    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        with patch(
            "os.getenv",
            side_effect=lambda k, d=None: {
                "API_BASE_URL": "http://internal",
                "ADMIN_EMAIL": TEST_EMAIL,
                "ADMIN_PASSWORD": TEST_PASSWORD,
            }.get(k, d),
        ):
            with patch("os.path.exists", return_value=True):
                with patch("builtins.open", mock_open(read_data=json_content)):
                    await sync_study_from_file(json_path)
    finally:
        app.dependency_overrides.clear()

    # Verify update
    await db.refresh(seed_study)
    # The sync transforms translations to a list, so we check the title
    # First translation should be updated
    assert seed_study.translations[0].title == "UPDATED TITLE"
