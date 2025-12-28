"""Integration tests for admin study exports."""
import io
import zipfile

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Participant,
    ParticipantStatus,
    QSortEntry,
    Statement,
    Study,
    StudyCollaborator,
    StudyRole,
    User,
)
from app.utils.security import create_access_token


@pytest_asyncio.fixture
async def export_ready_study(db: AsyncSession, test_user: User):
    """Creates a study with statements and participant data for export tests."""
    # 1. Study
    study = Study(
        slug="export-study",
        owner_id=test_user.id,
        state="active",
        grid_config={"0": 2, "1": 1},
        presort_config={"age": "number"},
        postsort_config={"comment": "text"},
    )
    db.add(study)
    await db.flush()

    # Add owner as collaborator
    collab = StudyCollaborator(
        study_id=study.id, user_id=test_user.id, role=StudyRole.owner
    )
    db.add(collab)

    # 2. Statements
    stmts = [
        Statement(study_id=study.id, code="S1"),
        Statement(study_id=study.id, code="S2"),
        Statement(study_id=study.id, code="S3"),
    ]
    db.add_all(stmts)
    await db.flush()

    # 3. Participant
    p = Participant(
        study_id=study.id,
        language_used="en",
        status=ParticipantStatus.completed,
        presort_answers={"age": 25},
        postsort_answers={"comment": "Great study"},
        confirmation_code="TEST1234",
    )
    db.add(p)
    await db.flush()

    # 4. Q-Sort entries
    entries = [
        QSortEntry(participant_id=p.id, statement_id=stmts[0].id, grid_score=0),
        QSortEntry(participant_id=p.id, statement_id=stmts[1].id, grid_score=0),
        QSortEntry(participant_id=p.id, statement_id=stmts[2].id, grid_score=1),
    ]
    db.add_all(entries)
    await db.commit()
    return study


@pytest.mark.asyncio
async def test_export_csv_success(
    client: AsyncClient, test_user: User, export_ready_study: Study
):
    """Test successful CSV export."""
    access_token = create_access_token(subject=test_user.email)
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await client.get(
        f"/api/admin/studies/{export_ready_study.slug}/export/csv", headers=headers
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert "attachment" in response.headers["content-disposition"]

    content = response.text
    # Check headers
    assert "Participant_UID" in content
    assert "Confirmation_Code" in content
    assert "S1" in content
    assert "Pre_age" in content
    assert "Post_comment" in content

    # Check data row
    assert "TEST1234" in content
    assert "25" in content
    assert "Great study" in content


@pytest.mark.asyncio
async def test_export_pqmethod_success(
    client: AsyncClient, test_user: User, export_ready_study: Study
):
    """Test successful PQMethod ZIP export."""
    access_token = create_access_token(subject=test_user.email)
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await client.get(
        f"/api/admin/studies/{export_ready_study.slug}/export/pqmethod", headers=headers
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    # Verify ZIP content
    zip_bytes = io.BytesIO(response.content)
    with zipfile.ZipFile(zip_bytes) as z:
        file_list = z.namelist()
        assert f"{export_ready_study.slug}.sta" in file_list
        assert f"{export_ready_study.slug}.dat" in file_list

        # Check .dat content
        with z.open(f"{export_ready_study.slug}.dat") as dat_file:
            dat_content = dat_file.read().decode()
            # Header line: slug (8 chars), N units (3 chars), N items (3 chars)
            assert export_ready_study.slug[:8] in dat_content
            assert "  1" in dat_content  # N units
            assert "  3" in dat_content  # N items


@pytest.mark.asyncio
async def test_export_rbac_denied(
    client: AsyncClient, db: AsyncSession, export_ready_study: Study
):
    """Test that a viewer cannot export data."""
    # Create another user as viewer
    viewer_user = User(email="viewer@example.com", hashed_password="hashedpassword")
    db.add(viewer_user)
    await db.flush()
    collab = StudyCollaborator(
        study_id=export_ready_study.id, user_id=viewer_user.id, role=StudyRole.viewer
    )
    db.add(collab)
    await db.commit()

    access_token = create_access_token(subject=viewer_user.email)
    headers = {"Authorization": f"Bearer {access_token}"}

    response = await client.get(
        f"/api/admin/studies/{export_ready_study.slug}/export/csv", headers=headers
    )
    assert response.status_code == 403
    assert "Insufficient permissions" in response.json()["detail"]
