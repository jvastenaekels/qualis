"""API router for administrative user management."""

from datetime import datetime, timedelta, timezone
from typing import cast

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...database import get_db
from ...dependencies import PaginationParams, check_superuser
from ...limiter import limiter
from ...models import User
from ...schemas.common import PaginatedResponse
from ...schemas.users import (
    AccountInvitationCreate,
    AccountInvitationLink,
    AdminSetEmailRequest,
    RecoveryLinkRequest,
    RecoveryLinkResponse,
    UserAdminUpdate,
    UserReadAdmin,
)
from ...services.admin_user_service import (
    AdminUserError,
    assert_can_deactivate,
    assert_can_delete,
    assert_can_demote_superuser,
    assert_can_promote_superuser,
    force_password_reset,
    mint_password_reset_link,
    reset_totp,
    set_user_email,
)
from ...utils.audit import log_admin_action
from ...utils.email import send_account_invitation_email
from ...utils.security import create_invitation_token

router = APIRouter(tags=["Admin Users"])


@router.get("", response_model=PaginatedResponse[UserReadAdmin])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(check_superuser),
    pagination: PaginationParams = Depends(),
) -> PaginatedResponse[UserReadAdmin]:
    """List all users in the system with pagination."""
    count_result = await db.execute(select(func.count(User.id)))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(User).limit(pagination.limit).offset(pagination.offset)
    )
    items = list(result.scalars().all())

    # FastAPI serialises User → UserReadAdmin via response_model; cast aligns mypy.
    return cast(
        PaginatedResponse[UserReadAdmin],
        PaginatedResponse(
            items=items, total=total, limit=pagination.limit, offset=pagination.offset
        ),
    )


@router.post(
    "/invitations",
    response_model=AccountInvitationLink,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def create_account_invitation(
    request: Request,
    invitation_in: AccountInvitationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_superuser),
) -> AccountInvitationLink:
    """Superuser-only: mint a single-use registration link for an address.

    No project is attached and no password is set: the invitee chooses it
    on /register. The e-mail goes out only when SMTP is configured; the
    link is always returned so the superuser can hand it over directly.
    Declared before the ``/{user_id}`` routes. Exact-match ``user_by_email``
    would miss ``A@X.FI`` against ``a@x.fi``, so the lookup folds case here.
    """
    email = str(invitation_in.email).lower()
    existing = await db.execute(select(User.id).where(func.lower(User.email) == email))
    if existing.first() is not None:
        raise HTTPException(status_code=409, detail="email_already_registered")

    expires_delta = timedelta(days=7)
    token = create_invitation_token(
        email=email, role="member", expires_delta=expires_delta
    )
    invite_url = f"{settings.FRONTEND_URL}/register?token={token}"
    if settings.is_smtp_configured:
        background_tasks.add_task(send_account_invitation_email, email, invite_url)

    log_admin_action(
        actor_user_id=current_user.id,
        action="invite",
        resource="user",
        target_email=email,
    )
    return AccountInvitationLink(
        invite_url=invite_url, expires_at=datetime.now(timezone.utc) + expires_delta
    )


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
            await assert_can_promote_superuser(db=db, actor=current_user, target=target)
        if patch.is_superuser is False:
            await assert_can_demote_superuser(db=db, actor=current_user, target=target)
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


@router.post("/{user_id}/force-password-reset", status_code=status.HTTP_204_NO_CONTENT)
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


@router.post("/{user_id}/reset-totp", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def reset_totp_endpoint(
    request: Request,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_superuser),
) -> None:
    """Superuser-only: clear a user's TOTP (lost-authenticator recovery).

    The heavy lifting lives in ``admin_user_service.reset_totp``, which
    commits the session itself. By design it removes ONLY the second
    factor — it does NOT bump ``password_changed_at`` nor invalidate
    existing sessions; it is not a session-revocation tool.

    Allowed on superuser targets; this can transiently leave a superuser
    without 2FA (the 2FA-for-superuser rule is checked at promotion time,
    not continuously). The action is audit-logged.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    await reset_totp(db=db, target=target)
    log_admin_action(
        actor_user_id=current_user.id,
        action="reset_totp",
        resource="user",
        resource_id=target.id,
    )
    return None


@router.post("/{user_id}/recovery-link", response_model=RecoveryLinkResponse)
@limiter.limit("30/minute")
async def recovery_link_endpoint(
    request: Request,
    user_id: int,
    payload: RecoveryLinkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_superuser),
) -> RecoveryLinkResponse:
    """Superuser-only: mint a password-reset link for out-of-band
    delivery (SMTP-optional mode). Does NOT rotate the password and
    persists nothing. Audit-logged on every call."""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    url, expires_at = mint_password_reset_link(target=target)
    log_admin_action(
        actor_user_id=current_user.id,
        action="recovery_link_revealed",
        resource="user",
        resource_id=target.id,
        kind=payload.kind,
    )
    return RecoveryLinkResponse(kind=payload.kind, url=url, expires_at=expires_at)


@router.post("/{user_id}/set-email", response_model=UserReadAdmin)
@limiter.limit("30/minute")
async def set_email_endpoint(
    request: Request,
    user_id: int,
    payload: AdminSetEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_superuser),
) -> User:
    """Superuser-only: set a user's email directly (SMTP-optional path,
    bypasses the F-03-011 dual-confirmation flow by design — the
    superuser is the trust anchor when SMTP may be unavailable). Clears
    any in-flight ``pending_email``. Audit-logged on every call.

    Side effect: the target's existing access tokens carry
    ``sub=old-email``, so they stop validating on the next request
    (user-by-email lookup miss → 401) and the user must re-log in under
    the new address. ``password_changed_at`` is intentionally not bumped
    — an email change is not a credential rotation (consistent with
    F-03-011)."""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    old_email = target.email
    try:
        await set_user_email(db=db, target=target, new_email=str(payload.new_email))
    except AdminUserError:
        raise HTTPException(status_code=409, detail="Email already registered")

    log_admin_action(
        actor_user_id=current_user.id,
        action="admin_set_email",
        resource="user",
        resource_id=target.id,
        old_email=old_email,
        new_email=str(payload.new_email),
    )
    await db.refresh(target)
    return target


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

    try:
        await assert_can_delete(db=db, target=user)
    except AdminUserError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
