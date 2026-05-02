"""Dependency injection definitions."""

from collections.abc import Callable, Coroutine
from typing import TYPE_CHECKING, Annotated, Any, cast

import jwt
from fastapi import Depends, HTTPException, Path, Query, status, Header
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.database import get_db
from app.models import (
    Study,
    StudyRole,
    User,
    ProjectMember,
    ProjectRole,
)

if TYPE_CHECKING:
    from app.models import Project
from app.schemas import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    """Validate JWT token and retrieve the current user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        email: str = cast(str, sub)
        token_data = TokenData(email=email)
    except InvalidTokenError:
        raise credentials_exception

    query = select(User).where(User.email == token_data.email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Validate that the user is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user"
        )
    return current_user


async def get_current_project(
    x_project_id: str | None = Header(None, alias="X-Project-ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple["Project", ProjectMember]:
    """Validate project context from header and return project + member info."""
    if not x_project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Project-ID header is required",
        )

    try:
        project_id = int(x_project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Project ID"
        )

    from app.models import Project

    # Check permission
    # Query membership
    query = (
        select(Project, ProjectMember)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(Project.id == project_id)
        .where(ProjectMember.user_id == current_user.id)
    )

    result = await db.execute(query)
    row = result.one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this project is denied",
        )

    return cast(tuple[Project, ProjectMember], row)


# --- RBAC Logic ---

ROLE_MAP = {
    ProjectRole.owner: StudyRole.owner,
    ProjectRole.member: StudyRole.editor,
    ProjectRole.viewer: StudyRole.viewer,
}

STUDY_ROLE_HIERARCHY = {
    StudyRole.owner: 30,
    StudyRole.editor: 20,
    StudyRole.viewer: 10,
}


PROJECT_ROLE_HIERARCHY = {
    ProjectRole.owner: 40,
    ProjectRole.member: 20,
    ProjectRole.viewer: 10,
}


async def check_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency to ensure the current user is a superuser."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser privileges required",
        )
    return current_user


def require_project_role(
    required_role: ProjectRole,
) -> Callable[..., Coroutine[Any, Any, tuple["Project", ProjectMember]]]:
    """Factory creating a dependency that validates project role from the X-Project-ID header.

    Returns the (Project, ProjectMember) tuple if the user has the required role.
    """

    async def dependency(
        project_ctx: tuple["Project", ProjectMember] = Depends(get_current_project),
    ) -> tuple["Project", ProjectMember]:
        _, member = project_ctx
        required_level = PROJECT_ROLE_HIERARCHY[required_role]
        user_level = PROJECT_ROLE_HIERARCHY[member.role]

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {required_role.value}",
            )

        return project_ctx

    return dependency


def check_project_permission(
    required_role: ProjectRole,
) -> Callable[..., Coroutine[Any, Any, "Project"]]:
    """Factory creating a dependency to verify project access."""

    async def permission_dependency(
        slug: str = Path(..., description="The slug of the project"),
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> "Project":
        """Dependency that returns the Project if the user has required project role."""
        from app.models import Project

        query = (
            select(Project, ProjectMember)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(Project.slug == slug)
            .where(ProjectMember.user_id == current_user.id)
        )

        result = await db.execute(query)
        row = result.one_or_none()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found or access denied",
            )

        project, member = row

        # Check Role Hierarchy
        required_level = PROJECT_ROLE_HIERARCHY[required_role]
        user_level = PROJECT_ROLE_HIERARCHY[member.role]

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {required_role.value}",
            )

        return cast(Project, project)

    return permission_dependency


def check_study_permission(
    required_role: StudyRole,
) -> Callable[..., Coroutine[Any, Any, Study]]:
    """Factory creating a dependency to verify study access."""

    async def permission_dependency(
        slug: str = Path(..., description="The slug of the study"),
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> Study:
        """Dependency that returns the Study if the user has required study role (via Project)."""
        # Strategy: Check Project Membership for the Study's Project
        query = (
            select(Study, ProjectMember)
            .join(Study.project)
            .join(ProjectMember, ProjectMember.project_id == Study.project_id)
            .options(selectinload(Study.project))
            .where(Study.slug == slug)
            .where(ProjectMember.user_id == current_user.id)
        )

        result = await db.execute(query)
        row = result.one_or_none()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Study not found or access denied",
            )

        study, member = row

        # Map ProjectRole to StudyRole equivalent for hierarchy check
        # We use strict mapping or hierarchy
        # Project Owner/Admin -> Study Owner
        # Project Researcher -> Study Editor
        # Project Viewer -> Study Viewer

        effective_study_role = ROLE_MAP.get(member.role, StudyRole.viewer)

        required_level = STUDY_ROLE_HIERARCHY[required_role]
        user_level = STUDY_ROLE_HIERARCHY[effective_study_role]

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {required_role.value} (via Project Role)",
            )

        return cast(Study, study)

    return permission_dependency


# --- Pagination ---

MAX_PAGE_SIZE = 100


class PaginationParams(BaseModel):
    """Validated pagination parameters with bounded limit."""

    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 50
    offset: Annotated[int, Query(ge=0)] = 0
