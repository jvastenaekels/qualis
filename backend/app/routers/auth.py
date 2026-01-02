"""Authentication routes."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User, StudyCollaborator, StudyRole
from app.schemas import Token, UserRead, UserCreate
from app.utils.security import (
    create_access_token,
    verify_password,
    get_password_hash,
    decode_invitation_token,
)

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get current active user."""
    return current_user


@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db),
):
    """OAuth2 compatible token login, get an access token for future requests."""
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

    # 3. Create Token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )

    return Token(access_token=access_token, token_type="bearer")


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user, optionally via an invitation token."""
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

    # 3. Create User
    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        is_active=True,
    )
    db.add(new_user)
    await db.flush()  # get user id

    # 4. Process invitation (link to study)
    if invitation_payload:
        collab = StudyCollaborator(
            study_id=invitation_payload["study_id"],
            user_id=new_user.id,
            role=StudyRole(invitation_payload["role"]),
        )
        db.add(collab)

    await db.commit()
    await db.refresh(new_user)
    return new_user
