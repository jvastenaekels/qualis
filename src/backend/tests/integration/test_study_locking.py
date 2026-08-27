import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Study, StudyState, Participant, User, Project
from datetime import datetime, timezone


@pytest.mark.asyncio
async def test_study_locking_logic(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    test_project: Project,
    auth_token_factory,
):
    """
    Test that study design (grid/statements) is editable when no participants
    exist, and locked once any participant is created.
    """
    headers = {
        **auth_token_factory(test_user),
        "X-Project-ID": str(test_project.id),
    }

    from app.models import Statement, StatementTranslation, StudyTranslation

    # 1. Create a study in DRAFT
    study = Study(
        slug="lock-test",
        project_id=test_project.id,
        state=StudyState.draft,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    db.add(
        StudyTranslation(
            study_id=study.id, language_code="en", title="T1", description=""
        )
    )
    s1 = Statement(study_id=study.id, code="S1")
    db.add(s1)
    await db.flush()
    db.add(
        StatementTranslation(
            statement_id=s1.id, language_code="en", text="Original Text"
        )
    )

    await db.commit()
    await db.refresh(study)
    study_slug = study.slug

    # 2. Update grid (SHOULD BE ALLOWED - no participants)
    new_grid = [{"score": 0, "capacity": 2}]
    response = await client.patch(
        f"/api/admin/studies/{study_slug}",
        json={"grid_config": new_grid},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["grid_config"] == new_grid

    # 3. Add a real participant
    p_real = Participant(
        study_id=study.id,
        language_used="en",
        created_at=datetime.now(timezone.utc),
    )
    db.add(p_real)
    await db.commit()

    # 4. Update grid (SHOULD FAIL - participants exist)
    final_grid = [{"score": 0, "capacity": 4}]
    response = await client.patch(
        f"/api/admin/studies/{study_slug}",
        json={"grid_config": final_grid},
        headers=headers,
    )
    assert response.status_code == 400
    json_resp = response.json()
    assert "Cannot modify grid configuration" in json_resp["message"]

    # 5. Try to change statements structurally (SHOULD FAIL)
    response = await client.patch(
        f"/api/admin/studies/{study_slug}",
        json={
            "statements": [
                {"code": "S1", "translations": [{"language_code": "en", "text": "S1"}]},
                {
                    "code": "S2",
                    "translations": [{"language_code": "en", "text": "New S2"}],
                },
            ]
        },
        headers=headers,
    )
    assert response.status_code == 400

    # 6. Verify participant_count in StudyRead (only counts completed, non-discarded)
    response = await client.get(f"/api/admin/studies/{study_slug}", headers=headers)
    assert response.status_code == 200
    assert response.json()["participant_count"] == 0

    # 7. Try to change statement TEXT (SHOULD BE ALLOWED - non-structural)
    response = await client.patch(
        f"/api/admin/studies/{study_slug}",
        json={
            "statements": [
                {
                    "code": "S1",
                    "translations": [
                        {"language_code": "en", "text": "New Text for S1"}
                    ],
                }
            ]
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert (
        response.json()["statements"][0]["translations"][0]["text"] == "New Text for S1"
    )
