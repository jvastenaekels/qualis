"""Dependency injection definitions."""

from collections.abc import Callable
from typing import TYPE_CHECKING, cast

import jwt
from fastapi import Depends, HTTPException, Path, status, Header
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.database import get_db
from app.models import (
    Study,
    StudyRole,
    User,
    WorkspaceMember,
    WorkspaceRole,
)

if TYPE_CHECKING:
    from app.models import Workspace
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
    user = cast(User | None, result.scalar_one_or_none())

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


async def get_current_workspace(
    x_workspace_id: str | None = Header(None, alias="X-Workspace-ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple["Workspace", WorkspaceMember]:
    """Validate workspace context from header and return workspace + member info."""
    if not x_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Workspace-ID header is required",
        )

    try:
        workspace_id = int(x_workspace_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Workspace ID"
        )

    from app.models import Workspace

    # Check permission
    # Query membership
    query = (
        select(Workspace, WorkspaceMember)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(Workspace.id == workspace_id)
        .where(WorkspaceMember.user_id == current_user.id)
    )

    result = await db.execute(query)
    row = result.one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this workspace is denied",
        )

    return cast(tuple[Workspace, WorkspaceMember], row)


# --- RBAC Logic ---

ROLE_MAP = {
    WorkspaceRole.owner: StudyRole.owner,
    WorkspaceRole.researcher: StudyRole.editor,
    WorkspaceRole.viewer: StudyRole.viewer,
}

STUDY_ROLE_HIERARCHY = {
    StudyRole.owner: 30,
    StudyRole.editor: 20,
    StudyRole.viewer: 10,
}


WORKSPACE_ROLE_HIERARCHY = {
    WorkspaceRole.owner: 40,
    WorkspaceRole.researcher: 20,
    WorkspaceRole.viewer: 10,
}


def check_workspace_permission(required_role: WorkspaceRole) -> Callable:
    """Factory creating a dependency to verify workspace access."""

    async def permission_dependency(
        slug: str = Path(..., description="The slug of the workspace"),
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> "Workspace":
        """Dependency that returns the Workspace if the user has required workspace role."""
        from app.models import Workspace

        query = (
            select(Workspace, WorkspaceMember)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(Workspace.slug == slug)
            .where(WorkspaceMember.user_id == current_user.id)
        )

        result = await db.execute(query)
        row = result.one_or_none()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found or access denied",
            )

        workspace, member = row

        # Check Role Hierarchy
        required_level = WORKSPACE_ROLE_HIERARCHY[required_role]
        user_level = WORKSPACE_ROLE_HIERARCHY[member.role]

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {required_role.value}",
            )

        return cast(Workspace, workspace)

    return permission_dependency


def check_study_permission(required_role: StudyRole) -> Callable:
    """Factory creating a dependency to verify study access."""

    async def permission_dependency(
        slug: str = Path(..., description="The slug of the study"),
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> Study:
        """Dependency that returns the Study if the user has required study role (via Workspace)."""
        # Strategy: Check Workspace Membership for the Study's Workspace
        query = (
            select(Study, WorkspaceMember)
            .join(Study.workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
            .options(selectinload(Study.workspace))
            .where(Study.slug == slug)
            .where(WorkspaceMember.user_id == current_user.id)
        )

        result = await db.execute(query)
        row = result.one_or_none()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Study not found or access denied",
            )

        study, member = row

        # Map WorkspaceRole to StudyRole equivalent for hierarchy check
        # We use strict mapping or hierarchy
        # Workspace Owner/Admin -> Study Owner
        # Workspace Researcher -> Study Editor
        # Workspace Viewer -> Study Viewer

        effective_study_role = ROLE_MAP.get(member.role, StudyRole.viewer)

        required_level = STUDY_ROLE_HIERARCHY[required_role]
        user_level = STUDY_ROLE_HIERARCHY[effective_study_role]

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {required_role.value} (via Workspace Role)",
            )

        return cast(Study, study)

    return permission_dependency
