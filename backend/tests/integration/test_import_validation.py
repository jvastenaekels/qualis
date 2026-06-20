import pytest
from httpx import AsyncClient
from app.models import User


@pytest.mark.asyncio
class TestImport500:
    async def test_validate_import_large_payload(
        self,
        client: AsyncClient,
        test_user: User,
        test_project,
        auth_token_factory,
    ):
        """
        Reproduce 500 error reported by user during import validation.
        Hypothesis: Large base64 string or specific field structure might be causing issues.
        """
        auth_headers = auth_token_factory(test_user)
        auth_headers["X-Project-ID"] = str(test_project.id)

        # Huge base64 string
        huge_logo = "data:image/png;base64," + "a" * 500000

        payload = {
            "version": "1.0",
            "exported_at": "2026-02-02T16:34:19+00:00",
            "exported_by": "test@example.com",
            "study": {
                "slug": "ennallistaminen-en",
                "default_language": "en",
                "translations": [
                    {
                        "language_code": "fi",
                        "title": "Test Study",
                        "description": "Desc",
                        "consent_title": "Consent",
                        "consent_description": "Desc",
                    }
                ],
                "statements": [],
                "grid_config": [],
                "branding": {
                    "logo_url": None,
                    "partners": [
                        {
                            "id": "3c0799d0-e914-42a1-9e8c-51a43f233165",
                            "name": "URCA",
                            "logo_url": huge_logo,
                        }
                    ],
                },
            },
        }

        response = await client.post(
            "/api/admin/studies/validate-import", json=payload, headers=auth_headers
        )

        # We expect 200 OK with validation results, not 500
        assert (
            response.status_code == 200
        ), f"Failed with {response.status_code}: {response.text}"


@pytest.mark.asyncio
class TestImportPartial:
    async def test_validate_import_missing_description(
        self,
        client: AsyncClient,
        test_user: User,
        test_project,
        auth_token_factory,
    ):
        """
        Reproduce error when importing config with missing translation description.
        We want this to succeed (by providing default), but currently it fails validation.
        """
        auth_headers = auth_token_factory(test_user)
        auth_headers["X-Project-ID"] = str(test_project.id)

        payload = {
            "version": "1.0",
            "study": {
                "slug": "partial-import",
                "default_language": "en",
                "translations": [
                    {
                        "language_code": "en",
                        "title": "Title Only",
                        # "description": "Missing" <--- This triggers the error
                    }
                ],
                "statements": [
                    {
                        "code": "S1",
                        "translations": [
                            {"language_code": "en", "text": "Statement 1"}
                        ],
                    }
                ],
                "grid_config": [{"score": 0, "capacity": 1}],
            },
        }

        # validate-import
        response = await client.post(
            "/api/admin/studies/validate-import", json=payload, headers=auth_headers
        )

        # Currently expected to FAIL (valid=False) or 400 if validation is strict logic in endpoint
        # The endpoint returns a 200 with { valid: false, errors: [...] } structure
        assert response.status_code == 200
        data = response.json()

        # We want this to eventually be True, but for reproduction we assert current failure state
        # The error key for missing field is "admin.import.validation.errors.missing_translation_field"

        # UNCOMMENT TO ASSERT FAILURE (REPRODUCTION):
        # assert data["valid"] is False
        # assert any("description" in str(e) for e in data["errors"])

        # COMMENTED OUT: We want to write the test such that it PASSES when we fix it.
        # But to confirm reproduction I should verify it fails first...
        # Let's just write the assertion for the desired state (valid=True) and see it fail.

        assert (
            data["valid"] is True
        ), f"Validation failed with errors: {data.get('errors')}"

    async def test_import_create_missing_description(
        self,
        client: AsyncClient,
        test_user: User,
        test_project,
        auth_token_factory,
        db,
    ):
        """A translation with a missing description imports fine; it defaults to "".

        The study must otherwise be valid: /import now enforces the same
        structural checks as /validate-import (audit Wave B / B2), so an
        empty-statements payload — which used to create a silently-broken
        study — is rejected. This test therefore uses a valid minimal study
        and asserts the description actually defaulted.
        """
        auth_headers = auth_token_factory(test_user)
        auth_headers["X-Project-ID"] = str(test_project.id)

        payload = {
            "config": {
                "version": "1.0",
                "study": {
                    "slug": "partial-import-create",
                    "default_language": "en",
                    "translations": [
                        {
                            "language_code": "en",
                            "title": "Title Only",
                            # Description missing -> should default to ""
                        }
                    ],
                    "statements": [
                        {
                            "code": "S1",
                            "translations": [
                                {"language_code": "en", "text": "Statement 1"}
                            ],
                        }
                    ],
                    "grid_config": [{"score": 0, "capacity": 1}],
                },
            },
            "new_slug": "partial-import-create-123",
        }

        response = await client.post(
            "/api/admin/studies/import", json=payload, headers=auth_headers
        )

        assert response.status_code == 200, response.text

        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.models import Study

        study = (
            await db.execute(
                select(Study)
                .where(Study.slug == "partial-import-create-123")
                .options(selectinload(Study.translations))
            )
        ).scalar_one()
        assert study.translations[0].description == ""
