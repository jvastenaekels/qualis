"""Comprehensive integration tests for exports router.

Target: >90% coverage for routers/admin/exports.py
"""

import io
import zipfile

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Participant,
    ParticipantStatus,
    QSortEntry,
    Statement,
    StatementTranslation,
    Study,
    StudyRole,
)


class TestCSVExport:
    """Tests for GET /api/admin/studies/{slug}/export/csv"""

    @pytest.mark.asyncio
    async def test_csv_export_success(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Editor can export CSV with participant data."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)

        # Add statement
        stmt = Statement(study_id=study.id, code="S1")
        db.add(stmt)
        await db.flush()
        db.add(StatementTranslation(statement_id=stmt.id, language_code="en", text="S1"))

        # Add participant
        p = Participant(
            study_id=study.id,
            language_used="en",
            status=ParticipantStatus.completed,
            confirmation_code="ABC123",
        )
        db.add(p)
        await db.flush()
        db.add(QSortEntry(participant_id=p.id, statement_id=stmt.id, grid_score=0))
        await db.commit()

        headers = auth_token_factory(owner)
        response = await client.get(
            f"/api/admin/studies/{study.slug}/export/csv", headers=headers
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert "ABC123" in response.text

    @pytest.mark.asyncio
    async def test_csv_export_viewer_forbidden(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Viewer cannot export CSV."""
        owner = await user_factory()
        viewer = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)
        await study_collaborator_factory(study, viewer, StudyRole.viewer)

        headers = auth_token_factory(viewer)
        response = await client.get(
            f"/api/admin/studies/{study.slug}/export/csv", headers=headers
        )
        assert response.status_code == 403


class TestPQMethodExport:
    """Tests for GET /api/admin/studies/{slug}/export/pqmethod"""

    @pytest.mark.asyncio
    async def test_pqmethod_export_success(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Editor can export PQMethod ZIP."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)

        # Add statement with translation
        stmt = Statement(study_id=study.id, code="S1")
        db.add(stmt)
        await db.flush()
        db.add(StatementTranslation(statement_id=stmt.id, language_code="en", text="Statement 1"))
        await db.commit()

        headers = auth_token_factory(owner)
        response = await client.get(
            f"/api/admin/studies/{study.slug}/export/pqmethod", headers=headers
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

        # Verify ZIP structure
        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            files = zf.namelist()
            assert f"{study.slug}.sta" in files
            assert f"{study.slug}.dat" in files
            assert f"{study.slug}.ans" in files


class TestRKitExport:
    """Tests for GET /api/admin/studies/{slug}/export/r-kit"""

    @pytest.mark.asyncio
    async def test_rkit_export_success(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Editor can export R-Kit ZIP."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)

        # Add statement
        stmt = Statement(study_id=study.id, code="S1")
        db.add(stmt)
        await db.flush()
        db.add(StatementTranslation(statement_id=stmt.id, language_code="en", text="S1"))
        await db.commit()

        headers = auth_token_factory(owner)
        response = await client.get(
            f"/api/admin/studies/{study.slug}/export/r-kit", headers=headers
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"

        # Verify ZIP structure
        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            files = zf.namelist()
            assert "q_data.csv" in files
            assert "analysis.R" in files


class TestStudyDump:
    """Tests for GET /api/admin/studies/{slug}/dump"""

    @pytest.mark.asyncio
    async def test_dump_returns_json(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        workspace_factory,
        study_factory,
        study_collaborator_factory,
        auth_token_factory,
    ):
        """Dump endpoint returns JSON with study data."""
        owner = await user_factory()
        workspace = await workspace_factory(owner=owner)
        study = await study_factory(workspace=workspace, owner=owner)
        await study_collaborator_factory(study, owner, StudyRole.owner)

        headers = auth_token_factory(owner)
        response = await client.get(
            f"/api/admin/studies/{study.slug}/dump", headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "study" in data
        assert "participants" in data
