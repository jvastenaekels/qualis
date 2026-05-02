# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2026 Julien Vastenaekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Project membership quota helpers.

Spec: docs/superpowers/specs/2026-05-02-project-roles-refactor-design.md §5.
"""

from __future__ import annotations

from typing import TypedDict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.exceptions import QuotaExceeded
from app.models import ProjectMember, ProjectRole, User


class QuotaState(TypedDict):
    count: int
    limit: int | None  # None == unlimited (or superuser bypass)


def _resolve_limit(raw: int) -> int | None:
    """Translate the `0`-means-unlimited sentinel to `None`."""
    return raw if raw > 0 else None


async def _count_members(db: AsyncSession, project_id: int) -> int:
    stmt = (
        select(func.count())
        .select_from(ProjectMember)
        .where(ProjectMember.project_id == project_id)
    )
    return int((await db.execute(stmt)).scalar_one())


async def _count_owned_projects(db: AsyncSession, user_id: int) -> int:
    stmt = (
        select(func.count())
        .select_from(ProjectMember)
        .where(
            ProjectMember.user_id == user_id,
            ProjectMember.role == ProjectRole.owner,
        )
    )
    return int((await db.execute(stmt)).scalar_one())


async def get_member_quota_state(
    db: AsyncSession, project_id: int, current_user: User
) -> QuotaState:
    count = await _count_members(db, project_id)
    if current_user.is_superuser:
        return {"count": count, "limit": None}
    return {
        "count": count,
        "limit": _resolve_limit(settings.MAX_MEMBERS_PER_PROJECT),
    }


async def get_owned_project_quota_state(
    db: AsyncSession, current_user: User
) -> QuotaState:
    count = await _count_owned_projects(db, current_user.id)
    if current_user.is_superuser:
        return {"count": count, "limit": None}
    return {
        "count": count,
        "limit": _resolve_limit(settings.MAX_PROJECTS_AS_OWNER),
    }


async def assert_can_add_member(
    db: AsyncSession, project_id: int, current_user: User
) -> None:
    if current_user.is_superuser:
        return
    limit = _resolve_limit(settings.MAX_MEMBERS_PER_PROJECT)
    if limit is None:
        return
    count = await _count_members(db, project_id)
    if count >= limit:
        raise QuotaExceeded(
            code="MEMBER_LIMIT_REACHED",
            message=f"Project member limit reached ({count}/{limit}).",
        )


async def assert_can_create_owned_project(db: AsyncSession, current_user: User) -> None:
    if current_user.is_superuser:
        return
    limit = _resolve_limit(settings.MAX_PROJECTS_AS_OWNER)
    if limit is None:
        return
    count = await _count_owned_projects(db, current_user.id)
    if count >= limit:
        raise QuotaExceeded(
            code="OWNER_PROJECT_LIMIT_REACHED",
            message=f"You can't own more than {limit} projects (currently {count}).",
        )
