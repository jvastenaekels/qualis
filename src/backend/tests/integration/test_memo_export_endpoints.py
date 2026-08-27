"""Integration tests for the memo Markdown export endpoints."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Concourse, MemoParentType, Project, Study, User
from app.services.memo_service import MemoService


@pytest_asyncio.fixture
async def memo_concourse(db: AsyncSession, test_project: Project, test_user: User):
    c = Concourse(project_id=test_project.id, title="Export Me")
    db.add(c)
    await db.commit()
    await db.refresh(c)
    await MemoService.add_entry(
        db,
        parent_type=MemoParentType.concourse,
        parent_id=c.id,
        title="Sources canvassed",
        body="We searched X.",
        position=10,
        user_id=test_user.id,
    )
    return c


@pytest.mark.asyncio
class TestMemoExportEndpoints:
    async def test_concourse_export_ok_for_member(
        self, client: AsyncClient, test_user: User, auth_token_factory, memo_concourse
    ):
        headers = auth_token_factory(test_user)
        r = await client.get(
            f"/api/admin/concourses/{memo_concourse.id}/memo/export", headers=headers
        )
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/markdown")
        assert "attachment; filename=" in r.headers["content-disposition"]
        assert "## Sources canvassed" in r.text
        assert "We searched X." in r.text

    async def test_concourse_export_404_for_non_member(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        auth_token_factory,
        memo_concourse,
    ):
        outsider = await user_factory(email="outsider@test.com")
        headers = auth_token_factory(outsider)
        r = await client.get(
            f"/api/admin/concourses/{memo_concourse.id}/memo/export", headers=headers
        )
        assert r.status_code == 404

    async def test_concourse_export_404_for_missing_parent(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        r = await client.get(
            "/api/admin/concourses/999999/memo/export", headers=headers
        )
        assert r.status_code == 404

    async def test_study_export_ok_for_member(
        self,
        client: AsyncClient,
        db: AsyncSession,
        test_user: User,
        auth_token_factory,
        seed_study: Study,
    ):
        await MemoService.add_entry(
            db,
            parent_type=MemoParentType.study,
            parent_id=seed_study.id,
            title="Distribution rationale",
            body="Forced choice.",
            position=10,
            user_id=test_user.id,
        )
        headers = auth_token_factory(test_user)
        r = await client.get(
            f"/api/admin/studies/{seed_study.id}/memo/export", headers=headers
        )
        assert r.status_code == 200
        assert "## Distribution rationale" in r.text
