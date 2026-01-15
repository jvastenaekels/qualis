"""Authentication routes."""

from datetime import timedelta
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
    verify_password,
    get_password_hash,
    decode_invitation_token,
    generate_totp_secret,
    get_totp_uri,
    verify_totp_token,
)
from app.schemas import (
    Token,
    UserRead,
    UserCreate,
    UserUpdate,
    PasswordChange,
    TOTPSetup,
    TOTPVerify,
)
from app.limiter import limiter
from fastapi import Request

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/me", response_model=UserRead)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get current active user."""
    return current_user


@router.post("/token", response_model=Token)
@limiter.limit("5/minute")
async def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    x_totp_token: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
):
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

    return Token(access_token=access_token, token_type="bearer")


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register_user(
    request: Request,
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user, optionally via an invitation token.
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

    try:
        # 3. Create User
        new_user = User(
            email=user_in.email,
            full_name=user_in.full_name,
            hashed_password=get_password_hash(user_in.password),
            is_active=True,
        )
        db.add(new_user)
        # Flush to get ID, but be ready to rollback
        await db.flush()

        # 4. Process invitation (link to workspace)
        if invitation_payload and "workspace_id" in invitation_payload:
            from app.models import WorkspaceMember, WorkspaceRole

            ws_member = WorkspaceMember(
                workspace_id=invitation_payload["workspace_id"],
                user_id=new_user.id,
                role=WorkspaceRole(invitation_payload["role"]),
            )
            db.add(ws_member)

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
    return new_user


@router.patch("/me", response_model=UserRead)
async def update_user_me(
    user_update: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
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


@router.post("/me/password", status_code=status.HTTP_200_OK)
async def change_password(
    password_data: PasswordChange,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
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
    return {"message": "Password updated successfully"}


@router.get("/me/2fa/setup", response_model=TOTPSetup)
async def setup_totp(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
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


@router.post("/me/2fa/enable")
async def enable_totp(
    verify_data: TOTPVerify,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Enable 2FA after verifying a token."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="TOTP not set up")

    if verify_totp_token(current_user.totp_secret, verify_data.token):
        try:
            current_user.is_totp_enabled = True
            await db.commit()
            return {"status": "enabled"}
        except Exception as e:
            await db.rollback()
            logger.error(f"Unexpected error during TOTP enable: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred while enabling 2FA",
            )

    raise HTTPException(status_code=400, detail="Invalid token")


@router.post("/me/2fa/disable")
async def disable_totp(
    password_data: PasswordChange,  # Reuse for current password check
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
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
    return {"status": "disabled"}
