import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


from app.models import Project, ProjectMember, ProjectRole


@pytest.mark.asyncio
async def test_list_projects(
    client: AsyncClient,
    test_user,
    auth_token_factory,
    db: AsyncSession,
):
    """Test listing projects for a user."""
    # Create a project manually for this user
    proj = Project(title="Test Proj", slug="test-proj")
    db.add(proj)
    await db.flush()

    member = ProjectMember(
        project_id=proj.id, user_id=test_user.id, role=ProjectRole.owner
    )
    db.add(member)
    await db.commit()

    headers = auth_token_factory(test_user)
    response = await client.get("/api/admin/projects", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) >= 1
    assert any(d["slug"] == "test-proj" for d in data["items"])


@pytest.mark.asyncio
async def test_create_project(
    client: AsyncClient,
    test_user,
    auth_token_factory,
):
    """Test creating a new project."""
    headers = auth_token_factory(test_user)
    payload = {"title": "New Project", "slug": "new-project-123"}
    response = await client.post("/api/admin/projects", headers=headers, json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["slug"] == "new-project-123"
    assert data["title"] == "New Project"
    assert len(data["members"]) == 1
    assert data["members"][0]["role"] == "owner"
