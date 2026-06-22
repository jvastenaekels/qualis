"""Dependency injection definitions."""

from collections.abc import Callable, Coroutine
from typing import TYPE_CHECKING, Annotated, Any, cast

from fastapi import Depends, HTTPException, Path, Query, status, Header
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    Study,
    StudyRole,
    User,
    ProjectMember,
    ProjectRole,
)
from app.utils.security import decode_access_token

if TYPE_CHECKING:
    from app.models import Project
from app.schemas import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    """Validate JWT token and retrieve the current user.

    Beyond the signature/expiry check, we re-validate the token's
    ``iat`` claim against ``user.password_changed_at`` (F-03-010): a
    token issued before the user's last password rotation is rejected
    so a password reset / change effectively kills in-flight access
    tokens. Legacy tokens (no ``iat`` claim) are treated as iat=0;
    because ``password_changed_at`` is set at user creation
    (``server_default=NOW()``), every legacy token is rejected on the
    first request after this code rolls out. This is the intentional
    upgrade cliff — legacy holders re-login once.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
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

    # F-03-010: reject access tokens minted before the user's current
    # password_changed_at. Legacy tokens with no iat claim default to 0
    # (epoch) so they are also rejected after the next password change.
    # Equality (iat == pwa) is allowed: at one-second resolution, an
    # issue and a rotation occurring in the same wall-clock second
    # must not invalidate each other (false-rejection guard).
    token_iat_raw = payload.get("iat")
    token_iat = int(token_iat_raw) if token_iat_raw is not None else 0
    pwa_epoch = int(user.password_changed_at.timestamp())
    if token_iat < pwa_epoch:
        raise credentials_exception

    # Deactivated users are locked out at the dependency level, not just at
    # ``get_current_active_user``: a flipped ``is_active=False`` must
    # invalidate in-flight access tokens against EVERY bearer-token endpoint,
    # not only the ones that opt into the active-user dep. Same 401 as the
    # iat-vs-pwa branch above, so there is no enumeration channel.
    if not user.is_active:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Validate that the user is active."""
    # Defense-in-depth: unreachable for token-bearing deactivated users
    # since get_current_user already 401s on is_active=False. Kept as a
    # belt-and-braces guard; do not rely on this 400 as a contract.
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


def project_role_satisfies(user_role: ProjectRole, required: ProjectRole) -> bool:
    """True if user_role ranks at or above required in the project hierarchy."""
    return PROJECT_ROLE_HIERARCHY[user_role] >= PROJECT_ROLE_HIERARCHY[required]


def study_role_satisfies_via_project(
    user_project_role: ProjectRole, required: StudyRole
) -> bool:
    """True if a project role, mapped to its effective study role, ranks at or
    above the required study role."""
    effective = ROLE_MAP.get(user_project_role, StudyRole.viewer)
    return STUDY_ROLE_HIERARCHY[effective] >= STUDY_ROLE_HIERARCHY[required]


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

        if not project_role_satisfies(member.role, required_role):
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

        if not project_role_satisfies(member.role, required_role):
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

        if not study_role_satisfies_via_project(member.role, required_role):
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
