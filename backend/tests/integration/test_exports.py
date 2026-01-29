"""Consolidated integration tests for data exports (CSV, JSON)."""

import pytest
import io
import zipfile
from httpx import AsyncClient

from datetime import datetime, timezone
import uuid

from app.models import Study, User, Participant, ParticipantStatus, QSortEntry


@pytest.mark.asyncio
class TestExports:
    """Tests for study data exports."""

    async def test_export_json_dump_success(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
    ):
        headers = auth_token_factory(test_user)
        # Note: endpoint is /dump for the JSON full data
        response = await client.get(
            f"/api/admin/studies/{seed_study.slug}/dump", headers=headers
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        data = response.json()
        assert "study" in data
        assert "participants" in data

    async def test_export_csv_success(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
    ):
        headers = auth_token_factory(test_user)
        response = await client.get(
            f"/api/admin/studies/{seed_study.slug}/export/csv", headers=headers
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert len(response.text) > 0

    async def test_export_csv_content_verification(
        self,
        client: AsyncClient,
        test_user: User,
        workspace_factory,
        study_factory,
        auth_token_factory,
        db,
    ):
        """Test that CSV export contains actual participant data."""
        # 1. Setup Study with specific config
        ws = await workspace_factory(owner=test_user)
        study = await study_factory(workspace=ws, owner=test_user)

        # Update presort_config to ensure columns clearly exist
        study.presort_config = {
            "age": {"type": "number", "label": {"en": "Age"}, "required": True},
            "gender": {"type": "select", "options": [], "label": {"en": "Gender"}},
        }
        study.postsort_config = {
            "comment": {"type": "text", "label": {"en": "Comment"}}
        }
        db.add(study)
        await db.commit()
        await db.refresh(study)

        headers = auth_token_factory(test_user)

        # 2. Add statements (factory doesn't add them)
        from app.models import Statement, StatementTranslation

        s1 = Statement(study_id=study.id, code="S1")
        db.add(s1)
        await db.flush()
        db.add(
            StatementTranslation(
                statement_id=s1.id, language_code="en", text="Statement 1"
            )
        )
        await db.commit()

        # 3. Add a completed participant
        test_token = uuid.uuid4()
        p = Participant(
            study_id=study.id,
            session_token=test_token,
            status=ParticipantStatus.completed,
            language_used="en",
            presort_answers={"age": 30, "gender": "Non-binary"},
            postsort_answers={"comment": "Great study"},
            consented_at=datetime.now(timezone.utc),
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(p)
        await db.flush()

        # Add Q-Sort Entry
        entry = QSortEntry(
            participant_id=p.id,
            statement_id=s1.id,
            grid_score=1,
            card_comment="I agree",
        )
        db.add(entry)
        await db.commit()

        study_slug = study.slug
        # Force session refresh so the endpoint sees the new statements and config
        db.expire_all()

        # 3. Export CSV
        response = await client.get(
            f"/api/admin/studies/{study_slug}/export/csv", headers=headers
        )
        assert response.status_code == 200
        content = response.text

        # 4. Verify Content
        # Check specific values
        assert str(test_token) in content
        assert "Non-binary" in content
        assert "Great study" in content

        # Check Header for Statement Code
        assert "S1" in content

        # Check Score (Score for S1 is 1)
        # We might want a more specific check, but ensures data is there
        assert ",1," in content or ",1\r\n" in content or ",1\n" in content

        # Verify Headers exist (simplified check)
        assert "Participant_UID" in content
        assert f"statement_{s1.code}" in content or f"{s1.code}" in content

    async def test_export_participant_csv_success(
        self,
        client: AsyncClient,
        test_user: User,
        workspace_factory,
        study_factory,
        auth_token_factory,
        db,
    ):
        """Test that single participant CSV export works and contains correct data with labels."""
        # 1. Setup Study with options
        ws = await workspace_factory(owner=test_user)
        study = await study_factory(workspace=ws, owner=test_user)
        study.presort_config = {
            "gender": {
                "type": "select",
                "label": "Gender",
                "options": [
                    {"id": "m", "label": "Male"},
                    {"id": "f", "label": "Female"},
                ],
            }
        }
        db.add(study)
        await db.commit()
        await db.refresh(study)

        # 2. Add a participant with "m"
        test_token = uuid.uuid4()
        p = Participant(
            study_id=study.id,
            session_token=test_token,
            status=ParticipantStatus.completed,
            language_used="en",
            presort_answers={"gender": "m"},
            consented_at=datetime.now(timezone.utc),
            submitted_at=datetime.now(timezone.utc),
            ip_address="127.0.0.1",
        )
        db.add(p)
        await db.commit()
        await db.refresh(p)

        headers = auth_token_factory(test_user)

        # 3. Export Participant CSV
        response = await client.get(
            f"/api/admin/studies/{study.slug}/participants/{p.id}/export/csv",
            headers=headers,
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        content = response.text

        # 4. Verify Content
        assert str(test_token) in content
        # Check Label resolution
        assert "Male" in content
        # We don't check for "m" absence globally because it's in headers like "Confirmation_Code"

        # Check metadata
        assert "127.0.0.1" in content
        assert "Duration_Seconds" in content

    async def test_export_participant_json_success(
        self,
        client: AsyncClient,
        test_user: User,
        workspace_factory,
        study_factory,
        auth_token_factory,
        db,
    ):
        """Test that single participant JSON export works."""
        # 1. Setup Study
        ws = await workspace_factory(owner=test_user)
        study = await study_factory(workspace=ws, owner=test_user)
        db.add(study)
        await db.commit()
        await db.refresh(study)

        # 2. Add a participant
        test_token = uuid.uuid4()
        p = Participant(
            study_id=study.id,
            session_token=test_token,
            status=ParticipantStatus.completed,
            language_used="en",
            presort_answers={"age": 25},
            consented_at=datetime.now(timezone.utc),
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(p)
        await db.commit()
        await db.refresh(p)

        headers = auth_token_factory(test_user)

        # 3. Export Participant JSON
        response = await client.get(
            f"/api/admin/studies/{study.slug}/participants/{p.id}/export/json",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()

        # 4. Verify Content
        assert data["participant"]["presort"]["age"] == 25
        assert data["study"]["slug"] == study.slug
        assert "statement_id_to_index" in data

    async def test_export_research_package_success(
        self,
        client: AsyncClient,
        test_user: User,
        workspace_factory,
        study_factory,
        auth_token_factory,
        db,
    ):
        """Test that the full research package ZIP is generated correctly."""
        # 1. Setup Study with statements and participants
        ws = await workspace_factory(owner=test_user)
        study = await study_factory(workspace=ws, owner=test_user)

        # Add a statement and participant to ensure ZIP has content
        from app.models import Statement, StatementTranslation

        stmt = Statement(study_id=study.id, code="S1")
        db.add(stmt)
        await db.commit()
        db.add(
            StatementTranslation(
                statement_id=stmt.id, language_code="en", text="Statement 1"
            )
        )

        p = Participant(
            study_id=study.id,
            session_token=uuid.uuid4(),
            status=ParticipantStatus.completed,
            language_used="en",
        )
        db.add(p)
        await db.commit()
        await db.refresh(study)

        headers = auth_token_factory(test_user)

        # 2. Export Research Package
        response = await client.get(
            f"/api/admin/studies/{study.slug}/export/package",
            headers=headers,
        )
        assert response.status_code == 200
        assert "application/zip" in response.headers["content-type"]

        # 3. Verify ZIP Content
        zip_content = io.BytesIO(response.content)
        with zipfile.ZipFile(zip_content, "r") as z:
            filenames = z.namelist()
            assert "data_all.csv" in filenames
            assert "codebook.txt" in filenames
            assert "statements.csv" in filenames
            assert f"pqmethod/{study.slug}.sta" in filenames
            assert "r_kit/analysis.R" in filenames

    async def test_export_participant_csv_not_found(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
    ):
        """Test that exporting a non-existent participant returns 404."""
        headers = auth_token_factory(test_user)
        response = await client.get(
            f"/api/admin/studies/{seed_study.slug}/participants/99999/export/csv",
            headers=headers,
        )
        assert response.status_code == 404

    async def test_export_cross_workspace_forbidden(
        self,
        client: AsyncClient,
        user_factory,
        workspace_factory,
        study_factory,
        auth_token_factory,
    ):
        """Ensure admin of Workspace B cannot export Study from Workspace A."""
        # Workspace A & Study A
        user_a = await user_factory()
        ws_a = await workspace_factory(owner=user_a)
        study_a = await study_factory(workspace=ws_a, owner=user_a)

        # Workspace B & User B (Admin of B, unrelated to A)
        user_b = await user_factory()
        await workspace_factory(owner=user_b)

        headers_b = auth_token_factory(user_b)

        # Attempt to export Study A
        response = await client.get(
            f"/api/admin/studies/{study_a.slug}/export/csv", headers=headers_b
        )

        # Should be 404 (Not Found / Access Denied) or 403
        assert response.status_code in [403, 404]

    async def test_export_zip_success(
        self,
        client: AsyncClient,
        test_user: User,
        seed_study: Study,
        auth_token_factory,
    ):
        headers = auth_token_factory(test_user)
        response = await client.get(
            f"/api/admin/studies/{seed_study.slug}/export/pqmethod", headers=headers
        )
        assert response.status_code == 200
        assert "application/zip" in response.headers["content-type"]

    async def test_export_unauthorized(
        self, client: AsyncClient, user_factory, seed_study: Study, auth_token_factory
    ):
        # User who is not a collaborator
        other_user = await user_factory(email="hacker@test.com")
        headers = auth_token_factory(other_user)

        response = await client.get(
            f"/api/admin/studies/{seed_study.slug}/dump", headers=headers
        )
        # check_study_permission returns 404 for studies you can't see
        assert response.status_code == 404
