"""Dependency injection definitions."""

from collections.abc import Callable
from typing import cast

import jwt
from fastapi import Depends, HTTPException, Path, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database import get_db
from app.models import (
    Study,
    User,
    WorkspaceMember,
    WorkspaceRole,
    StudyCollaborator,
    StudyRole,
)
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


# --- RBAC Logic ---

ROLE_MAP = {
    WorkspaceRole.admin: StudyRole.owner,
    WorkspaceRole.researcher: StudyRole.editor,
    WorkspaceRole.viewer: StudyRole.viewer,
}

STUDY_ROLE_HIERARCHY = {
    StudyRole.owner: 30,
    StudyRole.editor: 20,
    StudyRole.viewer: 10,
}


def check_study_permission(required_role: StudyRole) -> Callable:
    """Factory creating a dependency to verify study access."""

    async def permission_dependency(
        slug: str = Path(..., description="The slug of the study"),
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> Study:
        """Dependency that returns the Study if the user has required study role."""
        # Check StudyCollaborator table
        query = (
            select(Study, StudyCollaborator)
            .join(StudyCollaborator, StudyCollaborator.study_id == Study.id)
            .where(Study.slug == slug)
            .where(StudyCollaborator.user_id == current_user.id)
        )

        result = await db.execute(query)
        row = result.one_or_none()

        if not row:
            # Fallback for Workspace Admins/Superusers?
            # In Phase 4, we want Study-level focus, but let's allow legacy Workspace Admin for now
            # to avoid locking out existing users before full migration.
            ws_query = (
                select(Study, WorkspaceMember)
                .join(Study.workspace)
                .join(
                    WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id
                )
                .where(Study.slug == slug)
                .where(WorkspaceMember.user_id == current_user.id)
            )
            ws_result = await db.execute(ws_query)
            ws_row = ws_result.one_or_none()

            if not ws_row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Study not found or access denied",
                )

            study, member = ws_row
            # Fallback: Map WorkspaceRole to StudyRole
            mapped_role = ROLE_MAP.get(member.role)
            if not mapped_role:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
                )

            user_level = STUDY_ROLE_HIERARCHY[mapped_role]
            required_level = STUDY_ROLE_HIERARCHY[required_role]

            if user_level < required_level:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Insufficient permissions. Required: {required_role.value}",
                )

            return cast(Study, study)

        study, collaborator = row

        # Check Role Hierarchy
        required_level = STUDY_ROLE_HIERARCHY[required_role]
        user_level = STUDY_ROLE_HIERARCHY[collaborator.role]

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {required_role.value}",
            )

        return cast(Study, study)

    return permission_dependency
