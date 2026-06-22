"""Authentication routes."""

from datetime import datetime, timedelta, timezone
from typing import Annotated
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.utils.security import (
    EmailTokenPayload,
    EmailTokenPurpose,
    create_access_token,
    create_email_token,
    decode_email_token,
    verify_password,
    get_password_hash,
    decode_invitation_token,
    generate_totp_secret,
    get_totp_uri,
    verify_totp_token,
)
from app.utils.email import (
    send_email_verification,
    send_password_reset,
    send_register_already_registered,
    send_twofa_disable_link,
    send_twofa_disabled_notification,
)
from app.services.email_change_service import initiate_email_change
from app.services.email_token_consume_service import mark_jti_consumed
from app.utils.audit import log_admin_action
from app.schemas import (
    Token,
    UserRead,
    UserCreate,
    UserCreateResponse,
    UserUpdate,
    PasswordChange,
    PasswordConfirm,
    TOTPSetup,
    TwoFAEnableRequest,
)
from app.schemas.auth import EmailRequest, EmailTokenSubmit, PasswordResetConfirm
from app.schemas.responses import AckResponse, TOTPEnableResponse
from app.limiter import limiter, email_hash_key_func_sync, _get_real_ip
from fastapi import Request

router = APIRouter()
logger = logging.getLogger(__name__)

# F-03-005: Decoy bcrypt hash used to equalise /token timing on the
# unknown-email branch. ``verify_password`` against this hash takes the
# same wall-clock as a real bcrypt check (cost factor 12), so the two
# 401-arms — "no such user" and "wrong password" — become
# indistinguishable by request latency. The hash is the bcrypt of a
# random throwaway string and never authenticates anything (no user
# row carries it). Generated once with ``bcrypt.hashpw(b"do-not-use-
# this-password-it-is-a-decoy", bcrypt.gensalt())``.
_LOGIN_DECOY_HASH = "$2b$12$OVGfAcV/ZbLQp6LJiJlMaOR324VnwW6bO.HTcA6VVP4ryk1FnXvYS"


def _decode_email_token_or_400(
    token: str, purpose: EmailTokenPurpose
) -> EmailTokenPayload:
    """Decode an auth-email JWT, raising HTTPException(400) on any failure.

    Consolidates the identical decode/except block shared by the five
    email-token consume endpoints (audit J3). Behaviour is unchanged: a
    ValueError from decode_email_token surfaces as 400 with its message.
    """
    try:
        return decode_email_token(token, expected_purpose=purpose)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me", response_model=UserRead)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserRead:
    """Get current active user."""
    return UserRead.model_validate(current_user)


@router.post("/token", response_model=Token)
@limiter.limit("5/minute")
async def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    x_totp_token: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """
    OAuth2 compatible token login, getting an access token for future requests.

    Validation Flow:
    1. Verify username (email) and password.
    2. If the user has 2FA enabled:
       - Check for `x-totp-token` header.
       - If missing, return a special Token response indicating `requires_2fa=True`.
       - If present, verify the TOTP token.
    3. If all checks pass, issue a Bearer access token.
    """
    # 1. Fetch user
    query = select(User).where(User.email == form_data.username)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    # 2. Authenticate — branch must take comparable wall-clock on both
    # arms, otherwise a /token caller can enumerate registered emails
    # by request latency (F-03-005). The known arm runs bcrypt against
    # the user's stored hash; the unknown arm runs bcrypt against a
    # fixed decoy hash and discards the result. The cost-12 hash is
    # the dominant ~150 ms term in either path, so the timing channel
    # collapses.
    if user is None:
        verify_password(form_data.password, _LOGIN_DECOY_HASH)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2.6 Email verification gate (added by T10 of auth-email-flows).
    # Must run AFTER password check so wrong-password against an unverified
    # account returns 401, not 403 (preventing account enumeration via the
    # response code). The gate is conditional on `email_verification_active`
    # — i.e. only fires when EMAIL_VERIFICATION_REQUIRED=True AND SMTP is
    # configured. Otherwise an SMTP-unconfigured deployment would lock out
    # every user (no way to deliver the verification link).
    if settings.email_verification_active and user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="email_not_verified",
        )

    # 2.5 Check 2FA (TOTP authenticator app).
    if user.is_totp_enabled:
        if not x_totp_token:
            return Token(requires_2fa=True)

        if not user.totp_secret or not verify_totp_token(
            user.totp_secret, x_totp_token
        ):
            log_admin_action(
                actor_user_id=user.id,
                action="twofa_login_failed",
                resource="user",
                resource_id=user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid_2fa",
            )

    # 3. Create Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )

    # Record successful login for operator visibility and dormant-account
    # detection. Only on the full-success path: not on requires_2fa
    # responses (no session issued), not on wrong-password/wrong-2FA.
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    # token_type "bearer" is the OAuth2 literal, not a credential.
    return Token(access_token=access_token, token_type="bearer")  # nosec B106


def _build_anti_enum_register_response(
    email: str, *, requires_email_verification: bool
) -> UserCreateResponse:
    """F-06-007: synthesise a generic /api/register response that does not
    leak whether the email was already registered.

    The shape mirrors a freshly created user: id=0, the submitted email,
    is_active=False, no admin flags, no totp, no pending change. The
    response body is byte-equal across the registered- and unregistered-
    arms (modulo the ``email`` field, which the attacker submitted and
    therefore already knows). The ``requires_email_verification`` flag is
    derived from the operator's verification setting, exactly as on the
    new-user path, so the bool is also identical across arms.
    """
    placeholder = UserRead(
        id=0,
        email=email,
        full_name=None,
        is_active=False,
        is_superuser=False,
        is_totp_enabled=False,
        pending_email=None,
    )
    return UserCreateResponse(
        user=placeholder,
        requires_email_verification=requires_email_verification,
    )


@router.post(
    "/register", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("5/minute")
async def register_user(
    request: Request,
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> UserCreateResponse:
    """
    Register a new user, optionally via an invitation token.

    Anti-enumeration (F-06-007): the response body and status code are
    identical whether the submitted email is fresh or already registered.
    A registered email triggers an out-of-band notification to the address
    ("you already have a Qualis account") with a password-reset link
    instead of leaking the duplicate via the API.

    The verification gate depends only on whether verification is active
    (EMAIL_VERIFICATION_REQUIRED=True AND SMTP configured). Invitation
    tokens grant project membership but never bypass the gate
    (spec amendment 2026-05-02).

    - Verification active (fresh-email path): is_active=False,
      email_verified_at=NULL, verification email sent,
      requires_email_verification=True. If an invitation token was
      provided, the project membership is still created so access
      applies as soon as verification completes.
    - Verification inactive (operator disabled it OR SMTP not configured):
      is_active=True, email_verified_at=NOW(), requires_email_verification=False.
      Membership (if any) is applied in the same transaction. This SMTP-fallback
      rule keeps the app usable on deployments that cannot deliver mail.
    - Duplicate-email path: no row is created, no invitation is processed,
      a "you already have an account" email is dispatched to the address,
      and the response mirrors the fresh-email shape.
    """
    # The verification gate depends ONLY on whether verification is active
    # (operator opted in via EMAIL_VERIFICATION_REQUIRED AND SMTP is configured
    # to actually deliver the link). When SMTP is unconfigured we degrade to
    # active+verified to avoid producing locked-out accounts. The flag is
    # the same on the fresh and the already-registered arms — the attacker
    # cannot probe operator settings via the register endpoint either.
    verification_active = settings.email_verification_active
    needs_verification_step = verification_active
    now = datetime.now(tz=timezone.utc)

    # 1. Compute the password hash unconditionally so the duplicate and
    #    fresh arms spend the same wall-clock on bcrypt (cost factor 12 ≈
    #    150 ms). The hash is reused on the fresh path; on the duplicate
    #    path it's discarded. Without this, a duplicate-email request
    #    would short-circuit before bcrypt runs, restoring a timing
    #    differential between arms.
    hashed_password = get_password_hash(user_in.password)

    # 2. Check if user already exists. The duplicate-email arm follows
    #    the F-06-007 "always-200, send-email" path; it returns the
    #    same response shape and status as the fresh arm.
    existing_query = select(User).where(User.email == user_in.email)
    existing = (await db.execute(existing_query)).scalar_one_or_none()
    if existing is not None:
        # Out-of-band notify the registered address with a recovery link.
        # The "pwa" claim mirrors the password-reset-request shape so the
        # link is single-use against the existing account's current
        # password_changed_at.
        reset_token = create_email_token(
            email=existing.email,
            purpose="password_reset",
            expires_delta=timedelta(hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS),
            password_changed_at=existing.password_changed_at,
        )
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
        send_register_already_registered(email_to=existing.email, reset_url=reset_url)
        return _build_anti_enum_register_response(
            user_in.email, requires_email_verification=needs_verification_step
        )

    # 3. Verify Invitation Token (if provided). Invitation-token errors
    #    are not enumeration-relevant — the token's validity is decided
    #    by its signature, not by the email's registration state.
    invitation_payload = None
    if user_in.invitation_token:
        try:
            invitation_payload = decode_invitation_token(user_in.invitation_token)
            # Enforce email match if present in token
            if invitation_payload["sub"].lower() != user_in.email.lower():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invitation token does not match the provided email.",
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid invitation token: {str(e)}",
            )

    try:
        # 4. Create User
        new_user = User(
            email=user_in.email,
            full_name=user_in.full_name,
            hashed_password=hashed_password,
            is_active=not needs_verification_step,
            email_verified_at=None if needs_verification_step else now,
            password_changed_at=now,
        )
        db.add(new_user)
        # Flush to get ID, but be ready to rollback
        await db.flush()

        # 5. Process invitation (link to project)
        invitation_project_id = (
            invitation_payload.get("project_id")
            or invitation_payload.get("workspace_id")
            if invitation_payload
            else None
        )
        if invitation_project_id and invitation_payload:
            from app.models import ProjectMember, ProjectRole

            project_member = ProjectMember(
                project_id=invitation_project_id,
                user_id=new_user.id,
                role=ProjectRole(invitation_payload["role"]),
            )
            db.add(project_member)

        await db.commit()
    except IntegrityError:
        # F-06-007: race-condition fallback — between the SELECT at
        # step 2 and the INSERT here, a concurrent request inserted the
        # same email. Fold this into the same anti-enumeration response
        # as the steady-state duplicate path: dispatch the "already
        # registered" email and return the generic shape. Don't log
        # the exception detail (could carry the email).
        await db.rollback()
        logger.info("register: race-condition duplicate folded into anti-enum path")
        existing_after = (await db.execute(existing_query)).scalar_one_or_none()
        if existing_after is not None:
            reset_token = create_email_token(
                email=existing_after.email,
                purpose="password_reset",
                expires_delta=timedelta(
                    hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS
                ),
                password_changed_at=existing_after.password_changed_at,
            )
            reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
            send_register_already_registered(
                email_to=existing_after.email, reset_url=reset_url
            )
        return _build_anti_enum_register_response(
            user_in.email, requires_email_verification=needs_verification_step
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during user registration: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while registering the user",
        )
    await db.refresh(new_user)

    # 6. Send verification email for self-signup path (only when active)
    if needs_verification_step:
        token = create_email_token(
            email=new_user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=24),
        )
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        send_email_verification(email_to=new_user.email, verify_url=verify_url)

    # F-06-007: return the same generic shape used by the duplicate-email
    # path — the new user's id/full_name are not in the response body so
    # the two arms are byte-equal. Frontend uses
    # ``requires_email_verification`` to navigate, not the user fields.
    return _build_anti_enum_register_response(
        user_in.email, requires_email_verification=needs_verification_step
    )


@router.patch("/me", response_model=UserRead)
async def update_user_me(
    user_update: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> User:
    """Update current user profile.

    Email changes go through a dual-confirmation flow (F-03-011):
    instead of overwriting ``users.email`` directly, the requested
    address is parked on ``users.pending_email`` and two single-use
    JWTs are emailed:

    * a confirmation link to the **new** address (consume → swap),
    * a cancellation link to the **old** address (consume → clear
      ``pending_email`` only).

    The PATCH response carries the user with ``email`` unchanged and
    ``pending_email`` populated; clients should surface a "check your
    new inbox to confirm" hint to the user. This response shape is
    identical whether the requested address is free, already taken
    by another user, or matches a pending request: the address-taken
    case fails at confirm time, not at PATCH time, so that PATCH
    callers cannot enumerate registered emails through this endpoint.
    """
    try:
        # F-03-011: email change → enter dual-confirmation flow.
        # Idempotent in two cases that don't trigger the flow:
        #   - the submitted address equals the user's current email
        #     (no change requested),
        #   - the submitted address equals the already-pending value
        #     (a duplicate PATCH; we treat it as a no-op rather than
        #     re-issue tokens, to bound email-spam amplification).
        if (
            user_update.email
            and user_update.email != current_user.email
            and user_update.email != current_user.pending_email
        ):
            await initiate_email_change(db, current_user, user_update.email)

        if user_update.full_name is not None:
            current_user.full_name = user_update.full_name

        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        logger.error(f"Integrity check failed during user update: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email likely already registered",
        )
    except Exception as e:
        await db.rollback()
        # If it was the HTTPException above, re-raise it
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Unexpected error during user update: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while updating profile",
        )
    await db.refresh(current_user)
    return current_user


@router.post(
    "/me/password",
    status_code=status.HTTP_200_OK,
    response_model=AckResponse,
)
async def change_password(
    password_data: PasswordChange,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Change current user password."""
    if not verify_password(
        password_data.current_password, current_user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )

    try:
        current_user.hashed_password = get_password_hash(password_data.new_password)
        # F-03-010: bump password_changed_at so in-flight access tokens
        # (which carry an iat claim) are rejected by get_current_user.
        current_user.password_changed_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during password change: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while changing password",
        )
    return AckResponse(status="updated", details="Password updated successfully")


@router.get("/me/2fa/setup", response_model=TOTPSetup)
async def setup_totp(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> TOTPSetup:
    """Start 2FA setup by generating a secret and QR code URI."""
    if current_user.is_totp_enabled:
        raise HTTPException(status_code=400, detail="2FA already enabled")

    try:
        # Generate or reuse secret (re-generating for fresh setup)
        secret = generate_totp_secret()
        current_user.totp_secret = secret
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during TOTP setup: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while setting up 2FA",
        )

    return TOTPSetup(
        secret=secret, qr_code_uri=get_totp_uri(current_user.email, secret)
    )


@router.post("/me/2fa/enable", response_model=TOTPEnableResponse)
async def enable_totp(
    payload: TwoFAEnableRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> TOTPEnableResponse:
    """Enable TOTP authenticator-app 2FA.

    Caller must have already called /me/2fa/setup to seed the TOTP secret
    and must provide a valid TOTP token in payload.token.
    """
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="TOTP not set up")
    if not payload.token:
        raise HTTPException(status_code=400, detail="TOTP token required")
    if not verify_totp_token(current_user.totp_secret, payload.token):
        raise HTTPException(status_code=400, detail="Invalid token")
    try:
        current_user.is_totp_enabled = True
        current_user.totp_channel = "app"
        await db.commit()
        log_admin_action(
            actor_user_id=current_user.id,
            action="twofa_enable",
            resource="user",
            resource_id=current_user.id,
        )
        return TOTPEnableResponse(status="enabled")
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during TOTP enable: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while enabling 2FA",
        )


@router.post("/me/2fa/disable", response_model=AckResponse)
async def disable_totp(
    password_data: PasswordConfirm,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Disable 2FA after verifying current password."""
    if not verify_password(
        password_data.current_password, current_user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="Incorrect password")

    try:
        current_user.is_totp_enabled = False
        current_user.totp_secret = None
        current_user.totp_channel = None  # T15
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during TOTP disable: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while disabling 2FA",
        )
    return AckResponse(status="disabled")


@router.post("/email/verify", response_model=AckResponse)
async def verify_email(
    payload: EmailTokenSubmit, db: AsyncSession = Depends(get_db)
) -> AckResponse:
    """Consume an email-verification JWT and activate the user account.

    Idempotent: re-verifying an already-verified account returns 200 silently.
    Anti-enum: a valid JWT whose email matches no user also returns 200.
    """
    claims = _decode_email_token_or_400(payload.token, "email_verify")

    result = await db.execute(select(User).where(User.email == claims["sub"]))
    user = result.scalar_one_or_none()
    if user is None:
        # Anti-enum: respond 200, do nothing
        return AckResponse(status="ok")

    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(timezone.utc)
        user.is_active = True
        await db.commit()
        log_admin_action(
            actor_user_id=user.id,
            action="email_verify",
            resource="user",
            resource_id=user.id,
        )
    return AckResponse(status="ok")


@router.post("/email/verify/resend", response_model=AckResponse)
@limiter.limit("3/hour", key_func=_get_real_ip)
@limiter.limit("3/hour", key_func=email_hash_key_func_sync)
async def resend_verification(
    request: Request,
    payload: EmailRequest,
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Resend a verification email to an unverified account.

    Always returns 200 (anti-enum). If the user exists and is unverified,
    a fresh token is emailed.

    Constant-time: a single ``get_password_hash`` runs unconditionally so
    the known and unknown arms take comparable wall-clock. Pre-fix
    (F-03-006) the bcrypt pad sat in the ``else`` branch only, so the
    known-unverified path returned ~7 ms while the unknown path took
    ~540 ms — a clear enumeration signal.
    """
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # F-03-006: Constant-time padding on BOTH branches. Token signing +
    # email logging on the success branch are negligible compared to
    # the bcrypt cost, so a single bcrypt call equalises wall-clock.
    get_password_hash("anti-enum-padding")

    if user is not None and user.email_verified_at is None:
        token = create_email_token(
            email=user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS),
        )
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        send_email_verification(user.email, verify_url)

    return AckResponse(status="ok")


@router.post("/password/reset/request", response_model=AckResponse)
@limiter.limit("3/hour", key_func=_get_real_ip)
@limiter.limit("3/hour", key_func=email_hash_key_func_sync)
async def password_reset_request(
    request: Request,
    payload: EmailRequest,
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Request a password-reset email.

    Always returns 200 (anti-enum). If a user exists with the submitted
    email, a fresh JWT carrying a `pwa` (password_changed_at epoch) claim
    is emailed; otherwise a fake bcrypt call equalises latency. The
    `pwa` claim is the replay-defense token: confirm-time compares it
    to the user's current password_changed_at, so a token issued before
    the password was last rotated is rejected.
    """
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # Constant-time: run one bcrypt on BOTH paths so the unknown path
    # (anti-enum padding) and the known path (where no real bcrypt is
    # needed — JWT signing is cheap) take comparable time. Without this
    # equalisation, an attacker could distinguish the two by timing the
    # response (known is much faster than unknown).
    get_password_hash("anti-enum-padding")

    if user is not None:
        token = create_email_token(
            email=user.email,
            purpose="password_reset",
            expires_delta=timedelta(hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS),
            password_changed_at=user.password_changed_at,
        )
        url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        send_password_reset(user.email, url)

    return AckResponse(status="ok")


@router.post("/password/reset/confirm", response_model=AckResponse)
async def password_reset_confirm(
    payload: PasswordResetConfirm, db: AsyncSession = Depends(get_db)
) -> AckResponse:
    """Consume a password-reset JWT, rotate the password, kill in-flight OTPs.

    Returns 400 (not 200 anti-enum) on token/user/pwa failure: the token
    itself is the secret, and an attacker cannot guess valid ones, so a
    specific status here does not enable enumeration.
    """
    claims = _decode_email_token_or_400(payload.token, "password_reset")

    result = await db.execute(select(User).where(User.email == claims["sub"]))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="invalid_token")

    pwa_in_token = claims.get("pwa")
    pwa_now = int(user.password_changed_at.timestamp() * 1_000_000)
    if pwa_in_token != pwa_now:
        # Token was issued before the current password — already consumed
        raise HTTPException(status_code=400, detail="token_already_consumed")

    user.hashed_password = get_password_hash(payload.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()

    log_admin_action(
        actor_user_id=user.id,
        action="password_reset_confirm",
        resource="user",
        resource_id=user.id,
    )
    return AckResponse(status="ok")


@router.post("/email-change/confirm", response_model=AckResponse)
async def email_change_confirm(
    payload: EmailTokenSubmit, db: AsyncSession = Depends(get_db)
) -> AckResponse:
    """Confirm an email-change request (F-03-011).

    Consume an ``email_change_confirm`` JWT and swap
    ``users.email <- users.pending_email``. Single-use semantics
    are enforced two ways:

    1. The token's ``new_email`` claim must equal the user's current
       ``pending_email``. A second PATCH /me overwrites
       ``pending_email`` with a new value, so the prior confirm
       token now fails this check.
    2. The swap clears ``pending_email``, so a re-played token
       finds nothing to swap and returns 400.

    Returns 400 (not 200 anti-enum) on token / user / pending
    mismatch: the token itself is the secret, an attacker cannot
    guess valid ones, so a specific status here does not enable
    enumeration. Returns 409 when the new email is taken — the
    swap would violate the unique constraint on ``users.email``.
    Note: ``password_changed_at`` is **not** bumped — an email
    change is not a credential rotation, so existing access tokens
    remain valid.
    """
    claims = _decode_email_token_or_400(payload.token, "email_change_confirm")

    result = await db.execute(select(User).where(User.email == claims["sub"]))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="invalid_token")

    new_email = claims.get("new_email")
    if new_email is None or user.pending_email != new_email:
        # Token was issued for a different (or older) pending request.
        # This is the single-use gate: a second PATCH /me overwrites
        # pending_email with a new value and the prior confirm token
        # mismatches here.
        raise HTTPException(status_code=400, detail="token_already_consumed")

    try:
        user.email = new_email
        user.pending_email = None
        await db.commit()
    except IntegrityError:
        # Address taken since the change was requested. The unique
        # constraint on users.email is the authoritative gate; we do
        # not pre-check at PATCH time (anti-enumeration on PATCH /me).
        await db.rollback()
        raise HTTPException(status_code=409, detail="email_already_registered")

    log_admin_action(
        actor_user_id=user.id,
        action="email_change_confirm",
        resource="user",
        resource_id=user.id,
    )
    return AckResponse(status="ok")


@router.post("/email-change/cancel", response_model=AckResponse)
async def email_change_cancel(
    payload: EmailTokenSubmit, db: AsyncSession = Depends(get_db)
) -> AckResponse:
    """Cancel an in-flight email-change request (F-03-011).

    Consume an ``email_change_cancel`` JWT and clear
    ``users.pending_email`` without touching ``users.email``. No
    other side-effect: the cancellation link is a safety valve for
    the legitimate account owner, not a security boundary.

    Idempotent: a cancellation token whose user has no pending
    change still returns 200 — the desired end-state (no pending
    request) is already reached.
    """
    claims = _decode_email_token_or_400(payload.token, "email_change_cancel")

    result = await db.execute(select(User).where(User.email == claims["sub"]))
    user = result.scalar_one_or_none()
    if user is None:
        # Anti-enum: respond 200, do nothing. The token bound itself to
        # an email at issue time; if no user matches, the change request
        # was already moot.
        return AckResponse(status="ok")

    if user.pending_email is not None:
        user.pending_email = None
        await db.commit()
        log_admin_action(
            actor_user_id=user.id,
            action="email_change_cancel",
            resource="user",
            resource_id=user.id,
        )
    return AckResponse(status="ok")


@router.post("/2fa/disable/request", response_model=AckResponse)
@limiter.limit("3/hour", key_func=_get_real_ip)
@limiter.limit("3/hour", key_func=email_hash_key_func_sync)
async def twofa_disable_request(
    request: Request,
    payload: EmailRequest,
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Self-serve 2FA disable — request the link.

    Anti-enum: returns 200 regardless of whether the user exists or has
    2FA enabled.

    Constant-time: a single ``get_password_hash`` runs unconditionally
    on every call so the known and unknown arms take comparable
    wall-clock. Pre-fix (F-03-007) the pad was only on the no-op
    branch, so a known-with-2FA email returned ~5 ms while an unknown
    email took ~600 ms — leaking which addresses had 2FA enabled.
    """
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    # F-03-007: Constant-time padding on BOTH branches. Token signing +
    # email logging on the success branch are negligible compared to
    # the bcrypt cost, so a single bcrypt call equalises wall-clock.
    get_password_hash("anti-enum-padding")

    if user is not None and user.is_totp_enabled:
        token = create_email_token(
            email=user.email,
            purpose="twofa_disable",
            expires_delta=timedelta(
                minutes=settings.TWOFA_DISABLE_TOKEN_EXPIRE_MINUTES
            ),
        )
        url = f"{settings.FRONTEND_URL}/2fa/disable?token={token}"
        send_twofa_disable_link(user.email, url)

    return AckResponse(status="ok")


@router.post("/2fa/disable/confirm", response_model=AckResponse)
async def twofa_disable_confirm(
    request: Request,
    payload: EmailTokenSubmit,
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Self-serve 2FA disable — confirm via single-use JWT.

    Single-use enforced via the consumed_email_tokens table (jti PK).
    The mark_jti_consumed call is atomic — concurrent attempts on the
    same token: exactly one inserts, the other hits a PK collision and
    we map it to 409.

    The jti is consumed BEFORE the user lookup so that an attacker who
    somehow obtained a token cannot probe for valid email addresses by
    replaying it; whether or not the user exists, the token is burned.
    """
    claims = _decode_email_token_or_400(payload.token, "twofa_disable")

    jti = claims["jti"]

    # Atomic: consume first, then act. PK collision = already consumed.
    try:
        await mark_jti_consumed(db, jti, purpose="twofa_disable")
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="token_already_consumed")

    # User lookup happens AFTER consume so the jti is burned regardless.
    result = await db.execute(select(User).where(User.email == claims["sub"]))
    user = result.scalar_one_or_none()
    if user is None:
        # Persist the consumed jti even for unknown users (anti-enum).
        await db.commit()
        return AckResponse(status="ok")

    user.is_totp_enabled = False
    user.totp_secret = None
    user.totp_channel = None
    await db.commit()

    when = datetime.now(timezone.utc).isoformat()
    ip = request.client.host if request.client else None
    send_twofa_disabled_notification(user.email, when=when, ip_hint=ip)

    log_admin_action(
        actor_user_id=user.id,
        action="twofa_disable_confirm",
        resource="user",
        resource_id=user.id,
    )
    return AckResponse(status="ok")
