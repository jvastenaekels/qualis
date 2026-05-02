"""Quota helpers and endpoint enforcement.

Spec: docs/superpowers/specs/2026-05-02-project-roles-refactor-design.md §5, §6.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.exceptions import QuotaExceeded
from app.models import Project, User
from app.services.quotas import (
    QuotaState,
    assert_can_add_member,
    assert_can_create_owned_project,
    get_member_quota_state,
    get_owned_project_quota_state,
)
from app.utils.security import (
    create_access_token,
    create_invitation_token,
    get_password_hash,
)


# ---------- adapter fixtures ----------
# The plan's reference test code uses fixture names `regular_user`, `superuser`,
# `member_user`, `seeded_project` which don't exist in this repo's conftest.py.
# We map them onto the existing fixtures below. Test SEMANTICS stay identical;
# only fixture wiring differs (per the task contract).

@pytest_asyncio.fixture
async def regular_user(test_user: User) -> User:
    """Alias: the seeded `test_user` is a regular (non-superuser) account."""
    return test_user


@pytest_asyncio.fixture
async def superuser(db: AsyncSession) -> User:
    """A second user with is_superuser=True."""
    user = User(
        email="superuser@example.com",
        hashed_password=get_password_hash("supersecret"),
        is_superuser=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def member_user(user_factory) -> User:
    """A second regular user, distinct from the project owner."""
    return await user_factory(email="member@example.com")


@pytest_asyncio.fixture
async def seeded_project(test_project: Project) -> Project:
    """Alias: the seeded `test_project` is owned by `regular_user` (test_user)."""
    return test_project


# ---------- get_member_quota_state ----------

@pytest.mark.asyncio
async def test_get_member_quota_state_returns_count_and_limit(
    db: AsyncSession,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
    regular_user: User,
) -> None:
    monkeypatch.setattr(settings, "MAX_MEMBERS_PER_PROJECT", 5)
    state: QuotaState = await get_member_quota_state(db, seeded_project.id, regular_user)
    assert state["count"] >= 1  # at least the owner
    assert state["limit"] == 5


@pytest.mark.asyncio
async def test_get_member_quota_state_unlimited_returns_none(
    db: AsyncSession,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
    regular_user: User,
) -> None:
    monkeypatch.setattr(settings, "MAX_MEMBERS_PER_PROJECT", 0)
    state = await get_member_quota_state(db, seeded_project.id, regular_user)
    assert state["limit"] is None


@pytest.mark.asyncio
async def test_get_member_quota_state_superuser_bypass_returns_none(
    db: AsyncSession,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
    superuser: User,
) -> None:
    monkeypatch.setattr(settings, "MAX_MEMBERS_PER_PROJECT", 1)
    state = await get_member_quota_state(db, seeded_project.id, superuser)
    assert state["limit"] is None


# ---------- assert_can_add_member ----------

@pytest.mark.asyncio
async def test_assert_can_add_member_blocks_when_full(
    db: AsyncSession,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
    regular_user: User,
) -> None:
    monkeypatch.setattr(settings, "MAX_MEMBERS_PER_PROJECT", 1)  # already 1 member (owner)
    with pytest.raises(QuotaExceeded) as exc:
        await assert_can_add_member(db, seeded_project.id, regular_user)
    assert exc.value.code == "MEMBER_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_assert_can_add_member_passes_when_unlimited(
    db: AsyncSession,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
    regular_user: User,
) -> None:
    monkeypatch.setattr(settings, "MAX_MEMBERS_PER_PROJECT", 0)
    await assert_can_add_member(db, seeded_project.id, regular_user)  # no raise


@pytest.mark.asyncio
async def test_assert_can_add_member_superuser_bypass(
    db: AsyncSession,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
    superuser: User,
) -> None:
    monkeypatch.setattr(settings, "MAX_MEMBERS_PER_PROJECT", 1)  # full
    await assert_can_add_member(db, seeded_project.id, superuser)  # no raise


# ---------- assert_can_create_owned_project ----------

@pytest.mark.asyncio
async def test_assert_can_create_owned_project_blocks_at_limit(
    db: AsyncSession,
    seeded_project: Project,  # owned by regular_user
    monkeypatch: pytest.MonkeyPatch,
    regular_user: User,
) -> None:
    monkeypatch.setattr(settings, "MAX_PROJECTS_AS_OWNER", 1)
    with pytest.raises(QuotaExceeded) as exc:
        await assert_can_create_owned_project(db, regular_user)
    assert exc.value.code == "OWNER_PROJECT_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_assert_can_create_owned_project_superuser_bypass(
    db: AsyncSession,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
    superuser: User,
) -> None:
    monkeypatch.setattr(settings, "MAX_PROJECTS_AS_OWNER", 0)
    await assert_can_create_owned_project(db, superuser)


@pytest.mark.asyncio
async def test_get_owned_project_quota_counts_only_owner_rows(
    db: AsyncSession,
    seeded_project: Project,  # owned by regular_user
    member_user: User,        # member, not owner
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "MAX_PROJECTS_AS_OWNER", 5)
    state = await get_owned_project_quota_state(db, member_user)
    assert state["count"] == 0
    assert state["limit"] == 5


# ---------- Endpoint enforcement ----------
# These integration tests assert that each endpoint that mutates membership /
# project ownership invokes the corresponding `assert_can_*` helper before any
# DB write, and that QuotaExceeded surfaces as HTTP 409 with the standard
# `{code, message, details}` envelope (matching T2's pattern for
# OWNER_ROLE_IMMUTABLE).


@pytest_asyncio.fixture
async def owner_authed_client(
    client: AsyncClient, regular_user: User
) -> AsyncClient:
    """The shared httpx client, with an Authorization header for the project owner."""
    token = create_access_token(
        subject=regular_user.email, expires_delta=timedelta(minutes=30)
    )
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest_asyncio.fixture
async def invitee_user(user_factory) -> User:
    """A fresh user, not yet a member of any project."""
    return await user_factory(email="invitee@example.com")


@pytest_asyncio.fixture
async def invitee_authed_client(
    client: AsyncClient, invitee_user: User
) -> AsyncClient:
    """The shared httpx client, with an Authorization header for the invitee."""
    token = create_access_token(
        subject=invitee_user.email, expires_delta=timedelta(minutes=30)
    )
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest_asyncio.fixture
def seeded_invitation_token(invitee_user: User, seeded_project: Project) -> str:
    """A valid invitation token addressed to `invitee_user` for `seeded_project`."""
    return create_invitation_token(
        email=invitee_user.email,
        project_id=seeded_project.id,
        role="member",
    )


@pytest.mark.asyncio
async def test_create_project_blocked_when_owner_quota_reached(
    owner_authed_client: AsyncClient,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "MAX_PROJECTS_AS_OWNER", 1)
    response = await owner_authed_client.post(
        "/api/admin/projects",
        json={"title": "Second Project", "slug": "second-project"},
    )
    assert response.status_code == 409
    body = response.json()
    # Match the envelope T2 established for OWNER_ROLE_IMMUTABLE.
    assert body.get("message") == "OWNER_PROJECT_LIMIT_REACHED" or body.get("code") == "OWNER_PROJECT_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_create_project_passes_when_unlimited(
    owner_authed_client: AsyncClient,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "MAX_PROJECTS_AS_OWNER", 0)
    response = await owner_authed_client.post(
        "/api/admin/projects",
        json={"title": "Second Project", "slug": "second-project"},
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_invitation_send_blocked_at_member_limit(
    owner_authed_client: AsyncClient,
    seeded_project: Project,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "MAX_MEMBERS_PER_PROJECT", 1)
    response = await owner_authed_client.post(
        f"/api/admin/projects/{seeded_project.slug}/invitations",
        json={"email": "newcomer@example.com", "role": "member"},
    )
    assert response.status_code == 409
    body = response.json()
    assert body.get("message") == "MEMBER_LIMIT_REACHED" or body.get("code") == "MEMBER_LIMIT_REACHED"


@pytest.mark.asyncio
async def test_invitation_accept_blocked_at_member_limit(
    invitee_authed_client: AsyncClient,
    seeded_project: Project,
    seeded_invitation_token: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "MAX_MEMBERS_PER_PROJECT", 1)
    response = await invitee_authed_client.post(
        "/api/admin/invitations/accept",
        json={"token": seeded_invitation_token},
    )
    assert response.status_code == 409
    body = response.json()
    assert body.get("message") == "MEMBER_LIMIT_REACHED" or body.get("code") == "MEMBER_LIMIT_REACHED"
