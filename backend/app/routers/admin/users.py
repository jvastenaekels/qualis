"""API router for administrative user management."""

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import get_db
from ...dependencies import PaginationParams, check_superuser
from ...limiter import limiter
from ...models import User
from ...schemas import UserCreate, UserRead
from ...schemas.common import PaginatedResponse
from ...schemas.users import UserAdminUpdate, UserReadAdmin
from ...services.admin_user_service import (
    AdminUserError,
    assert_can_deactivate,
    assert_can_demote_superuser,
    assert_can_promote_superuser,
    force_password_reset,
)
from ...utils.audit import log_admin_action
from ...utils.security import get_password_hash

router = APIRouter(tags=["Admin Users"])


@router.get("", response_model=PaginatedResponse[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(check_superuser),
    pagination: PaginationParams = Depends(),
) -> PaginatedResponse[UserRead]:
    """List all users in the system with pagination."""
    count_result = await db.execute(select(func.count(User.id)))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(User).limit(pagination.limit).offset(pagination.offset)
    )
    items = list(result.scalars().all())

    # FastAPI serialises User → UserRead via response_model; cast aligns mypy.
    return cast(
        PaginatedResponse[UserRead],
        PaginatedResponse(
            items=items, total=total, limit=pagination.limit, offset=pagination.offset
        ),
    )


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def create_user(
    request: Request,
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(check_superuser),
) -> User:
    """Create a new user."""
    # Check if user already exists
    existing_check = await db.execute(select(User).where(User.email == user_in.email))
    if existing_check.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        is_active=user_in.is_active,
        is_superuser=user_in.is_superuser,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    log_admin_action(
        actor_user_id=admin.id,
        action="create",
        resource="user",
        resource_id=new_user.id,
        is_superuser=new_user.is_superuser,
        is_active=new_user.is_active,
    )
    return new_user


@router.patch("/{user_id}", response_model=UserReadAdmin)
@limiter.limit("30/minute")
async def patch_user(
    request: Request,
    user_id: int,
    patch: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_superuser),
) -> User:
    """Superuser-only flag update. One field at a time is fine.

    - is_active: toggle. Deactivating immediately invalidates the
      target's bearer tokens (Task 3).
    - is_superuser: toggle. Promotion requires the target to have 2FA
      enabled. Demotion is refused if it would leave the platform
      without an active superuser, or if you're demoting yourself.
    - full_name: free text, 1-100 chars.

    CONCURRENCY: the ``assert_can_*`` guards, the flag mutation, and the
    single ``db.commit()`` all run against the one request-scoped session
    with NO intervening commit/rollback. ``_count_active_superusers``
    takes ``FOR UPDATE`` row locks that must be held until this commit,
    so demote/deactivate requests serialize and the "at least one active
    superuser" floor cannot be raced to zero. Do not introduce an early
    commit/rollback between the asserts and the final commit.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        if patch.is_active is False:
            await assert_can_deactivate(db=db, actor=current_user, target=target)
        if patch.is_superuser is True:
            await assert_can_promote_superuser(
                db=db, actor=current_user, target=target
            )
        if patch.is_superuser is False:
            await assert_can_demote_superuser(
                db=db, actor=current_user, target=target
            )
    except AdminUserError as e:
        raise HTTPException(status_code=400, detail=str(e))

    changes: dict[str, object] = {}
    if patch.is_active is not None and patch.is_active != target.is_active:
        target.is_active = patch.is_active
        changes["is_active"] = patch.is_active
    if patch.is_superuser is not None and patch.is_superuser != target.is_superuser:
        target.is_superuser = patch.is_superuser
        changes["is_superuser"] = patch.is_superuser
    if patch.full_name is not None and patch.full_name != target.full_name:
        target.full_name = patch.full_name
        changes["full_name"] = patch.full_name

    await db.commit()
    await db.refresh(target)

    if changes:
        log_admin_action(
            actor_user_id=current_user.id,
            action="patch",
            resource="user",
            resource_id=target.id,
            **changes,
        )
    return target


@router.post(
    "/{user_id}/force-password-reset", status_code=status.HTTP_204_NO_CONTENT
)
@limiter.limit("30/minute")
async def force_password_reset_endpoint(
    request: Request,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_superuser),
) -> None:
    """Superuser-only: force-rotate the target's password and invalidate
    every existing access token (F-03-010 via ``password_changed_at``).

    The heavy lifting lives in ``admin_user_service.force_password_reset``,
    which commits the session itself (fail-locked: the rotation persists
    even if SMTP is down — the email send follows the commit by design).
    """
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    await force_password_reset(db=db, target=target)
    log_admin_action(
        actor_user_id=current_user.id,
        action="force_password_reset",
        resource="user",
        resource_id=target.id,
    )
    return None


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_user(
    request: Request,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_superuser),
) -> None:
    """Delete a user. Cannot delete self."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()
    log_admin_action(
        actor_user_id=current_user.id,
        action="delete",
        resource="user",
        resource_id=user_id,
        target_email=user.email,
    )
    return None
