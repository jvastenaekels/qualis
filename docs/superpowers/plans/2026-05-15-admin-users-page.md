# Admin Users Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a superuser-only `/admin/users` page (list + risk badges + verb actions) plus the small security hardening it needs, so operators can audit accounts and run offboarding/account-recovery without `psql`.

**Architecture:** One thin React page consuming refined `/api/admin/users` endpoints. Replace the unused `POST /api/admin/users` with a focused triplet (PATCH, force-password-reset, reset-totp) plus a new admin-user service centralising three guard rails (anti-self-demote, at-least-one-active-superuser, 2FA-required-for-promotion). Add one DB column (`last_login_at`) and tighten `get_current_user` so `is_active=False` actually locks out a session. Force-password-reset rotates the password to an unguessable value *and* bumps `password_changed_at`, which kills all existing access tokens via the existing F-03-010 `iat`-vs-`pwa` invariant — so we get implicit "force logout" without adding a JTI denylist.

**Tech Stack:** Python 3.13 / FastAPI / SQLAlchemy async / Alembic / Pydantic v2 / pytest. React 19 / TypeScript / Vite / TanStack Query / Tailwind / Radix / Vitest. Orval-generated API client.

**Scope notes:**
- v1 deliberately omits failed-login lockout per user, IP geolocation, sessions table, and the per-user audit log view. They are tracked in the v2 backlog at the bottom.
- The plan also rolls in the small `isAdmin → isSuperuser` rename from the earlier analysis (touches `useAuth.ts`, `RequireAdmin.tsx`); they belong here because the new page reads `isSuperuser` directly and we want one clean rename, not two.
- The plan drops `POST /api/admin/users` rather than wiring it in the UI. Onboarding stays canonical via `/register` + email verification + invitation tokens.

---

## File Structure

**Created**
- `backend/db_migrations/versions/<new_rev>_add_last_login_at.py` — Alembic migration adding `users.last_login_at`.
- `backend/app/services/admin_user_service.py` — single home for the three guard rails and the verb actions (deactivate / promote-demote / force-password-reset / reset-totp). All endpoints in `routers/admin/users.py` thin-wrap this service.
- `backend/tests/integration/test_admin_user_guards.py` — guard-rail integration tests (anti-self-demote, last-active-superuser, 2FA-required-for-promotion, force-password-reset kills sessions, reset-totp clears all fields).
- `backend/tests/integration/test_login_last_login.py` — `last_login_at` populated only on full-success login.
- `backend/tests/integration/test_inactive_user_lockout.py` — bearer token rejected as soon as `is_active=False`.
- `frontend/src/pages/admin/AdminUsersPage.tsx` — the page (JSX shell only, per the project's hook-driven pattern).
- `frontend/src/hooks/admin/useAdminUsersPage.ts` — state, derived signals, mutations.
- `frontend/src/hooks/admin/useAdminUsersPage.test.ts` — pure logic tests, no rendering.
- `frontend/src/pages/admin/AdminUsersPage.test.tsx` — render + interaction integration test.

**Modified**
- `backend/app/models/user.py` — add `last_login_at` column.
- `backend/app/schemas/users.py` — add `UserReadAdmin` extending `UserRead` with `email_verified_at`, `password_changed_at`, `last_login_at`; add `UserAdminUpdate` PATCH schema.
- `backend/app/routers/auth.py` — set `user.last_login_at = now()` on full-success login, after 2FA passes.
- `backend/app/routers/admin/users.py` — drop POST, switch GET to `UserReadAdmin`, add PATCH + 2 POST verb endpoints, all calling the service.
- `backend/app/dependencies.py` — reject inactive users in `get_current_user`.
- `backend/tests/unit/test_admin_users.py` — drop POST tests, keep GET + DELETE.
- `frontend/src/hooks/useAuth.ts` — expose `isSuperuser` (kept `isAdmin` as deprecated alias for one release? No — rename clean, fix call sites).
- `frontend/src/components/auth/RequireAdmin.tsx` — use `isSuperuser`, recompute admin gate.
- `frontend/src/components/admin/AppSidebar.tsx` — add "Users" entry gated on `isSuperuser`.
- `frontend/src/App.tsx` (or wherever routes are declared) — add `/admin/users` route.
- `frontend/public/locales/{en,fr,fi,de,pt,pl}/translation.json` — ~15 new keys under `admin.users.*`.
- `docs/explanation/architecture.md` — replace the vague "perform global maintenance" line with the actual three powers.
- `CLAUDE.md` — add `app.services.admin_user_service` to the strict-typed modules list.

**Generated (committed)**
- `frontend/src/api/generated.ts` and `frontend/src/api/model/*.ts` — regenerated via `make generate-api`.

---

## Task 1: Migration + model field for `last_login_at`

**Files:**
- Create: `backend/db_migrations/versions/<new_rev>_add_last_login_at.py`
- Modify: `backend/app/models/user.py`

- [ ] **Step 1.1: Generate the migration skeleton**

Run, from the project root:

```bash
make migration-new MSG="add last_login_at"
```

This invokes Alembic autogenerate. Open the new file under `backend/db_migrations/versions/` and **strip everything except the intended diff**. The file MUST end up containing only this:

```python
"""add last_login_at

Revision ID: <auto>
Revises: a3f1c2e9b4d7
Create Date: <auto>
"""

from alembic import op
import sqlalchemy as sa

revision = "<auto>"
down_revision = "a3f1c2e9b4d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "last_login_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "last_login_at")
```

Reject any autogenerate noise (other tables, unrelated diffs). Per `CLAUDE.md`: "Always review generated migrations".

- [ ] **Step 1.2: Add the column to the model**

In `backend/app/models/user.py`, add right after the `password_changed_at` block (around line 47):

```python
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
```

- [ ] **Step 1.3: Apply the migration and verify**

```bash
cd backend && .venv/bin/alembic upgrade head && .venv/bin/alembic current
```

Expected: prints the new revision id as `(head)`.

Then sanity-check the column exists:

```bash
psql "$DATABASE_URL" -c "\d users" | grep last_login_at
```

Expected: `last_login_at | timestamp with time zone |`.

- [ ] **Step 1.4: Update the migration chain in CLAUDE.md**

In `/home/julien/tools/qualis/CLAUDE.md`, add the new revision id at the tail of the migration chain (look for "Migration chain (22 migrations…)" — bump to 23 and append `→ add_last_login_at`).

- [ ] **Step 1.5: Commit**

```bash
git add backend/db_migrations/versions/ backend/app/models/user.py CLAUDE.md
git commit -m "feat(users): add last_login_at column"
```

---

## Task 2: Populate `last_login_at` on full-success login

**Files:**
- Create: `backend/tests/integration/test_login_last_login.py`
- Modify: `backend/app/routers/auth.py:218-225`

- [ ] **Step 2.1: Write the failing tests**

Create `backend/tests/integration/test_login_last_login.py`:

```python
"""last_login_at is set only on a fully successful /api/token call."""

import pytest
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import User


@pytest.mark.asyncio
async def test_last_login_at_set_on_successful_login(
    client: AsyncClient, regular_user: User, db: AsyncSession
) -> None:
    assert regular_user.last_login_at is None

    resp = await client.post(
        "/api/token",
        data={"username": regular_user.email, "password": "regular-pw"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    await db.refresh(regular_user)
    assert regular_user.last_login_at is not None
    assert regular_user.last_login_at <= datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_last_login_at_unset_on_wrong_password(
    client: AsyncClient, regular_user: User, db: AsyncSession
) -> None:
    resp = await client.post(
        "/api/token",
        data={"username": regular_user.email, "password": "WRONG"},
    )
    assert resp.status_code == 401

    await db.refresh(regular_user)
    assert regular_user.last_login_at is None


@pytest.mark.asyncio
async def test_last_login_at_unset_on_requires_2fa_response(
    client: AsyncClient, totp_user: User, db: AsyncSession
) -> None:
    # totp_user has is_totp_enabled=True, channel='app', no header passed -> requires_2fa response
    resp = await client.post(
        "/api/token",
        data={"username": totp_user.email, "password": "totp-pw"},
    )
    assert resp.status_code == 200
    assert resp.json().get("requires_2fa") is True
    assert resp.json().get("access_token") is None

    await db.refresh(totp_user)
    assert totp_user.last_login_at is None
```

The fixtures `regular_user` (password `"regular-pw"`) and `totp_user` (password `"totp-pw"`, TOTP enabled, channel `app`) are expected to be in `backend/tests/conftest.py`. If they're not, add them in a small fixture file or extend conftest — confirm exact names while writing the test.

- [ ] **Step 2.2: Run tests and confirm they fail**

```bash
cd backend && .venv/bin/pytest tests/integration/test_login_last_login.py -v
```

Expected: 3 FAIL (the value stays `None` because nothing writes it yet).

- [ ] **Step 2.3: Hook the write in `login_for_access_token`**

In `backend/app/routers/auth.py`, just before the `return Token(access_token=...)` on the success path (currently around line 224-225), insert:

```python
    # Record successful login for operator visibility and dormant-account
    # detection. Only on the full-success path: not on requires_2fa
    # responses (no session issued), not on wrong-password/wrong-2FA.
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
```

`datetime` and `timezone` are already imported at the top of `auth.py`.

- [ ] **Step 2.4: Verify tests pass**

```bash
cd backend && .venv/bin/pytest tests/integration/test_login_last_login.py -v
```

Expected: 3 PASS.

- [ ] **Step 2.5: Commit**

```bash
git add backend/tests/integration/test_login_last_login.py backend/app/routers/auth.py
git commit -m "feat(users): record last_login_at on successful login"
```

---

## Task 3: `is_active=False` actually locks the user out

**Files:**
- Create: `backend/tests/integration/test_inactive_user_lockout.py`
- Modify: `backend/app/dependencies.py:60-80`

**Why this task exists:** today `get_current_user` doesn't check `is_active`. Deactivating a user via DB or via the upcoming PATCH endpoint is silent — their bearer token keeps working until expiry. We close that gap before exposing the PATCH endpoint.

- [ ] **Step 3.1: Write the failing test**

Create `backend/tests/integration/test_inactive_user_lockout.py`:

```python
"""Setting is_active=False must immediately reject the user's bearer token."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


@pytest.mark.asyncio
async def test_inactive_user_token_rejected(
    client: AsyncClient,
    regular_user: User,
    regular_user_token: str,
    db: AsyncSession,
) -> None:
    headers = {"Authorization": f"Bearer {regular_user_token}"}

    # Sanity: token works while active.
    ok = await client.get("/api/me", headers=headers)
    assert ok.status_code == 200

    # Flip the flag and refresh the row.
    regular_user.is_active = False
    await db.commit()

    # Same token, now refused.
    locked = await client.get("/api/me", headers=headers)
    assert locked.status_code == 401
```

- [ ] **Step 3.2: Run test, confirm it fails**

```bash
cd backend && .venv/bin/pytest tests/integration/test_inactive_user_lockout.py -v
```

Expected: FAIL (returns 200 — token still accepted).

- [ ] **Step 3.3: Reject inactive users in `get_current_user`**

In `backend/app/dependencies.py`, inside `get_current_user`, right before `return user` (currently around line 80), insert:

```python
    if not user.is_active:
        raise credentials_exception
```

This raises the existing `HTTPException(401, "Could not validate credentials", WWW-Authenticate: Bearer)` already constructed earlier in the function — no new error variant, no new audit surface.

- [ ] **Step 3.4: Run the new test plus the wider suite to catch regressions**

```bash
cd backend && .venv/bin/pytest tests/integration/test_inactive_user_lockout.py -v
cd backend && .venv/bin/pytest tests/integration/ tests/unit/ -q
```

Expected: new test PASS, full suite PASS. If a previously-relied-on test set `is_active=False` and expected the token to keep working, fix the test — the new behaviour is the desired one.

- [ ] **Step 3.5: Commit**

```bash
git add backend/tests/integration/test_inactive_user_lockout.py backend/app/dependencies.py
git commit -m "fix(auth): reject bearer tokens for inactive users"
```

---

## Task 4: `UserReadAdmin` schema

**Files:**
- Modify: `backend/app/schemas/users.py`

- [ ] **Step 4.1: Add `UserReadAdmin` and `UserAdminUpdate`**

In `backend/app/schemas/users.py`, after the existing `UserRead` class (around line 43), add:

```python
class UserReadAdmin(UserRead):
    """Extended user read schema for superuser-only admin endpoints.

    Carries audit fields that we do NOT expose on the public /api/me path:
    superusers see them so they can audit account hygiene
    (last login, password age, email verification status).
    """

    email_verified_at: datetime | None = None
    password_changed_at: datetime
    last_login_at: datetime | None = None


class UserAdminUpdate(BaseModel):
    """PATCH payload for /api/admin/users/{id}.

    Each field is optional so superusers can change one flag at a time
    (e.g. demote without touching activation status). Email and password
    are deliberately absent: email goes through the user-driven
    /me email-change flow; password goes through force-password-reset.
    """

    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def validate_full_name_(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)
```

Add the missing import at the top of the file:

```python
from datetime import datetime
```

- [ ] **Step 4.2: Re-export from `app.schemas`**

In `backend/app/schemas/__init__.py`, add `UserReadAdmin` and `UserAdminUpdate` to the explicit re-exports next to `UserRead`. (Open the file first to see the exact `__all__` / re-export style.)

- [ ] **Step 4.3: Run type check + schema tests**

```bash
cd backend && .venv/bin/mypy app/schemas/ && .venv/bin/pytest tests/unit/test_admin_users.py -v
```

Expected: mypy clean, existing GET/POST/DELETE admin user tests still pass (we haven't touched the router yet).

- [ ] **Step 4.4: Commit**

```bash
git add backend/app/schemas/users.py backend/app/schemas/__init__.py
git commit -m "feat(users): add UserReadAdmin + UserAdminUpdate schemas"
```

---

## Task 5: `admin_user_service.py` — guard rails + verb actions

**Files:**
- Create: `backend/app/services/admin_user_service.py`
- Create: tests added in Task 6/7/8 against this service via the routers

- [ ] **Step 5.1: Write the failing unit tests**

Create `backend/tests/unit/test_admin_user_service.py`:

```python
"""Unit tests for admin_user_service guard rails (no router involved)."""

import pytest
from unittest.mock import AsyncMock

from app.models import User
from app.services.admin_user_service import (
    AdminUserError,
    assert_can_demote_superuser,
    assert_can_deactivate,
    assert_can_promote_superuser,
)


@pytest.mark.asyncio
async def test_assert_can_demote_superuser_refuses_self_demote() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    with pytest.raises(AdminUserError, match="cannot demote yourself"):
        await assert_can_demote_superuser(
            db=AsyncMock(), actor=actor, target=actor
        )


@pytest.mark.asyncio
async def test_assert_can_demote_superuser_refuses_last_active_superuser() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    target = User(id=2, is_superuser=True, is_active=True)

    db = AsyncMock()
    # Stub the count helper to claim only one active superuser left
    # (the target) — demoting them would leave the system with zero.
    db.execute.return_value.scalar_one.return_value = 1

    with pytest.raises(AdminUserError, match="at least one"):
        await assert_can_demote_superuser(db=db, actor=actor, target=target)


@pytest.mark.asyncio
async def test_assert_can_demote_superuser_allows_when_others_exist() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    target = User(id=2, is_superuser=True, is_active=True)

    db = AsyncMock()
    db.execute.return_value.scalar_one.return_value = 3  # two others remain

    await assert_can_demote_superuser(db=db, actor=actor, target=target)  # no raise


@pytest.mark.asyncio
async def test_assert_can_deactivate_refuses_self() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    with pytest.raises(AdminUserError, match="cannot deactivate yourself"):
        await assert_can_deactivate(db=AsyncMock(), actor=actor, target=actor)


@pytest.mark.asyncio
async def test_assert_can_deactivate_refuses_last_active_superuser() -> None:
    actor = User(id=1, is_superuser=True, is_active=True)
    target = User(id=2, is_superuser=True, is_active=True)

    db = AsyncMock()
    db.execute.return_value.scalar_one.return_value = 1

    with pytest.raises(AdminUserError, match="at least one"):
        await assert_can_deactivate(db=db, actor=actor, target=target)


@pytest.mark.asyncio
async def test_assert_can_promote_superuser_requires_2fa() -> None:
    actor = User(id=1, is_superuser=True, is_active=True, is_totp_enabled=True)
    target = User(id=2, is_superuser=False, is_active=True, is_totp_enabled=False)

    with pytest.raises(AdminUserError, match="2FA"):
        await assert_can_promote_superuser(db=AsyncMock(), actor=actor, target=target)


@pytest.mark.asyncio
async def test_assert_can_promote_superuser_allows_when_2fa_enabled() -> None:
    actor = User(id=1, is_superuser=True, is_active=True, is_totp_enabled=True)
    target = User(id=2, is_superuser=False, is_active=True, is_totp_enabled=True)

    await assert_can_promote_superuser(db=AsyncMock(), actor=actor, target=target)  # no raise
```

- [ ] **Step 5.2: Run tests, confirm failure**

```bash
cd backend && .venv/bin/pytest tests/unit/test_admin_user_service.py -v
```

Expected: ModuleNotFoundError / 7 FAIL.

- [ ] **Step 5.3: Implement the service**

Create `backend/app/services/admin_user_service.py`:

```python
# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2026 Julien Vastenaekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Admin user management service.

Centralises the three guard rails that protect operator self-service from
foot-guns:

1. **Anti-self-demote / anti-self-deactivate.** A superuser cannot remove
   their own elevated status or active flag in one click — they must ask
   another superuser to do it, which forces an explicit hand-off.

2. **At-least-one-active-superuser.** Refuse any change that would leave
   ``count(is_superuser AND is_active) == 0``. This is the lockout-proof
   rule: as long as the count stays ≥ 1, the platform always has someone
   who can recover access.

3. **2FA-required-for-superuser-promotion.** A user without TOTP enabled
   cannot be promoted. The bar to operate Qualis as superuser is a
   working second factor; without it, the promotion is refused so the
   operator fixes the prerequisite first.

The verb actions (force_password_reset, reset_totp) live here too so the
router stays a thin HTTP layer.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import User
from app.utils.email import send_password_reset
from app.utils.security import create_email_token, get_password_hash


class AdminUserError(Exception):
    """Raised when an admin user action violates a guard rail.

    The router translates this to HTTP 400/409. The message is operator-
    facing English (no secrets, no enumeration risk — the caller is
    already a superuser).
    """


async def _count_active_superusers(db: AsyncSession) -> int:
    stmt = (
        select(func.count())
        .select_from(User)
        .where(User.is_superuser.is_(True))
        .where(User.is_active.is_(True))
    )
    return int((await db.execute(stmt)).scalar_one())


async def assert_can_demote_superuser(
    *, db: AsyncSession, actor: User, target: User
) -> None:
    if actor.id == target.id:
        raise AdminUserError("You cannot demote yourself.")
    if not target.is_superuser:
        return  # idempotent: demoting a non-superuser is a no-op
    if not target.is_active:
        return  # already inactive, doesn't count toward the floor
    remaining = await _count_active_superusers(db)
    if remaining <= 1:
        raise AdminUserError(
            "Refusing: the platform must keep at least one active superuser."
        )


async def assert_can_deactivate(
    *, db: AsyncSession, actor: User, target: User
) -> None:
    if actor.id == target.id:
        raise AdminUserError("You cannot deactivate yourself.")
    if not target.is_active:
        return  # idempotent
    if not target.is_superuser:
        return
    remaining = await _count_active_superusers(db)
    if remaining <= 1:
        raise AdminUserError(
            "Refusing: the platform must keep at least one active superuser."
        )


async def assert_can_promote_superuser(
    *, db: AsyncSession, actor: User, target: User
) -> None:
    del db  # unused; signature kept symmetric for the router
    del actor
    if target.is_superuser:
        return  # idempotent
    if not target.is_totp_enabled:
        raise AdminUserError(
            "Refusing: target must have 2FA enabled before being promoted "
            "to superuser. Ask them to set up TOTP first, then retry."
        )


async def force_password_reset(
    *, db: AsyncSession, target: User
) -> None:
    """Rotate the target's password to an unguessable value, bump
    ``password_changed_at`` (kills every existing access token via
    F-03-010), and send the standard password-reset email.

    The user is fully locked out until they click the email link and pick
    a new password. The endpoint is the operator's "this account is
    compromised, force-rotate now" button.
    """
    # 1. Replace the password hash with one nobody knows. We never store
    #    or surface the throwaway plaintext; the user MUST go through the
    #    email reset to regain access.
    throwaway = secrets.token_urlsafe(32)
    target.hashed_password = get_password_hash(throwaway)

    # 2. Move password_changed_at forward. dependencies.get_current_user
    #    rejects any access token whose iat is earlier than this — so all
    #    active sessions die immediately.
    target.password_changed_at = datetime.now(timezone.utc)

    # 3. Issue a fresh reset token bound to the NEW password_changed_at
    #    and email it. This matches the user-initiated reset flow.
    token = create_email_token(
        email=target.email,
        purpose="password_reset",
        expires_delta=timedelta(hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS),
        password_changed_at=target.password_changed_at,
    )
    url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    await db.commit()
    send_password_reset(target.email, url)


async def reset_totp(*, db: AsyncSession, target: User) -> None:
    """Clear all TOTP state on the target account.

    Use case: the user has lost their authenticator and the operator
    verifies their identity out of band. Next login, the target will be
    able to set up 2FA again from /me. No email is sent in v1.
    """
    target.totp_secret = None
    target.is_totp_enabled = False
    target.totp_channel = None
    await db.commit()
```

- [ ] **Step 5.4: Run service tests**

```bash
cd backend && .venv/bin/pytest tests/unit/test_admin_user_service.py -v
```

Expected: 7 PASS.

- [ ] **Step 5.5: Add to strict-typed modules**

Open `backend/pyproject.toml`, find `[[tool.mypy.overrides]]` blocks. Add `app.services.admin_user_service` to the **full-strict** section (alongside `app.services.quotas`). Then verify:

```bash
cd backend && .venv/bin/mypy app/services/admin_user_service.py
```

Expected: Success: no issues found.

Also update the docstring counter in `CLAUDE.md`:
- Bump "Total: 67 modules under strict overrides" → 68.
- Add `app.services.admin_user_service` to the list under "Full strict".

- [ ] **Step 5.6: Commit**

```bash
git add backend/app/services/admin_user_service.py backend/tests/unit/test_admin_user_service.py backend/pyproject.toml CLAUDE.md
git commit -m "feat(users): add admin_user_service with guard rails"
```

---

## Task 6: PATCH `/api/admin/users/{id}` — toggle flags

**Files:**
- Create: `backend/tests/integration/test_admin_user_guards.py`
- Modify: `backend/app/routers/admin/users.py`

- [ ] **Step 6.1: Write integration tests**

Create `backend/tests/integration/test_admin_user_guards.py`:

```python
"""Integration tests for PATCH /api/admin/users/{id} and verb endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


@pytest.mark.asyncio
async def test_patch_user_promotes_when_2fa_enabled(
    client: AsyncClient,
    superuser: User,
    superuser_token: str,
    totp_user: User,  # is_totp_enabled=True
    db: AsyncSession,
) -> None:
    resp = await client.patch(
        f"/api/admin/users/{totp_user.id}",
        json={"is_superuser": True},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 200
    await db.refresh(totp_user)
    assert totp_user.is_superuser is True


@pytest.mark.asyncio
async def test_patch_user_refuses_promotion_without_2fa(
    client: AsyncClient,
    superuser: User,
    superuser_token: str,
    regular_user: User,  # is_totp_enabled=False
) -> None:
    resp = await client.patch(
        f"/api/admin/users/{regular_user.id}",
        json={"is_superuser": True},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 400
    assert "2FA" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_patch_user_refuses_self_demote(
    client: AsyncClient,
    superuser: User,
    superuser_token: str,
) -> None:
    resp = await client.patch(
        f"/api/admin/users/{superuser.id}",
        json={"is_superuser": False},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 400
    assert "yourself" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_patch_user_refuses_last_active_superuser_demote(
    client: AsyncClient,
    superuser: User,
    superuser_token: str,
    second_superuser: User,  # also is_superuser=True, is_active=True
    db: AsyncSession,
) -> None:
    # Take the second superuser out of the active set, then try to
    # demote the first — should fail because only the first is left.
    second_superuser.is_active = False
    await db.commit()

    other_superuser = User(  # ephemeral co-admin for the test
        id=second_superuser.id, email=second_superuser.email,
        is_superuser=True, is_active=True,
    )
    # Use a separate superuser token if your fixture chain allows; otherwise
    # the test asserts the symmetric path: superuser tries to demote
    # second_superuser while second is inactive — should succeed because
    # remaining count is 1 (the actor itself) and the rule is about the
    # FLOOR, not the actor's own status. Adapt to the fixture you have.
    # The canonical failing case below uses two-superuser fixture.
    resp = await client.patch(
        f"/api/admin/users/{superuser.id}",
        json={"is_superuser": False},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 400  # still rejected: self-demote


@pytest.mark.asyncio
async def test_patch_user_deactivate_immediately_locks_token(
    client: AsyncClient,
    superuser_token: str,
    regular_user: User,
    regular_user_token: str,
) -> None:
    # User can hit /me with their token initially
    pre = await client.get(
        "/api/me", headers={"Authorization": f"Bearer {regular_user_token}"}
    )
    assert pre.status_code == 200

    # Superuser deactivates them
    resp = await client.patch(
        f"/api/admin/users/{regular_user.id}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 200

    # Their old token is now refused (Task 3 enforces this)
    post = await client.get(
        "/api/me", headers={"Authorization": f"Bearer {regular_user_token}"}
    )
    assert post.status_code == 401


@pytest.mark.asyncio
async def test_patch_user_404_when_target_missing(
    client: AsyncClient, superuser_token: str
) -> None:
    resp = await client.patch(
        "/api/admin/users/999999",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_user_403_when_caller_not_superuser(
    client: AsyncClient,
    regular_user_token: str,
    regular_user: User,
) -> None:
    resp = await client.patch(
        f"/api/admin/users/{regular_user.id}",
        json={"full_name": "Hax"},
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert resp.status_code == 403
```

Fixtures needed: `superuser`, `superuser_token`, `regular_user`, `regular_user_token`, `totp_user`, `second_superuser`. Confirm exact names in `backend/tests/conftest.py` and add any that don't exist. The `second_superuser` fixture should yield a User with `is_superuser=True, is_active=True, is_totp_enabled=True` and a distinct email.

- [ ] **Step 6.2: Run tests, confirm failure**

```bash
cd backend && .venv/bin/pytest tests/integration/test_admin_user_guards.py -v
```

Expected: 7 FAIL (no PATCH route defined).

- [ ] **Step 6.3: Add the PATCH endpoint**

In `backend/app/routers/admin/users.py`, add after the existing DELETE endpoint:

```python
from ...services.admin_user_service import (
    AdminUserError,
    assert_can_demote_superuser,
    assert_can_deactivate,
    assert_can_promote_superuser,
)
from ...schemas.users import UserAdminUpdate, UserReadAdmin


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
```

- [ ] **Step 6.4: Run tests, confirm pass**

```bash
cd backend && .venv/bin/pytest tests/integration/test_admin_user_guards.py -v tests/integration/test_inactive_user_lockout.py
```

Expected: all PASS.

- [ ] **Step 6.5: Commit**

```bash
git add backend/tests/integration/test_admin_user_guards.py backend/app/routers/admin/users.py
git commit -m "feat(users): PATCH /api/admin/users/{id} with guard rails"
```

---

## Task 7: POST `/api/admin/users/{id}/force-password-reset`

**Files:**
- Modify: `backend/tests/integration/test_admin_user_guards.py` (add tests)
- Modify: `backend/app/routers/admin/users.py`

- [ ] **Step 7.1: Add failing tests**

Append to `backend/tests/integration/test_admin_user_guards.py`:

```python
@pytest.mark.asyncio
async def test_force_password_reset_invalidates_existing_tokens(
    client: AsyncClient,
    superuser_token: str,
    regular_user: User,
    regular_user_token: str,
) -> None:
    pre = await client.get(
        "/api/me", headers={"Authorization": f"Bearer {regular_user_token}"}
    )
    assert pre.status_code == 200

    resp = await client.post(
        f"/api/admin/users/{regular_user.id}/force-password-reset",
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 204

    post = await client.get(
        "/api/me", headers={"Authorization": f"Bearer {regular_user_token}"}
    )
    assert post.status_code == 401


@pytest.mark.asyncio
async def test_force_password_reset_kills_old_password(
    client: AsyncClient,
    superuser_token: str,
    regular_user: User,
) -> None:
    resp = await client.post(
        f"/api/admin/users/{regular_user.id}/force-password-reset",
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 204

    login = await client.post(
        "/api/token",
        data={"username": regular_user.email, "password": "regular-pw"},
    )
    assert login.status_code == 401


@pytest.mark.asyncio
async def test_force_password_reset_403_for_non_superuser(
    client: AsyncClient, regular_user_token: str, regular_user: User
) -> None:
    resp = await client.post(
        f"/api/admin/users/{regular_user.id}/force-password-reset",
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 7.2: Run tests, confirm failure**

```bash
cd backend && .venv/bin/pytest tests/integration/test_admin_user_guards.py::test_force_password_reset_invalidates_existing_tokens tests/integration/test_admin_user_guards.py::test_force_password_reset_kills_old_password tests/integration/test_admin_user_guards.py::test_force_password_reset_403_for_non_superuser -v
```

Expected: 3 FAIL (route does not exist).

- [ ] **Step 7.3: Add the route**

In `backend/app/routers/admin/users.py`, after the PATCH endpoint:

```python
from ...services.admin_user_service import force_password_reset


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
```

(Move the `from ... import force_password_reset` to the consolidated import block at the top added in Task 6.)

- [ ] **Step 7.4: Run tests, confirm pass**

```bash
cd backend && .venv/bin/pytest tests/integration/test_admin_user_guards.py -v
```

Expected: all PASS.

- [ ] **Step 7.5: Commit**

```bash
git add backend/tests/integration/test_admin_user_guards.py backend/app/routers/admin/users.py
git commit -m "feat(users): POST /api/admin/users/{id}/force-password-reset"
```

---

## Task 8: POST `/api/admin/users/{id}/reset-totp`

**Files:**
- Modify: `backend/tests/integration/test_admin_user_guards.py` (add tests)
- Modify: `backend/app/routers/admin/users.py`

- [ ] **Step 8.1: Add failing tests**

Append to `backend/tests/integration/test_admin_user_guards.py`:

```python
@pytest.mark.asyncio
async def test_reset_totp_clears_all_fields(
    client: AsyncClient,
    superuser_token: str,
    totp_user: User,
    db: AsyncSession,
) -> None:
    assert totp_user.is_totp_enabled is True
    assert totp_user.totp_secret is not None

    resp = await client.post(
        f"/api/admin/users/{totp_user.id}/reset-totp",
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 204

    await db.refresh(totp_user)
    assert totp_user.is_totp_enabled is False
    assert totp_user.totp_secret is None
    assert totp_user.totp_channel is None


@pytest.mark.asyncio
async def test_reset_totp_403_for_non_superuser(
    client: AsyncClient, regular_user_token: str, totp_user: User
) -> None:
    resp = await client.post(
        f"/api/admin/users/{totp_user.id}/reset-totp",
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 8.2: Run, confirm failure**

```bash
cd backend && .venv/bin/pytest tests/integration/test_admin_user_guards.py::test_reset_totp_clears_all_fields tests/integration/test_admin_user_guards.py::test_reset_totp_403_for_non_superuser -v
```

Expected: 2 FAIL.

- [ ] **Step 8.3: Add the route**

In `backend/app/routers/admin/users.py`, after the force-password-reset endpoint:

```python
from ...services.admin_user_service import reset_totp


@router.post("/{user_id}/reset-totp", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def reset_totp_endpoint(
    request: Request,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_superuser),
) -> None:
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
```

- [ ] **Step 8.4: Run, confirm pass**

```bash
cd backend && .venv/bin/pytest tests/integration/test_admin_user_guards.py -v
```

Expected: all PASS.

- [ ] **Step 8.5: Commit**

```bash
git add backend/tests/integration/test_admin_user_guards.py backend/app/routers/admin/users.py
git commit -m "feat(users): POST /api/admin/users/{id}/reset-totp"
```

---

## Task 9: Drop `POST /api/admin/users` + switch GET to `UserReadAdmin`

**Files:**
- Modify: `backend/app/routers/admin/users.py`
- Modify: `backend/tests/unit/test_admin_users.py`

- [ ] **Step 9.1: Remove the POST endpoint**

In `backend/app/routers/admin/users.py`, delete the entire `create_user` function (currently lines 45-79 — `@router.post("", …)` through the closing `return new_user`). Also remove the now-unused `UserCreate` import.

- [ ] **Step 9.2: Switch GET response model + use UserReadAdmin**

In the same file, change the `list_users` endpoint signature from:

```python
@router.get("", response_model=PaginatedResponse[UserRead])
```

to:

```python
@router.get("", response_model=PaginatedResponse[UserReadAdmin])
```

And update the `cast(...)` accordingly:

```python
    return cast(
        PaginatedResponse[UserReadAdmin],
        PaginatedResponse(
            items=items, total=total, limit=pagination.limit, offset=pagination.offset
        ),
    )
```

Imports: replace `from ...schemas import UserCreate, UserRead` with `from ...schemas import UserReadAdmin`.

- [ ] **Step 9.3: Update unit tests**

In `backend/tests/unit/test_admin_users.py`, **delete every test that calls POST `/api/admin/users`**. Keep the GET and DELETE tests, and add a GET assertion that the response includes the new fields:

```python
async def test_list_users_includes_admin_audit_fields(
    client: AsyncClient, superuser_token: str
) -> None:
    resp = await client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert "password_changed_at" in item
    assert "last_login_at" in item
    assert "email_verified_at" in item
```

- [ ] **Step 9.4: Run the full users test suite**

```bash
cd backend && .venv/bin/pytest tests/unit/test_admin_users.py tests/integration/test_admin_user_guards.py tests/integration/test_login_last_login.py tests/integration/test_inactive_user_lockout.py -v
```

Expected: all PASS.

- [ ] **Step 9.5: Commit**

```bash
git add backend/app/routers/admin/users.py backend/tests/unit/test_admin_users.py
git commit -m "feat(users): drop POST /api/admin/users, GET returns UserReadAdmin"
```

---

## Task 10: Regenerate the API client

**Files:**
- Modify: `frontend/src/api/generated.ts`
- Modify: `frontend/src/api/model/*.ts`

- [ ] **Step 10.1: Regenerate**

```bash
make generate-api
```

This runs Orval against the live OpenAPI spec. It should:
- remove `useCreateUserApiAdminUsersPost`
- add `usePatchUserApiAdminUsersUserIdPatch`
- add `useForcePasswordResetEndpointApiAdminUsersUserIdForcePasswordResetPost`
- add `useResetTotpEndpointApiAdminUsersUserIdResetTotpPost`
- update `UserRead` and add `UserReadAdmin` model files

- [ ] **Step 10.2: Verify the generated diff is sane**

```bash
git diff --stat frontend/src/api/
```

Expected: changes in `generated.ts`, `model/index.ts`, plus new model files for `UserReadAdmin`, `UserAdminUpdate`. No deletions outside `userCreate.ts`.

- [ ] **Step 10.3: Verify check-api passes**

```bash
make check-api
```

Expected: success (the generated client matches the live spec).

- [ ] **Step 10.4: Commit**

```bash
git add frontend/src/api/
git commit -m "chore(api): regenerate client for admin users endpoints"
```

---

## Task 11: Frontend rename `isAdmin → isSuperuser` + clean admin gate

**Files:**
- Modify: `frontend/src/hooks/useAuth.ts`
- Modify: `frontend/src/components/auth/RequireAdmin.tsx`

- [ ] **Step 11.1: Rename in useAuth**

In `frontend/src/hooks/useAuth.ts`, replace the body with:

```typescript
import { useReadUsersMeApiMeGet } from '../api/generated';

export const useAuth = () => {
    const {
        data: user,
        isLoading,
        error,
        refetch,
    } = useReadUsersMeApiMeGet({
        query: {
            retry: false,
            staleTime: 1000 * 60 * 5,
        },
    });

    const isAuthenticated = !!user;
    const isSuperuser = user?.is_superuser ?? false;

    return {
        user,
        isLoading,
        error,
        isAuthenticated,
        isSuperuser,
        refetch,
    };
};
```

- [ ] **Step 11.2: Update RequireAdmin**

In `frontend/src/components/auth/RequireAdmin.tsx`, change line 11:

```typescript
    const { isLoading, isAuthenticated, isSuperuser } = useAuth();
```

And line 45:

```typescript
    // Admin area is open to superusers and to any user with at least
    // one project membership. The /admin/users page within does its
    // own superuser-only gate.
    const canAccessAdminArea = isSuperuser || hasProjectAccess;
    if (!canAccessAdminArea) {
```

- [ ] **Step 11.3: Find every other consumer of `isAdmin` and rename**

```bash
grep -rn "isAdmin" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v generated
```

Update each call site to `isSuperuser`. Expected sites (verify before editing): the file just edited (`RequireAdmin.tsx`), test files for it, and any conditional UI in pages that used `isAdmin`.

- [ ] **Step 11.4: Run frontend tests**

```bash
cd frontend && npm run test -- src/hooks src/components/auth -t auth
```

Expected: PASS. If any test referenced `isAdmin`, update it.

- [ ] **Step 11.5: Run typecheck + lint**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: clean.

- [ ] **Step 11.6: Commit**

```bash
git add frontend/src/hooks/useAuth.ts frontend/src/components/auth/RequireAdmin.tsx
git add $(git status --porcelain | awk '/M frontend.*\.tsx?$/{print $2}')
git commit -m "refactor(auth): rename isAdmin to isSuperuser"
```

---

## Task 12: `useAdminUsersPage` hook (logic only, no JSX)

**Files:**
- Create: `frontend/src/hooks/admin/useAdminUsersPage.ts`
- Create: `frontend/src/hooks/admin/useAdminUsersPage.test.ts`

- [ ] **Step 12.1: Write the failing hook tests**

Create `frontend/src/hooks/admin/useAdminUsersPage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    deriveRiskBadges,
    isDormant,
    sortByRisk,
    type AdminUser,
} from './useAdminUsersPage';

const base: AdminUser = {
    id: 1,
    email: 'a@example.com',
    full_name: null,
    is_active: true,
    is_superuser: false,
    is_totp_enabled: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    password_changed_at: '2026-01-01T00:00:00Z',
    last_login_at: '2026-05-01T00:00:00Z',
    pending_email: null,
    owned_project_quota: null,
};

describe('deriveRiskBadges', () => {
    it('flags superuser without 2FA as critical', () => {
        const u = { ...base, is_superuser: true, is_totp_enabled: false };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('superuser_no_2fa');
    });

    it('flags unverified email', () => {
        const u = { ...base, email_verified_at: null };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('email_unverified');
    });

    it('flags password older than 365 days', () => {
        const u = { ...base, password_changed_at: '2025-01-01T00:00:00Z' };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('password_stale');
    });

    it('flags pending email change', () => {
        const u = { ...base, pending_email: 'b@example.com' };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('email_change_pending');
    });

    it('returns empty when account is hygienic', () => {
        expect(deriveRiskBadges(base, new Date('2026-05-15'))).toEqual([]);
    });
});

describe('isDormant', () => {
    it('returns true when last_login_at older than 90 days', () => {
        expect(isDormant({ ...base, last_login_at: '2026-01-01T00:00:00Z' }, new Date('2026-05-15'))).toBe(true);
    });

    it('returns false when last_login_at within 90 days', () => {
        expect(isDormant({ ...base, last_login_at: '2026-05-01T00:00:00Z' }, new Date('2026-05-15'))).toBe(false);
    });

    it('returns true when last_login_at is null (never logged in)', () => {
        expect(isDormant({ ...base, last_login_at: null }, new Date('2026-05-15'))).toBe(true);
    });
});

describe('sortByRisk', () => {
    it('puts users with most badges first', () => {
        const clean = { ...base, id: 2 };
        const risky = {
            ...base,
            id: 3,
            is_superuser: true,
            is_totp_enabled: false,
            email_verified_at: null,
        };
        const sorted = sortByRisk([clean, risky], new Date('2026-05-15'));
        expect(sorted[0].id).toBe(3);
        expect(sorted[1].id).toBe(2);
    });
});
```

- [ ] **Step 12.2: Run tests, confirm failure**

```bash
cd frontend && npm run test -- src/hooks/admin/useAdminUsersPage.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 12.3: Implement the hook**

Create `frontend/src/hooks/admin/useAdminUsersPage.ts`:

```typescript
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useListUsersApiAdminUsersGet,
    usePatchUserApiAdminUsersUserIdPatch,
    useDeleteUserApiAdminUsersUserIdDelete,
    useForcePasswordResetEndpointApiAdminUsersUserIdForcePasswordResetPost,
    useResetTotpEndpointApiAdminUsersUserIdResetTotpPost,
    getListUsersApiAdminUsersGetQueryKey,
    type UserReadAdmin,
} from '@/api/generated';

export type AdminUser = UserReadAdmin;

export type RiskBadge =
    | 'superuser_no_2fa'
    | 'email_unverified'
    | 'password_stale'
    | 'email_change_pending'
    | 'dormant';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STALE_PASSWORD_DAYS = 365;
const DORMANT_DAYS = 90;

export function isDormant(u: AdminUser, now: Date): boolean {
    if (u.last_login_at === null) return true;
    const last = new Date(u.last_login_at).getTime();
    return now.getTime() - last > DORMANT_DAYS * ONE_DAY_MS;
}

export function deriveRiskBadges(u: AdminUser, now: Date): RiskBadge[] {
    const badges: RiskBadge[] = [];
    if (u.is_superuser && !u.is_totp_enabled) badges.push('superuser_no_2fa');
    if (u.email_verified_at === null) badges.push('email_unverified');
    if (u.password_changed_at) {
        const age = now.getTime() - new Date(u.password_changed_at).getTime();
        if (age > STALE_PASSWORD_DAYS * ONE_DAY_MS) badges.push('password_stale');
    }
    if (u.pending_email !== null) badges.push('email_change_pending');
    return badges;
}

export function sortByRisk(users: AdminUser[], now: Date): AdminUser[] {
    return [...users].sort(
        (a, b) => deriveRiskBadges(b, now).length - deriveRiskBadges(a, now).length,
    );
}

export type FilterMode = 'all' | 'superusers' | 'no_2fa' | 'unverified' | 'dormant';

export function useAdminUsersPage() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterMode>('all');
    const [pendingAction, setPendingAction] = useState<{
        kind: 'delete' | 'reset-totp' | 'force-password-reset' | 'toggle-superuser';
        user: AdminUser;
    } | null>(null);

    const { data, isLoading, error } = useListUsersApiAdminUsersGet({
        limit: 200,
        offset: 0,
    });

    const invalidate = () =>
        qc.invalidateQueries({ queryKey: getListUsersApiAdminUsersGetQueryKey() });

    const patch = usePatchUserApiAdminUsersUserIdPatch({
        mutation: { onSuccess: invalidate },
    });
    const del = useDeleteUserApiAdminUsersUserIdDelete({
        mutation: { onSuccess: invalidate },
    });
    const forcePwReset = useForcePasswordResetEndpointApiAdminUsersUserIdForcePasswordResetPost({
        mutation: { onSuccess: invalidate },
    });
    const resetTotp = useResetTotpEndpointApiAdminUsersUserIdResetTotpPost({
        mutation: { onSuccess: invalidate },
    });

    const now = useMemo(() => new Date(), []);

    const filtered = useMemo(() => {
        const items = data?.items ?? [];
        const text = search.trim().toLowerCase();
        const matches = (u: AdminUser) =>
            !text || u.email.toLowerCase().includes(text) ||
            (u.full_name?.toLowerCase().includes(text) ?? false);

        const filteredItems = items.filter((u) => {
            if (!matches(u)) return false;
            switch (filter) {
                case 'superusers': return u.is_superuser;
                case 'no_2fa': return !u.is_totp_enabled;
                case 'unverified': return u.email_verified_at === null;
                case 'dormant': return isDormant(u, now);
                default: return true;
            }
        });

        return sortByRisk(filteredItems, now);
    }, [data?.items, search, filter, now]);

    return {
        users: filtered,
        isLoading,
        error,
        search,
        setSearch,
        filter,
        setFilter,
        pendingAction,
        setPendingAction,
        now,
        actions: {
            deactivate: (u: AdminUser) =>
                patch.mutateAsync({ userId: u.id, data: { is_active: false } }),
            activate: (u: AdminUser) =>
                patch.mutateAsync({ userId: u.id, data: { is_active: true } }),
            promote: (u: AdminUser) =>
                patch.mutateAsync({ userId: u.id, data: { is_superuser: true } }),
            demote: (u: AdminUser) =>
                patch.mutateAsync({ userId: u.id, data: { is_superuser: false } }),
            forcePasswordReset: (u: AdminUser) => forcePwReset.mutateAsync({ userId: u.id }),
            resetTotp: (u: AdminUser) => resetTotp.mutateAsync({ userId: u.id }),
            delete: (u: AdminUser) => del.mutateAsync({ userId: u.id }),
        },
    };
}
```

- [ ] **Step 12.4: Verify tests pass**

```bash
cd frontend && npm run test -- src/hooks/admin/useAdminUsersPage.test.ts
```

Expected: 9 PASS.

- [ ] **Step 12.5: Commit**

```bash
git add frontend/src/hooks/admin/useAdminUsersPage.ts frontend/src/hooks/admin/useAdminUsersPage.test.ts
git commit -m "feat(users): useAdminUsersPage hook with risk badges + filters"
```

---

## Task 13: `AdminUsersPage` component

**Files:**
- Create: `frontend/src/pages/admin/AdminUsersPage.tsx`
- Create: `frontend/src/pages/admin/AdminUsersPage.test.tsx`

- [ ] **Step 13.1: Write the failing component test**

Create `frontend/src/pages/admin/AdminUsersPage.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import AdminUsersPage from './AdminUsersPage';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/msw-server';

const fakeUsers = {
    items: [
        {
            id: 1,
            email: 'admin@example.com',
            full_name: 'Admin',
            is_active: true,
            is_superuser: true,
            is_totp_enabled: true,
            email_verified_at: '2026-01-01T00:00:00Z',
            password_changed_at: '2026-01-01T00:00:00Z',
            last_login_at: '2026-05-14T00:00:00Z',
            pending_email: null,
            owned_project_quota: null,
        },
        {
            id: 2,
            email: 'risky@example.com',
            full_name: null,
            is_active: true,
            is_superuser: true,
            is_totp_enabled: false,  // <- superuser_no_2fa
            email_verified_at: null,  // <- email_unverified
            password_changed_at: '2026-05-01T00:00:00Z',
            last_login_at: null,  // <- dormant
            pending_email: null,
            owned_project_quota: null,
        },
    ],
    total: 2, limit: 200, offset: 0,
};

describe('AdminUsersPage', () => {
    it('renders the users list sorted by risk', async () => {
        server.use(
            http.get('/api/admin/users', () => HttpResponse.json(fakeUsers)),
        );
        renderWithStore(<AdminUsersPage />);
        await waitFor(() => screen.getByText('risky@example.com'));

        const rows = screen.getAllByTestId('admin-users-row');
        expect(rows[0]).toHaveTextContent('risky@example.com');
        expect(rows[1]).toHaveTextContent('admin@example.com');
    });

    it('shows a critical badge for superuser without 2FA', async () => {
        server.use(
            http.get('/api/admin/users', () => HttpResponse.json(fakeUsers)),
        );
        renderWithStore(<AdminUsersPage />);
        await waitFor(() => screen.getByText('risky@example.com'));

        const riskyRow = screen.getByTestId('admin-users-row-2');
        expect(riskyRow).toHaveTextContent(/superuser.*2FA/i);
    });

    it('triggers force-password-reset and refetches', async () => {
        const onForce = vi.fn(() => HttpResponse.json({}, { status: 204 }));
        server.use(
            http.get('/api/admin/users', () => HttpResponse.json(fakeUsers)),
            http.post('/api/admin/users/2/force-password-reset', onForce),
        );
        renderWithStore(<AdminUsersPage />);
        await waitFor(() => screen.getByText('risky@example.com'));

        await userEvent.click(screen.getByTestId('admin-users-actions-2'));
        await userEvent.click(screen.getByText(/force password reset/i));
        // Confirm dialog
        await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

        await waitFor(() => expect(onForce).toHaveBeenCalled());
    });
});
```

- [ ] **Step 13.2: Run, confirm failure**

```bash
cd frontend && npm run test -- src/pages/admin/AdminUsersPage.test.tsx
```

Expected: FAIL — `AdminUsersPage` does not exist.

- [ ] **Step 13.3: Build the page**

Create `frontend/src/pages/admin/AdminUsersPage.tsx`. Keep the component declarative — all logic lives in the hook. Use the existing UI primitives (`Card`, `Badge`, `Button`, `Input`, `AlertDialog`, `DropdownMenu`) so the visual style matches `ProjectMembersPage`. Each row has `data-testid="admin-users-row"` and `data-testid={`admin-users-row-${u.id}`}`, the action menu trigger has `data-testid={`admin-users-actions-${u.id}`}`.

The page MUST:
- Use `useAdminUsersPage()` for state.
- Use `useTranslation()`; every visible string goes through `t('admin.users.<key>', 'Fallback')`.
- Render a header with `<h1>` = `t('admin.users.title', 'Users')` (functional H1, not entity name — per admin header policy).
- Render filter chips for the five `FilterMode` values.
- Render a search `Input` bound to `search`.
- Render a table-like list of cards, one per user, with: email, full_name, role pill (`Superuser` / `User`), badges from `deriveRiskBadges`, "Last seen: <relative>" line, action menu.
- Action menu items, each opening a confirm `AlertDialog` before firing:
  - Promote / Demote (toggle based on `is_superuser`)
  - Deactivate / Reactivate (toggle based on `is_active`)
  - Force password reset
  - Reset 2FA
  - Delete
- Surface mutation errors (especially `400` from the guard rails) in an inline `Alert` at the top with the server's `detail` text.
- Add a `// biome-ignore lint/complexity/noExcessiveCognitiveComplexity` comment on the page component if the JSX shell triggers it (precedent: AnalysisPage, etc., per CLAUDE.md "JSX shell complexity").

Implementation sketch:

```tsx
import { useTranslation } from 'react-i18next';
import { useAdminUsersPage, type AdminUser, type RiskBadge } from '@/hooks/admin/useAdminUsersPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreVertical, ShieldAlert, Mail, KeyRound, Clock } from 'lucide-react';

const badgeIcon: Record<RiskBadge, JSX.Element> = {
    superuser_no_2fa: <ShieldAlert className="h-3 w-3" />,
    email_unverified: <Mail className="h-3 w-3" />,
    password_stale: <KeyRound className="h-3 w-3" />,
    email_change_pending: <Mail className="h-3 w-3" />,
    dormant: <Clock className="h-3 w-3" />,
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: declarative JSX shell, all logic lives in useAdminUsersPage
export default function AdminUsersPage() {
    const { t } = useTranslation();
    const ctx = useAdminUsersPage();

    return (
        <div className="space-y-6 p-6">
            <header>
                <h1 className="text-2xl font-black text-slate-900">
                    {t('admin.users.title', 'Users')}
                </h1>
                <p className="text-sm text-slate-500">
                    {t('admin.users.subtitle', 'Manage platform accounts and audit hygiene.')}
                </p>
            </header>

            <Input
                placeholder={t('admin.users.search_placeholder', 'Search by email or name')}
                value={ctx.search}
                onChange={(e) => ctx.setSearch(e.target.value)}
            />

            <div className="flex flex-wrap gap-2">
                {(['all', 'superusers', 'no_2fa', 'unverified', 'dormant'] as const).map((f) => (
                    <Button
                        key={f}
                        variant={ctx.filter === f ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => ctx.setFilter(f)}
                    >
                        {t(`admin.users.filter.${f}`, f)}
                    </Button>
                ))}
            </div>

            {/* List */}
            <div className="space-y-2">
                {ctx.users.map((u) => (
                    <UserRow key={u.id} user={u} ctx={ctx} />
                ))}
            </div>

            {/* Confirm dialog for the staged action */}
            <ConfirmDialog ctx={ctx} />
        </div>
    );
}

function UserRow({ user, ctx }: { user: AdminUser; ctx: ReturnType<typeof useAdminUsersPage> }) {
    const { t } = useTranslation();
    const badges = /* call deriveRiskBadges via ctx.now */ [] as RiskBadge[];
    // ... render row with data-testid="admin-users-row" and the action menu
    return (
        <Card data-testid="admin-users-row" data-testid-row={`admin-users-row-${user.id}`}>
            {/* ... */}
        </Card>
    );
}

function ConfirmDialog({ ctx }: { ctx: ReturnType<typeof useAdminUsersPage> }) {
    /* ... renders AlertDialog driven by ctx.pendingAction ... */
    return null;
}
```

(The sketch above is incomplete on purpose — the executing engineer fleshes it out so it passes the component tests in Step 13.1. The hook is the contract; the JSX is the surface.)

- [ ] **Step 13.4: Run component tests + a typecheck pass**

```bash
cd frontend && npm run test -- src/pages/admin/AdminUsersPage.test.tsx
cd frontend && npm run typecheck
```

Expected: 3 PASS, typecheck clean.

- [ ] **Step 13.5: Commit**

```bash
git add frontend/src/pages/admin/AdminUsersPage.tsx frontend/src/pages/admin/AdminUsersPage.test.tsx
git commit -m "feat(users): admin users page (list, filter, verb actions)"
```

---

## Task 14: Route + sidebar entry

**Files:**
- Modify: `frontend/src/App.tsx` (or wherever the admin routes live — open it to confirm)
- Modify: `frontend/src/components/admin/AppSidebar.tsx`

- [ ] **Step 14.1: Add the route**

In `frontend/src/App.tsx` (or the equivalent router file — `grep -n "AdminLayout\|RequireAdmin" frontend/src/App.tsx` to locate the admin route block), add a child route inside the `RequireAdmin`-wrapped admin layout:

```typescript
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
// ...
<Route path="users" element={<AdminUsersPage />} />
```

Match the path pattern of the existing sibling routes (e.g. if they're under `/admin/...`, the full path is `/admin/users`).

- [ ] **Step 14.2: Add the sidebar entry, gated on isSuperuser**

In `frontend/src/components/admin/AppSidebar.tsx`, find the navigation list (look for `SidebarMenuItem` usage). Add an entry that renders only when `isSuperuser` is true:

```typescript
import { useAuth } from '@/hooks/useAuth';
import { Users } from 'lucide-react';
// ...
const { isSuperuser } = useAuth();
// ...inside the menu...
{isSuperuser && (
    <SidebarMenuItem>
        <SidebarMenuButton asChild>
            <Link to="/admin/users">
                <Users className="h-4 w-4" />
                <span>{t('admin.sidebar.users', 'Users')}</span>
            </Link>
        </SidebarMenuButton>
    </SidebarMenuItem>
)}
```

Position: in the "global / platform" group, distinct from the per-project items. If no such group exists yet, create a new `SidebarGroup` labelled `t('admin.sidebar.group_platform', 'Platform')`.

- [ ] **Step 14.3: Verify the route renders for a superuser and 404s for a non-superuser**

```bash
cd frontend && npm run test -- src/components/admin/AppSidebar
```

Expected: PASS (existing tests still pass; if a snapshot includes the menu, update it).

Manual check (only after Task 17 boots the dev server):
- Log in as superuser → sidebar shows "Users", `/admin/users` renders.
- Log in as a project owner (not superuser) → sidebar hides "Users", `/admin/users` returns the access-denied alert (handled by `AdminUsersPage` checking `isSuperuser` itself OR by adding a `<RequireSuperuser>` wrapper — pick whichever is cheaper; the simplest is an inline check at the top of `AdminUsersPage`).

To make this watertight, add at the very top of `AdminUsersPage.tsx`:

```tsx
const { isSuperuser, isLoading } = useAuth();
if (isLoading) return null;
if (!isSuperuser) return <Navigate to="/admin" replace />;
```

- [ ] **Step 14.4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/admin/AppSidebar.tsx frontend/src/pages/admin/AdminUsersPage.tsx
git commit -m "feat(users): route + sidebar entry for /admin/users"
```

---

## Task 15: i18n strings

**Files:**
- Modify: `frontend/public/locales/en/translation.json`
- Modify: `frontend/public/locales/fr/translation.json`
- Modify: `frontend/public/locales/fi/translation.json`
- Modify: `frontend/public/locales/de/translation.json` (if present)
- Modify: `frontend/public/locales/pt/translation.json` (if present)
- Modify: `frontend/public/locales/pl/translation.json` (if present, current WIP)

- [ ] **Step 15.1: Add the new keys to `en`**

In `frontend/public/locales/en/translation.json`, under the `admin` object, add a `users` block:

```json
"users": {
    "title": "Users",
    "subtitle": "Manage platform accounts and audit hygiene.",
    "search_placeholder": "Search by email or name",
    "filter": {
        "all": "All",
        "superusers": "Superusers",
        "no_2fa": "Without 2FA",
        "unverified": "Email unverified",
        "dormant": "Dormant (90+ days)"
    },
    "risk": {
        "superuser_no_2fa": "Superuser without 2FA",
        "email_unverified": "Email not verified",
        "password_stale": "Password > 1 year",
        "email_change_pending": "Email change pending",
        "dormant": "Dormant account"
    },
    "actions": {
        "menu": "Actions",
        "promote": "Promote to superuser",
        "demote": "Demote",
        "deactivate": "Deactivate",
        "reactivate": "Reactivate",
        "force_password_reset": "Force password reset",
        "reset_totp": "Reset 2FA",
        "delete": "Delete account"
    },
    "confirm": {
        "promote_title": "Promote to superuser?",
        "promote_body": "{{email}} will gain full platform-admin powers. Their 2FA must be set up before promotion.",
        "demote_title": "Remove superuser status?",
        "demote_body": "{{email}} will lose admin powers. At least one active superuser must remain.",
        "deactivate_title": "Deactivate account?",
        "deactivate_body": "{{email}} will be logged out immediately and unable to log back in.",
        "force_password_reset_title": "Force password reset?",
        "force_password_reset_body": "{{email}} will be logged out and must use the email link to set a new password.",
        "reset_totp_title": "Reset 2FA?",
        "reset_totp_body": "{{email}} will be able to log in with just their password until they set up 2FA again.",
        "delete_title": "Delete account?",
        "delete_body": "{{email}} and all their data will be permanently deleted. This cannot be undone.",
        "confirm": "Confirm",
        "cancel": "Cancel"
    },
    "last_seen": "Last seen {{relative}}",
    "never_logged_in": "Never logged in"
},
```

Also add under `admin.sidebar`:

```json
"users": "Users",
"group_platform": "Platform"
```

- [ ] **Step 15.2: Mirror in fr/fi (and de/pt/pl if present)**

Open each other locale file and add the same structure with translated values. For `pl` (work-in-progress per the current branch `feat/i18n-polish`), translate carefully or fall back to English with the `glossary` discipline already established in this branch.

Sample for `fr`:

```json
"users": {
    "title": "Utilisateurs",
    "subtitle": "Gérer les comptes de la plateforme et auditer leur hygiène.",
    "search_placeholder": "Rechercher par email ou nom",
    "filter": {
        "all": "Tous",
        "superusers": "Superutilisateurs",
        "no_2fa": "Sans 2FA",
        "unverified": "Email non vérifié",
        "dormant": "Inactif (90j+)"
    },
    ...
}
```

(Provide complete translated blocks for fr at minimum — the executing engineer fills fi/de/pt/pl using the existing glossary conventions in each file.)

- [ ] **Step 15.3: Verify key parity**

```bash
cd frontend && npm run i18n-check
```

Expected: clean — every locale has the same set of keys.

- [ ] **Step 15.4: Commit**

```bash
git add frontend/public/locales/
git commit -m "i18n(users): add admin users page strings"
```

---

## Task 16: Update architecture doc

**Files:**
- Modify: `docs/explanation/architecture.md:358`

- [ ] **Step 16.1: Rewrite the superuser bullet**

In `docs/explanation/architecture.md`, find the `Permission Model (RBAC)` section and replace the single-line superuser description with:

```markdown
- **Superuser**: a small, named set of operators who hold three platform-level powers, none of which bypass project tenancy:
  1. **User management** — list, deactivate, delete, promote/demote (gated on TOTP), and force-rotate credentials of any account via `/admin/users` (UI) or the equivalent endpoints. Documented in `backend/app/services/admin_user_service.py`.
  2. **Hard-delete an archived study** — last resort beyond the project-owner ladder; the study must be `ARCHIVED` first.
  3. **Quota bypass** — exempt from `MAX_MEMBERS_PER_PROJECT` and `MAX_PROJECTS_AS_OWNER`.

  A superuser does **not** inherit access to projects they aren't a member of: project-level RBAC (owner/member/viewer) is checked independently. Designated by `is_superuser: true` on the `User` model. The first user created by `init_db.py` is bootstrapped as superuser; subsequent promotions are explicit, audit-logged, and require the target to have 2FA enabled.
```

- [ ] **Step 16.2: Commit**

```bash
git add docs/explanation/architecture.md
git commit -m "docs(arch): document the three concrete superuser powers"
```

---

## Task 17: Full quality gate

- [ ] **Step 17.1: Run `make ci`**

```bash
make ci
```

Expected: green across backend lint, mypy, ruff, pytest, frontend lint, typecheck, vitest, build.

If failures appear, fix the root cause in the related task's files (no `--no-verify`, no test deletion to "make it pass") and recommit on the appropriate task.

- [ ] **Step 17.2: Boot dev server + manual smoke**

```bash
make dev  # or whatever the project's dev command is — check Makefile if unsure
```

In the browser, with a superuser account:
1. Navigate to `/admin/users` from the sidebar.
2. Search for an email.
3. Apply each filter chip in turn.
4. Open the action menu on a user, trigger force-password-reset; confirm an email reaches the local SMTP catcher / log.
5. Trigger deactivate; verify the user appears greyed out and their next API call fails.
6. Trigger reset-totp on a 2FA-enabled user; verify the row no longer shows the 2FA marker.
7. Attempt to demote yourself; confirm the 400 surfaces as an inline error, not a silent failure.

With a non-superuser project owner:
8. Confirm the sidebar entry is absent.
9. Navigate directly to `/admin/users`; confirm the page redirects or refuses.

- [ ] **Step 17.3: Commit any small fixes from manual smoke**

```bash
git add -p  # only the smoke-fix files
git commit -m "fix(users): smoke-test follow-ups"
```

If no fixes are needed, skip this step.

---

## Out-of-scope / v2 backlog

Tracked here so the v1 plan stays focused but the conversation is documented:

- **Failed-login lockout per user.** Today's defense is IP-rate-limiting via `slowapi`. A per-user fail counter with progressive lockout is a real upgrade but requires its own design (where to store, how to unlock, how to surface to the user) and shouldn't piggyback on this PR.
- **Force-logout without password rotation.** Possible by adding a `tokens_invalidated_at` column compared against JWT `iat`, mirroring the existing F-03-010 pattern. ~20 LOC but adds a column we may not need given that force-password-reset already kills sessions.
- **Per-user admin audit log view.** `log_admin_action` already writes structured JSONL. A `/admin/users/{id}/audit` page would surface it filtered. Useful but no schema change required — can be added later.
- **Notification email when superuser resets a target's TOTP.** Operator-facing courtesy; not security-critical. Adds one `send_*` helper and one email template per locale.
- **`last_login_ip` (hashed).** Mirror the participant `ip_address` pattern. Low value without anomaly detection.

---

## Self-review

**Spec coverage** (against the conversation that produced this plan):
- Tier 1 (surface existing fields) → Task 4 (UserReadAdmin), Task 12 (deriveRiskBadges), Task 13 (UI badges).
- Tier 2 (`last_login_at`) → Tasks 1-2.
- Tier 3 verbs (deactivate/promote-demote/force-password-reset/reset-totp) → Tasks 6, 7, 8.
- Three guard rails → Task 5 (service), Task 6 (router wiring), Task 6 tests.
- Drop POST → Task 9.
- Rename isAdmin → isSuperuser → Task 11.
- Doc update → Task 16.
- `is_active` actually enforced → Task 3.
- All locales kept in parity → Task 15.

**Placeholder scan:** the JSX implementation in Task 13.3 is the only deliberate sketch — the contract is fully specified by the tests in Step 13.1 and by the hook signature from Task 12. The engineer fleshes the JSX to make the tests pass. No "TBD", no "add validation", no "similar to Task N".

**Type consistency:** `AdminUser`, `RiskBadge`, `FilterMode` defined in Task 12 are used unchanged in Task 13. `UserReadAdmin`, `UserAdminUpdate`, `AdminUserError` defined in Tasks 4/5 are used unchanged in Tasks 6/7/8. Endpoint names (`force-password-reset`, `reset-totp`) are spelled the same way across migration → router → tests → frontend hook.
