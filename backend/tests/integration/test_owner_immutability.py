"""Owner role is set at project creation and cannot be assigned via API.

Spec: docs/superpowers/specs/2026-05-02-project-roles-refactor-design.md §4.4.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, ProjectMember, ProjectRole, User


@pytest.mark.asyncio
async def test_patch_member_role_to_owner_is_rejected(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    test_project: Project,
    user_factory,
    project_member_factory,
    auth_token_factory,
) -> None:
    member_user = await user_factory(email="member@example.com")
    await project_member_factory(test_project, member_user, ProjectRole.member)
    headers = auth_token_factory(test_user)

    response = await client.patch(
        f"/api/admin/projects/{test_project.slug}/members/{member_user.id}",
        json={"role": "owner"},
        headers=headers,
    )
    assert response.status_code == 400
    body = response.json()
    # The standard error middleware (app/middleware/errors.py) maps
    # HTTPException.detail to the `message` field of StandardError.
    assert body["message"] == "OWNER_ROLE_IMMUTABLE"


@pytest.mark.asyncio
async def test_create_invitation_with_owner_role_is_rejected(
    client: AsyncClient,
    test_user: User,
    test_project: Project,
    auth_token_factory,
) -> None:
    headers = auth_token_factory(test_user)

    response = await client.post(
        f"/api/admin/projects/{test_project.slug}/invitations",
        json={"email": "newcomer@example.com", "role": "owner"},
        headers=headers,
    )
    assert response.status_code == 400
    body = response.json()
    # The standard error middleware (app/middleware/errors.py) maps
    # HTTPException.detail to the `message` field of StandardError.
    assert body["message"] == "OWNER_ROLE_IMMUTABLE"


@pytest.mark.asyncio
async def test_db_unique_owner_partial_index(
    db: AsyncSession,
    test_project: Project,
    user_factory,
) -> None:
    # The Alembic migration `cb2c7f6f0cfe_rename_researcher_to_member_and_owner_uniqueness`
    # installs a partial unique index that allows at most one owner per project.
    # The test fixture uses `Base.metadata.create_all` rather than running the
    # migrations, so we install the index here so the assertion is meaningful
    # against the real production schema invariant.
    await db.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "project_members_one_owner_per_project "
            "ON project_members (project_id) WHERE role = 'owner'"
        )
    )
    await db.commit()

    # Direct DB insert of a second owner must violate the partial unique index.
    second_user = await user_factory(email="second-owner@example.com")
    db.add(
        ProjectMember(
            project_id=test_project.id,
            user_id=second_user.id,
            role=ProjectRole.owner,
        )
    )
    with pytest.raises(Exception) as exc:
        await db.commit()
    assert (
        "project_members_one_owner_per_project" in str(exc.value).lower()
        or "unique" in str(exc.value).lower()
    )
