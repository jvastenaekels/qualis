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
from app.utils.email import send_email_verification
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
    TOTPVerify,
)
from app.schemas.auth import EmailRequest, EmailTokenSubmit
from app.schemas.responses import AckResponse, TOTPEnableResponse
from app.limiter import limiter, email_hash_key_func_sync, _get_real_ip
from fastapi import Request

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/me", response_model=UserRead)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Get current active user."""
    return current_user


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

    # 2. Authenticate
    if not user or not verify_password(form_data.password, user.hashed_password):
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

    # 2.5 Check 2FA
    if user.is_totp_enabled:
        if not x_totp_token:
            return Token(requires_2fa=True)

        if not user.totp_secret or not verify_totp_token(
            user.totp_secret, x_totp_token
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA token",
            )

    # 3. Create Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )

    # token_type "bearer" is the OAuth2 literal, not a credential.
    return Token(access_token=access_token, token_type="bearer")  # nosec B106


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

    - Invited path (valid invitation_token matching the email): is_active=True,
      email_verified_at=NOW(), requires_email_verification=False.
    - Self-signup path (no invitation token), when verification is active
      (EMAIL_VERIFICATION_REQUIRED=True AND SMTP is configured): is_active=False,
      email_verified_at=NULL, verification email sent,
      requires_email_verification=True.
    - Self-signup path with verification inactive (operator disabled it OR
      SMTP not configured): is_active=True, email_verified_at=NOW(),
      requires_email_verification=False — never lock users out of a deployment
      that cannot deliver verification mail.
    """
    # 1. Check if user already exists
    query = select(User).where(User.email == user_in.email)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )

    # 2. Verify Invitation Token (if provided)
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
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid invitation token: {str(e)}",
            )

    # Invited users are immediately active + verified. Self-signup needs the
    # verification step ONLY when verification is active (operator opted in
    # via EMAIL_VERIFICATION_REQUIRED AND SMTP is configured to actually
    # deliver the link). Otherwise create active+verified to avoid producing
    # locked-out accounts on SMTP-unconfigured deployments.
    invited = invitation_payload is not None
    verification_active = settings.email_verification_active
    needs_verification_step = (not invited) and verification_active
    now = datetime.now(tz=timezone.utc)

    try:
        # 3. Create User
        new_user = User(
            email=user_in.email,
            full_name=user_in.full_name,
            hashed_password=get_password_hash(user_in.password),
            is_active=not needs_verification_step,
            email_verified_at=None if needs_verification_step else now,
            password_changed_at=now,
        )
        db.add(new_user)
        # Flush to get ID, but be ready to rollback
        await db.flush()

        # 4. Process invitation (link to project)
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
    except IntegrityError as e:
        await db.rollback()
        logger.error(
            f"Integrity check failed during user registration: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email likely already exists",
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during user registration: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while registering the user",
        )
    await db.refresh(new_user)

    # 5. Send verification email for self-signup path (only when active)
    if needs_verification_step:
        token = create_email_token(
            email=new_user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=24),
        )
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        send_email_verification(email_to=new_user.email, verify_url=verify_url)

    return UserCreateResponse(
        user=UserRead.model_validate(new_user),
        requires_email_verification=needs_verification_step,
    )


@router.patch("/me", response_model=UserRead)
async def update_user_me(
    user_update: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> User:
    """Update current user profile."""
    try:
        # Check email uniqueness if changing email
        if user_update.email and user_update.email != current_user.email:
            query = select(User).where(User.email == user_update.email)
            result = await db.execute(query)
            if result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered",
                )
            current_user.email = user_update.email

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
    verify_data: TOTPVerify,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> TOTPEnableResponse:
    """Enable 2FA after verifying a token."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="TOTP not set up")

    if verify_totp_token(current_user.totp_secret, verify_data.token):
        try:
            current_user.is_totp_enabled = True
            await db.commit()
            return TOTPEnableResponse(status="enabled")
        except Exception as e:
            await db.rollback()
            logger.error(f"Unexpected error during TOTP enable: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred while enabling 2FA",
            )

    raise HTTPException(status_code=400, detail="Invalid token")


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
    try:
        claims = decode_email_token(payload.token, expected_purpose="email_verify")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    a fresh token is emailed. Otherwise, a fake bcrypt call equalises latency
    so callers cannot distinguish the two code paths by timing.
    """
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user is not None and user.email_verified_at is None:
        token = create_email_token(
            email=user.email,
            purpose="email_verify",
            expires_delta=timedelta(hours=settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS),
        )
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        send_email_verification(user.email, verify_url)
    else:
        # Constant-time padding to equalize latency vs the real bcrypt path
        get_password_hash("anti-enum-padding")

    return AckResponse(status="ok")
