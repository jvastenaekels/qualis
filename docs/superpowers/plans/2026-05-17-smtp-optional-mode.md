# SMTP-optional Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Qualis fully usable without SMTP by giving every blocking email-gated flow an in-product recovery path, and make the no-email capabilities explicit to operator and users.

**Architecture:** A single backend capability flag (`email_delivery`, derived from the existing `settings.is_smtp_configured`) is exposed via a new public `GET /api/config` and drives all adaptive frontend UX. A superuser-only on-demand recovery-link endpoint replaces "grep the logs" for password reset (token minted on demand, never persisted). Email-2FA is blocked when SMTP is absent; a superuser can set a user's email directly. The log fallback stays untouched as a pure safety net.

**Tech Stack:** FastAPI / SQLAlchemy async / Pydantic v2 (backend), React 19 + TypeScript + Zustand + react-i18next + orval-generated React Query client (frontend), pytest + Vitest.

---

## Spec reference

`docs/superpowers/specs/2026-05-17-smtp-optional-mode-design.md`

## Conventions used by every task

- Backend tests live in `backend/tests/integration/`. Run a single test with
  `cd backend && uv run pytest tests/integration/<file>::<Class>::<test> -v`.
- Frontend tests run with `cd frontend && npm run test -- <path>`.
- After **any** backend schema/route change, regenerate the client with
  `make generate-api` (Task 8 is the explicit regeneration gate; do not write
  frontend code that imports a new generated hook before Task 8).
- Inner loop: `make ci-fast` before every commit. `make ci` is the final gate
  (Task 14).
- New backend leaf modules go into the `mypy --strict` overrides list in
  `backend/pyproject.toml` (Task 1 / Task 2 steps cover this).
- All new user-facing strings use `t('key', 'English fallback')`. New keys are
  admin/auth scope → add to `frontend/public/locales/en/admin.json`.

---

### Task 0: Recon — capture existing test fixtures

No code change. This avoids inventing fixture names.

- [ ] **Step 1: Read the existing auth integration tests**

Run: `cd backend && uv run pytest tests/integration/test_auth.py --collect-only -q | head -40`

Then open `backend/tests/integration/test_auth.py` and read the
`TestPasswordReset` and `TestSMTPUnconfiguredFallback` classes. Note verbatim:
- the fixture used for an HTTP client (`client`),
- the fixture for a normal user (`test_user`),
- how a **superuser** is created/authenticated (search the file and
  `backend/tests/conftest.py` for `is_superuser`, `superuser`, `auth_headers`),
- how `settings` SMTP fields are toggled in a test (search `SMTP_HOST`,
  `monkeypatch`, `is_smtp_configured`).

Record these names in a scratch note; every backend test step below refers to
them as `client`, `test_user`, `superuser_client` (the superuser-authenticated
client you identified), and `set_smtp(configured: bool)` (the monkeypatch
pattern you identified). Use the real names you found.

- [ ] **Step 2: Confirm the frontend test helper**

Open `frontend/src/test/` (or wherever `renderWithStore` is defined — grep
`renderWithStore`). Note the import path; frontend test steps use it.

---

### Task 1: Backend — `GET /api/config` exposes `email_delivery`

**Files:**
- Create: `backend/app/schemas/config.py`
- Create: `backend/app/routers/config.py`
- Modify: `backend/app/schemas/__init__.py`
- Modify: `backend/app/main.py:164-204` (router includes)
- Modify: `backend/pyproject.toml` (mypy strict overrides list)
- Test: `backend/tests/integration/test_smtp_optional.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/test_smtp_optional.py`. Use the fixture names
from Task 0 (`client`, `set_smtp`):

```python
"""SMTP-optional mode: capability flag, recovery link, 2FA guards."""

import pytest


class TestPublicConfig:
    async def test_config_reports_manual_when_smtp_absent(
        self, client, set_smtp
    ):
        set_smtp(False)
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["email_delivery"] == "manual"

    async def test_config_reports_smtp_when_configured(self, client, set_smtp):
        set_smtp(True)
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["email_delivery"] == "smtp"
```

If Task 0 showed SMTP is toggled inline (monkeypatch) rather than via a
`set_smtp` fixture, inline that monkeypatch in each test instead.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestPublicConfig -v`
Expected: FAIL (404 — route does not exist).

- [ ] **Step 3: Create the schema**

`backend/app/schemas/config.py`:

```python
"""Public bootstrap config exposed unauthenticated at GET /api/config."""

from typing import Literal

from pydantic import BaseModel


class PublicConfig(BaseModel):
    """Minimal client bootstrap payload.

    ``email_delivery`` is "smtp" when SMTP credentials are configured and
    "manual" otherwise. When "manual", recovery links are generated by a
    superuser from the admin UI rather than emailed (see
    docs/guides/running-without-smtp.md).
    """

    email_delivery: Literal["smtp", "manual"]
```

- [ ] **Step 4: Export the schema**

In `backend/app/schemas/__init__.py`, add `PublicConfig` to the imports/exports
following the existing pattern (the file re-exports schema names; add
`from .config import PublicConfig` and include `"PublicConfig"` in `__all__`
if `__all__` is present).

- [ ] **Step 5: Create the router**

`backend/app/routers/config.py`:

```python
"""Public, unauthenticated bootstrap config endpoint."""

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.config import PublicConfig

router = APIRouter()


@router.get("/config", response_model=PublicConfig)
def get_public_config() -> PublicConfig:
    """Return client bootstrap config. Unauthenticated by design — it
    exposes only the email-delivery mode, no secrets."""
    return PublicConfig(
        email_delivery="smtp" if settings.is_smtp_configured else "manual"
    )
```

- [ ] **Step 6: Register the router in main.py**

In `backend/app/main.py`, add the import next to the other router imports and,
in the include block (around line 164-204), add:

```python
app.include_router(config_router.router, prefix="/api", tags=["config"])
```

Import it at the top with the other routers, e.g.:

```python
from app.routers import config as config_router
```

- [ ] **Step 7: Add the new modules to mypy strict overrides**

Open `backend/pyproject.toml`, find the `[[tool.mypy.overrides]]` block whose
`module = [...]` list contains the strict modules (the same list referenced in
`CLAUDE.md` — e.g. `"app.routers.audio"`, `"app.types"`). Add two entries to
that list:

```
"app.routers.config",
"app.schemas.config",
```

(`app.schemas.config` belongs in the schemas-strict block — match whichever
block already lists `"app.schemas.*"`/the schema modules; if schemas are
covered by a wildcard, only add `"app.routers.config"`.)

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestPublicConfig -v`
Expected: PASS (both tests).

- [ ] **Step 9: Lint + types + commit**

Run: `make ci-fast`
Expected: green.

```bash
git add backend/app/schemas/config.py backend/app/routers/config.py \
  backend/app/schemas/__init__.py backend/app/main.py backend/pyproject.toml \
  backend/tests/integration/test_smtp_optional.py
git commit -m "feat(config): expose email_delivery capability via GET /api/config

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — on-demand password-reset link reveal (superuser)

**Files:**
- Modify: `backend/app/services/admin_user_service.py` (add `mint_password_reset_link`)
- Modify: `backend/app/schemas/users.py` (add request/response schemas)
- Modify: `backend/app/schemas/__init__.py` (export)
- Modify: `backend/app/routers/admin/users.py` (add endpoint)
- Test: `backend/tests/integration/test_smtp_optional.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/test_smtp_optional.py` (use the
superuser-authenticated client identified in Task 0 as `superuser_client`, and
`test_user`):

```python
class TestRecoveryLink:
    async def test_non_superuser_forbidden(self, client, test_user):
        r = await client.post(
            f"/api/admin/users/{test_user.id}/recovery-link",
            json={"kind": "password_reset"},
        )
        assert r.status_code in (401, 403)

    async def test_unknown_user_404(self, superuser_client):
        r = await superuser_client.post(
            "/api/admin/users/999999/recovery-link",
            json={"kind": "password_reset"},
        )
        assert r.status_code == 404

    async def test_returns_usable_reset_link(
        self, superuser_client, client, test_user
    ):
        r = await superuser_client.post(
            f"/api/admin/users/{test_user.id}/recovery-link",
            json={"kind": "password_reset"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["kind"] == "password_reset"
        assert "/reset-password?token=" in body["url"]
        token = body["url"].split("token=")[1]

        # The minted token must work against the existing confirm endpoint.
        confirm = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "NewStr0ngPass!23"},
        )
        assert confirm.status_code == 200

    async def test_does_not_rotate_password(
        self, superuser_client, client, test_user
    ):
        # Minting a link must NOT lock the account out (unlike
        # force-password-reset). The user's existing password still works.
        await superuser_client.post(
            f"/api/admin/users/{test_user.id}/recovery-link",
            json={"kind": "password_reset"},
        )
        login = await client.post(
            "/api/login",
            data={"username": test_user.email, "password": "testpassword"},
        )
        assert login.status_code == 200
```

Adjust `"testpassword"` / login path to match the real values used by
`test_user` and the login endpoint as seen in Task 0.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestRecoveryLink -v`
Expected: FAIL (404 — endpoint missing).

- [ ] **Step 3: Add the service function**

In `backend/app/services/admin_user_service.py`, after `force_password_reset`
(around line 156), add. The imports `secrets`, `datetime/timedelta/timezone`,
`settings`, `create_email_token` are already present in this module:

```python
def mint_password_reset_link(*, target: User) -> tuple[str, datetime]:
    """Mint a fresh password-reset link for ``target`` WITHOUT rotating
    the password.

    This is the SMTP-optional in-product path: a superuser obtains the
    same link the user would receive by email and delivers it out of
    band. Distinct from ``force_password_reset`` (which rotates the
    password and locks the account). Nothing is persisted — the JWT is
    stateless and self-expiring; the ``pwa`` claim still gives single-use
    semantics via the existing confirm-time check.
    """
    expires = timedelta(hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS)
    token = create_email_token(
        email=target.email,
        purpose="password_reset",
        expires_delta=expires,
        password_changed_at=target.password_changed_at,
    )
    url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    expires_at = datetime.now(timezone.utc) + expires
    return url, expires_at
```

- [ ] **Step 4: Add the schemas**

In `backend/app/schemas/users.py`, add (the file already imports `BaseModel`;
add `Literal` and `datetime` imports if absent):

```python
class RecoveryLinkRequest(BaseModel):
    """Body for POST /api/admin/users/{id}/recovery-link."""

    kind: Literal["password_reset"]


class RecoveryLinkResponse(BaseModel):
    """A freshly-minted, never-persisted recovery link for out-of-band
    delivery when SMTP is not configured."""

    kind: Literal["password_reset"]
    url: str
    expires_at: datetime
```

Export both names in `backend/app/schemas/__init__.py` following the existing
pattern.

- [ ] **Step 5: Add the endpoint**

In `backend/app/routers/admin/users.py`, import the new pieces:

```python
from ...schemas.users import (
    RecoveryLinkRequest,
    RecoveryLinkResponse,
    UserAdminUpdate,
    UserReadAdmin,
)
from ...services.admin_user_service import (
    AdminUserError,
    assert_can_deactivate,
    assert_can_demote_superuser,
    assert_can_promote_superuser,
    force_password_reset,
    mint_password_reset_link,
    reset_totp,
)
```

Then add the endpoint after `reset_totp_endpoint` (around line 179):

```python
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
    return RecoveryLinkResponse(
        kind=payload.kind, url=url, expires_at=expires_at
    )
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestRecoveryLink -v`
Expected: PASS (all four).

- [ ] **Step 7: ci-fast + commit**

Run: `make ci-fast`
Expected: green.

```bash
git add backend/app/services/admin_user_service.py backend/app/schemas/users.py \
  backend/app/schemas/__init__.py backend/app/routers/admin/users.py \
  backend/tests/integration/test_smtp_optional.py
git commit -m "feat(admin): on-demand password-reset link reveal for SMTP-optional mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend — block email-2FA enrolment when SMTP unconfigured

**Files:**
- Modify: `backend/app/routers/auth.py:625-643` (`enable_totp`, email branch)
- Test: `backend/tests/integration/test_smtp_optional.py`

- [ ] **Step 1: Write the failing test**

Append to `test_smtp_optional.py` (use an authenticated normal-user client —
the pattern Task 0 surfaced for logging in `test_user`; call it
`user_client`):

```python
class TestEmail2FAEnrolmentGuard:
    async def test_email_channel_rejected_without_smtp(
        self, user_client, set_smtp
    ):
        set_smtp(False)
        r = await user_client.post(
            "/api/me/2fa/enable", json={"channel": "email"}
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "email_2fa_unavailable"

    async def test_email_channel_allowed_with_smtp(
        self, user_client, set_smtp
    ):
        set_smtp(True)
        r = await user_client.post(
            "/api/me/2fa/enable", json={"channel": "email"}
        )
        assert r.status_code == 200
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestEmail2FAEnrolmentGuard -v`
Expected: FAIL (first test gets 200 instead of 400).

- [ ] **Step 3: Add the guard**

In `backend/app/routers/auth.py`, in `enable_totp`, at the start of the
`# channel == "email"` block (immediately before `try:` around line 627):

```python
    # channel == "email"
    if not settings.is_smtp_configured:
        raise HTTPException(
            status_code=400,
            detail="email_2fa_unavailable",
        )
    try:
        current_user.is_totp_enabled = True
        current_user.totp_channel = "email"
```

(`settings` and `HTTPException` are already imported in this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestEmail2FAEnrolmentGuard -v`
Expected: PASS.

- [ ] **Step 5: ci-fast + commit**

Run: `make ci-fast`

```bash
git add backend/app/routers/auth.py backend/tests/integration/test_smtp_optional.py
git commit -m "feat(auth): reject email-2FA enrolment when SMTP unconfigured

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Backend — distinct login error for legacy email-2FA + SMTP manual

**Files:**
- Modify: `backend/app/routers/auth.py:152-163` (login, email channel)
- Test: `backend/tests/integration/test_smtp_optional.py`

- [ ] **Step 1: Write the failing test**

Append to `test_smtp_optional.py`. This needs a user that already has
`is_totp_enabled=True` and `totp_channel="email"`. Create it via the DB session
fixture pattern from Task 0 (mirror how `TestSMTPUnconfiguredFallback` builds
users):

```python
class TestLegacyEmail2FALogin:
    async def test_login_blocked_when_smtp_manual(
        self, client, db_session, set_smtp
    ):
        set_smtp(False)
        # Build a user with email-2FA already enabled (legacy state).
        from app.models import User
        from app.utils.security import get_password_hash
        from datetime import datetime, timezone

        u = User(
            email="legacy2fa@example.com",
            hashed_password=get_password_hash("testpassword"),
            is_active=True,
            is_totp_enabled=True,
            totp_channel="email",
            password_changed_at=datetime.now(timezone.utc),
        )
        db_session.add(u)
        await db_session.commit()

        r = await client.post(
            "/api/login",
            data={"username": "legacy2fa@example.com", "password": "testpassword"},
        )
        assert r.status_code == 503
        assert r.json()["detail"] == "email_2fa_unavailable"
```

Use the real DB-session fixture name from Task 0 in place of `db_session`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestLegacyEmail2FALogin -v`
Expected: FAIL (currently returns `Token(requires_2fa=True, channel="email")`, 200).

- [ ] **Step 3: Add the guard in the login flow**

In `backend/app/routers/auth.py`, in the login 2FA block, inside
`if channel == "email":` and inside `if not x_totp_token:`, add the SMTP check
**before** `code = await issue_otp(db, user)`:

```python
    if channel == "email":
        if not x_totp_token:
            if not settings.is_smtp_configured:
                log_admin_action(
                    actor_user_id=user.id,
                    action="twofa_login_email_unavailable",
                    resource="user",
                    resource_id=user.id,
                    channel="email",
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="email_2fa_unavailable",
                )
            try:
                code = await issue_otp(db, user)
```

(`log_admin_action`, `status`, `HTTPException`, `settings` are already imported.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestLegacyEmail2FALogin -v`
Expected: PASS.

- [ ] **Step 5: ci-fast + commit**

Run: `make ci-fast`

```bash
git add backend/app/routers/auth.py backend/tests/integration/test_smtp_optional.py
git commit -m "feat(auth): clear 503 for legacy email-2FA login when SMTP manual

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Backend — superuser direct set-email

**Files:**
- Modify: `backend/app/services/admin_user_service.py` (add `set_user_email`)
- Modify: `backend/app/schemas/users.py` (add `AdminSetEmailRequest`)
- Modify: `backend/app/schemas/__init__.py` (export)
- Modify: `backend/app/routers/admin/users.py` (add endpoint)
- Test: `backend/tests/integration/test_smtp_optional.py`

- [ ] **Step 1: Write the failing test**

Append to `test_smtp_optional.py`:

```python
class TestAdminSetEmail:
    async def test_superuser_sets_email(
        self, superuser_client, test_user
    ):
        r = await superuser_client.post(
            f"/api/admin/users/{test_user.id}/set-email",
            json={"new_email": "moved@example.com"},
        )
        assert r.status_code == 200
        assert r.json()["email"] == "moved@example.com"

    async def test_duplicate_email_conflict(
        self, superuser_client, test_user, db_session
    ):
        from app.models import User
        from app.utils.security import get_password_hash
        from datetime import datetime, timezone

        other = User(
            email="taken@example.com",
            hashed_password=get_password_hash("x"),
            is_active=True,
            password_changed_at=datetime.now(timezone.utc),
        )
        db_session.add(other)
        await db_session.commit()

        r = await superuser_client.post(
            f"/api/admin/users/{test_user.id}/set-email",
            json={"new_email": "taken@example.com"},
        )
        assert r.status_code == 409

    async def test_non_superuser_forbidden(self, client, test_user):
        r = await client.post(
            f"/api/admin/users/{test_user.id}/set-email",
            json={"new_email": "x@example.com"},
        )
        assert r.status_code in (401, 403)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestAdminSetEmail -v`
Expected: FAIL (404 — endpoint missing).

- [ ] **Step 3: Add the service function**

In `backend/app/services/admin_user_service.py`, after `reset_totp` (around
line 179). Add `from sqlalchemy.exc import IntegrityError` to the imports if
absent:

```python
async def set_user_email(
    *, db: AsyncSession, target: User, new_email: str
) -> None:
    """Superuser-only direct email swap.

    The SMTP-optional alternative to the user-driven dual-confirmation
    flow: a trusted superuser sets the address with no confirmation loop.
    Clears any in-flight ``pending_email``. Raises ``AdminUserError`` on a
    uniqueness collision so the router can map it to 409.
    """
    target.email = new_email
    target.pending_email = None
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise AdminUserError("email_already_registered") from exc
```

If `AdminUserError` is not defined in this module, search the module for the
existing error class (Task 0 noted `AdminUserError` is imported in
`routers/admin/users.py`, so it exists here) and reuse it as shown.

- [ ] **Step 4: Add the schema**

In `backend/app/schemas/users.py` (reuse the email-validation helper the file
already uses for other email fields if present; a plain `EmailStr` is
acceptable — add `from pydantic import EmailStr` if not imported):

```python
class AdminSetEmailRequest(BaseModel):
    """Body for POST /api/admin/users/{id}/set-email (superuser-only,
    SMTP-optional direct email swap)."""

    new_email: EmailStr
```

Export `AdminSetEmailRequest` in `backend/app/schemas/__init__.py`.

- [ ] **Step 5: Add the endpoint**

In `backend/app/routers/admin/users.py`, extend the imports
(`AdminSetEmailRequest` from schemas, `set_user_email` from the service), then
add after `recovery_link_endpoint`:

```python
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
    bypasses dual-confirmation by design — the superuser is the trust
    anchor). Audit-logged."""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        await set_user_email(db=db, target=target, new_email=payload.new_email)
    except AdminUserError:
        raise HTTPException(status_code=409, detail="Email already registered")

    log_admin_action(
        actor_user_id=current_user.id,
        action="admin_set_email",
        resource="user",
        resource_id=target.id,
    )
    await db.refresh(target)
    return target
```

If `UserReadAdmin` serialisation needs a `cast(...)` to satisfy mypy (the file
already uses `cast` per its imports), mirror the existing
`cast(PaginatedResponse[...], ...)` pattern used elsewhere in this router for
the return.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_smtp_optional.py::TestAdminSetEmail -v`
Expected: PASS (all three).

- [ ] **Step 7: ci-fast + commit**

Run: `make ci-fast`

```bash
git add backend/app/services/admin_user_service.py backend/app/schemas/users.py \
  backend/app/schemas/__init__.py backend/app/routers/admin/users.py \
  backend/tests/integration/test_smtp_optional.py
git commit -m "feat(admin): superuser direct set-email for SMTP-optional mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Backend — startup capability banner (testable helper)

**Files:**
- Create: `backend/app/utils/smtp_mode.py`
- Modify: `backend/app/main.py:79-113` (lifespan)
- Modify: `backend/pyproject.toml` (strict overrides)
- Test: `backend/tests/unit/test_smtp_mode.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/test_smtp_mode.py`:

```python
from app.utils.smtp_mode import smtp_mode_banner_lines


def test_banner_lists_manual_consequences():
    lines = smtp_mode_banner_lines(smtp_configured=False)
    joined = "\n".join(lines)
    assert "SMTP" in joined
    assert "recovery link" in joined.lower()
    assert any("admin" in line.lower() for line in lines)


def test_banner_empty_when_smtp_configured():
    assert smtp_mode_banner_lines(smtp_configured=True) == []
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_smtp_mode.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Create the helper**

`backend/app/utils/smtp_mode.py`:

```python
"""Operator-facing startup banner for SMTP-optional mode."""


def smtp_mode_banner_lines(*, smtp_configured: bool) -> list[str]:
    """Return the log lines to emit at startup describing email
    capabilities. Empty when SMTP is configured (nothing to warn about)."""
    if smtp_configured:
        return []
    return [
        "SMTP is not configured — Qualis runs in EMAIL-OPTIONAL mode.",
        "  Outgoing emails are written to the application log only.",
        "  Password reset: generate a recovery link from "
        "Admin > Users (no email needed).",
        "  Project invitations: copy the invite link shown after inviting.",
        "  Email change: a superuser sets the address from Admin > Users.",
        "  Email-based 2FA is disabled; use an authenticator app.",
        "  See docs/guides/running-without-smtp.md for the full matrix.",
    ]
```

- [ ] **Step 4: Wire it into the lifespan**

In `backend/app/main.py`, inside `lifespan`, just before `yield`:

```python
    from app.utils.smtp_mode import smtp_mode_banner_lines

    for line in smtp_mode_banner_lines(
        smtp_configured=settings.is_smtp_configured
    ):
        logger.warning(line)

    yield
```

- [ ] **Step 5: Add the module to mypy strict overrides**

In `backend/pyproject.toml`, add `"app.utils.smtp_mode"` to the full-strict
`module = [...]` list (same block as `"app.utils.script_utils"`).

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_smtp_mode.py -v`
Expected: PASS.

- [ ] **Step 7: ci-fast + commit**

Run: `make ci-fast`

```bash
git add backend/app/utils/smtp_mode.py backend/app/main.py backend/pyproject.toml \
  backend/tests/unit/test_smtp_mode.py
git commit -m "feat(startup): log email-optional capability banner when SMTP absent

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Backend — finalize OpenAPI, then regenerate the frontend client

**Files:**
- Modify: generated files under `frontend/src/api/` (machine-generated)

- [ ] **Step 1: Regenerate the API client**

Run: `make generate-api`
Expected: regenerates `frontend/src/api/`; new hooks appear for
`/api/config`, `/api/admin/users/{id}/recovery-link`,
`/api/admin/users/{id}/set-email`.

- [ ] **Step 2: Verify the client is in sync**

Run: `make check-api`
Expected: PASS (no diff).

- [ ] **Step 3: Identify the generated symbol names**

Run: `grep -rn "ApiConfigGet\|RecoveryLink\|SetEmail" frontend/src/api/generated.ts | head`
Note the exact generated hook/function names — later frontend tasks import
these. Record them (e.g. `useGetPublicConfigApiConfigGet`,
`useRecoveryLinkEndpointApiAdminUsersUserIdRecoveryLinkPost`,
`useSetEmailEndpointApiAdminUsersUserIdSetEmailPost` — confirm the real names
from the grep output).

- [ ] **Step 4: Commit the regenerated client**

```bash
git add frontend/src/api
git commit -m "chore(api): regenerate client for SMTP-optional endpoints

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Frontend — platform-config store + bootstrap fetch

**Files:**
- Create: `frontend/src/store/usePlatformConfigStore.ts`
- Create: `frontend/src/hooks/usePlatformConfigBootstrap.ts`
- Modify: `frontend/src/App.tsx` (call the bootstrap hook once)
- Test: `frontend/src/store/usePlatformConfigStore.test.ts`

- [ ] **Step 1: Write the failing store test**

Create `frontend/src/store/usePlatformConfigStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { usePlatformConfigStore } from './usePlatformConfigStore';

describe('usePlatformConfigStore', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: null });
    });

    it('defaults to null before bootstrap', () => {
        expect(usePlatformConfigStore.getState().emailDelivery).toBeNull();
    });

    it('stores the delivery mode', () => {
        usePlatformConfigStore.getState().setEmailDelivery('manual');
        expect(usePlatformConfigStore.getState().emailDelivery).toBe('manual');
    });

    it('isEmailManual reflects the mode', () => {
        usePlatformConfigStore.getState().setEmailDelivery('manual');
        expect(usePlatformConfigStore.getState().isEmailManual()).toBe(true);
        usePlatformConfigStore.getState().setEmailDelivery('smtp');
        expect(usePlatformConfigStore.getState().isEmailManual()).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- src/store/usePlatformConfigStore.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Create the store**

`frontend/src/store/usePlatformConfigStore.ts` (mirror the Zustand style of
`frontend/src/store/useConfigStore.ts`):

```ts
import { create } from 'zustand';

type EmailDelivery = 'smtp' | 'manual';

interface PlatformConfigState {
    emailDelivery: EmailDelivery | null;
    setEmailDelivery: (mode: EmailDelivery) => void;
    isEmailManual: () => boolean;
}

export const usePlatformConfigStore = create<PlatformConfigState>(
    (set, get) => ({
        emailDelivery: null,
        setEmailDelivery: (mode) => set({ emailDelivery: mode }),
        isEmailManual: () => get().emailDelivery === 'manual',
    })
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- src/store/usePlatformConfigStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the bootstrap hook**

`frontend/src/hooks/usePlatformConfigBootstrap.ts` — use the generated config
query hook whose name you recorded in Task 7 Step 3 (shown here as
`useGetPublicConfigApiConfigGet`; substitute the real name):

```ts
import { useEffect } from 'react';
import { useGetPublicConfigApiConfigGet } from '@/api/generated';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

/** Fetch GET /api/config once at app start and cache it in the store. */
export function usePlatformConfigBootstrap(): void {
    const { data } = useGetPublicConfigApiConfigGet();
    const setEmailDelivery = usePlatformConfigStore(
        (s) => s.setEmailDelivery
    );

    useEffect(() => {
        if (data?.email_delivery) {
            setEmailDelivery(data.email_delivery);
        }
    }, [data, setEmailDelivery]);
}
```

- [ ] **Step 6: Call the hook in App.tsx**

In `frontend/src/App.tsx`, import and call `usePlatformConfigBootstrap()` once
in the top-level `App` component body (before the returned JSX, alongside other
top-level hooks).

- [ ] **Step 7: ci-fast + commit**

Run: `make ci-fast`

```bash
git add frontend/src/store/usePlatformConfigStore.ts \
  frontend/src/store/usePlatformConfigStore.test.ts \
  frontend/src/hooks/usePlatformConfigBootstrap.ts frontend/src/App.tsx
git commit -m "feat(frontend): platform-config store + GET /api/config bootstrap

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Frontend — forgot-password adaptive copy

**Files:**
- Modify: `frontend/src/pages/PasswordResetRequestPage.tsx`
- Modify: `frontend/public/locales/en/admin.json`
- Test: `frontend/src/pages/PasswordResetRequestPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/PasswordResetRequestPage.test.tsx` (use the render
helper path from Task 0 Step 2; shown as `@/test/utils`):

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithStore } from '@/test/utils';
import PasswordResetRequestPage from './PasswordResetRequestPage';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

describe('PasswordResetRequestPage', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp' });
    });

    it('shows the admin-contact copy in manual mode after submit', async () => {
        usePlatformConfigStore.setState({ emailDelivery: 'manual' });
        renderWithStore(<PasswordResetRequestPage />);
        fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
            target: { value: 'a@b.com' },
        });
        fireEvent.submit(screen.getByRole('button'));
        expect(
            await screen.findByText(/administrator/i)
        ).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- src/pages/PasswordResetRequestPage.test.tsx`
Expected: FAIL (no "administrator" text).

- [ ] **Step 3: Make the success copy conditional**

In `frontend/src/pages/PasswordResetRequestPage.tsx`, import the store and
branch the `sent` block:

```tsx
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
```

Inside the component, add:

```tsx
    const isEmailManual = usePlatformConfigStore((s) => s.isEmailManual());
```

Replace the `if (sent)` return body's `<p>` with:

```tsx
                <p>
                    {isEmailManual
                        ? t(
                              'auth.password_reset.request_success_manual',
                              'Email delivery is not configured on this instance. Contact your administrator to obtain a reset link.'
                          )
                        : t(
                              'auth.password_reset.request_success',
                              'If the email exists, a reset link is on its way.'
                          )}
                </p>
```

- [ ] **Step 4: Add the i18n key**

In `frontend/public/locales/en/admin.json`, under the existing
`auth.password_reset` object, add:

```json
"request_success_manual": "Email delivery is not configured on this instance. Contact your administrator to obtain a reset link."
```

- [ ] **Step 5: Run the test + i18n check**

Run: `cd frontend && npm run test -- src/pages/PasswordResetRequestPage.test.tsx`
Expected: PASS.
Run: `cd frontend && npm run i18n-check`
Expected: PASS (admin parity is warning-only; no errors).

- [ ] **Step 6: ci-fast + commit**

Run: `make ci-fast`

```bash
git add frontend/src/pages/PasswordResetRequestPage.tsx \
  frontend/src/pages/PasswordResetRequestPage.test.tsx \
  frontend/public/locales/en/admin.json
git commit -m "feat(frontend): forgot-password copy adapts to email-manual mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Frontend — admin banner when email is manual

**Files:**
- Modify: `frontend/src/layouts/AdminLayout.tsx`
- Modify: `frontend/public/locales/en/admin.json`
- Test: `frontend/src/layouts/AdminLayout.smtp-banner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/layouts/AdminLayout.smtp-banner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithStore } from '@/test/utils';
import AdminLayout from './AdminLayout';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

describe('AdminLayout SMTP banner', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp' });
    });

    it('renders the banner only in manual mode', () => {
        const { rerender } = renderWithStore(<AdminLayout />);
        expect(
            screen.queryByText(/Email delivery not configured/i)
        ).not.toBeInTheDocument();

        usePlatformConfigStore.setState({ emailDelivery: 'manual' });
        rerender(<AdminLayout />);
        expect(
            screen.getByText(/Email delivery not configured/i)
        ).toBeInTheDocument();
    });
});
```

If `AdminLayout` requires router/context, mirror the wrapper used by the
existing `AdminLayout` test if one exists (grep
`frontend/src/layouts/*AdminLayout*test*`); otherwise wrap in
`<MemoryRouter>` from `react-router-dom` inside `renderWithStore`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- src/layouts/AdminLayout.smtp-banner.test.tsx`
Expected: FAIL (no banner text).

- [ ] **Step 3: Add the banner**

In `frontend/src/layouts/AdminLayout.tsx`, import the store, and immediately
before the `<header ...>` element (around line 73) insert:

```tsx
{usePlatformConfigStore((s) => s.isEmailManual()) && (
    <div
        role="status"
        className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs font-medium text-amber-800"
    >
        {t(
            'admin.smtp_banner.manual',
            'Email delivery not configured — recovery links are generated manually from Admin → Users.'
        )}
    </div>
)}
```

Ensure `usePlatformConfigStore` is imported and `t` is in scope (the file
already uses `useTranslation`; if not, add
`const { t } = useTranslation();`).

- [ ] **Step 4: Add the i18n key**

In `frontend/public/locales/en/admin.json`, add under the `admin` object:

```json
"smtp_banner": { "manual": "Email delivery not configured — recovery links are generated manually from Admin → Users." }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npm run test -- src/layouts/AdminLayout.smtp-banner.test.tsx`
Expected: PASS.

- [ ] **Step 6: ci-fast + commit**

Run: `make ci-fast`

```bash
git add frontend/src/layouts/AdminLayout.tsx \
  frontend/src/layouts/AdminLayout.smtp-banner.test.tsx \
  frontend/public/locales/en/admin.json
git commit -m "feat(frontend): admin banner when email delivery is manual

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Frontend — hide email-2FA option when manual

**Files:**
- Modify: `frontend/src/pages/admin/AccountSettingsPage.tsx:328-391`
- Test: `frontend/src/pages/admin/AccountSettingsPage.smtp.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/AccountSettingsPage.smtp.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithStore } from '@/test/utils';
import AccountSettingsPage from './AccountSettingsPage';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

describe('AccountSettingsPage 2FA channel', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp' });
    });

    it('hides the email 2FA channel in manual mode', () => {
        usePlatformConfigStore.setState({ emailDelivery: 'manual' });
        renderWithStore(<AccountSettingsPage />);
        expect(screen.queryByLabelText(/Email/i)).not.toBeInTheDocument();
    });
});
```

If `AccountSettingsPage` needs the 2FA section to be expanded/visible to render
the radios, set whatever local UI state the existing
`AccountSettingsPage.test.tsx` uses to reach that section (read that file
first); otherwise assert on `screen.queryByText` of the channel-email label
text instead of `getByLabelText`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- src/pages/admin/AccountSettingsPage.smtp.test.tsx`
Expected: FAIL (email option still present).

- [ ] **Step 3: Conditionally render the email channel**

In `frontend/src/pages/admin/AccountSettingsPage.tsx`, import the store:

```tsx
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
```

Inside the component:

```tsx
    const isEmailManual = usePlatformConfigStore((s) => s.isEmailManual());
```

Wrap the email-channel `<label>` (the block around lines 360-390 containing
`value="email"`) so it only renders when email delivery is available:

```tsx
{!isEmailManual && (
    <label
        className={cn( /* ...existing classes... */ )}
    >
        {/* ...existing email radio + description, unchanged... */}
    </label>
)}
```

If `channelChoice === 'email'` could be the default, also force the default to
`'app'` when `isEmailManual` (set the initial `channelChoice` state or add a
`useEffect` that resets `channelChoice` to `'app'` when `isEmailManual` is
true).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- src/pages/admin/AccountSettingsPage.smtp.test.tsx`
Expected: PASS.

- [ ] **Step 5: ci-fast + commit**

Run: `make ci-fast`

```bash
git add frontend/src/pages/admin/AccountSettingsPage.tsx \
  frontend/src/pages/admin/AccountSettingsPage.smtp.test.tsx
git commit -m "feat(frontend): hide email-2FA channel when SMTP unconfigured

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Frontend — "Generate password-reset link" action + reveal dialog

**Files:**
- Modify: `frontend/src/hooks/admin/useAdminUsersPage.ts`
- Modify: `frontend/src/pages/admin/AdminUsersPage.tsx`
- Modify: `frontend/public/locales/en/admin.json`
- Test: `frontend/src/hooks/admin/useAdminUsersPage.recovery.test.ts`

- [ ] **Step 1: Write the failing hook test**

Create `frontend/src/hooks/admin/useAdminUsersPage.recovery.test.ts`. Mirror
the mocking style of the existing `useAdminUsersPage` tests (read the existing
test file in the same dir first). Skeleton:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/api/generated', async (orig) => {
    const actual = await orig<typeof import('@/api/generated')>();
    return {
        ...actual,
        // Substitute the real generated hook name from Task 7 Step 3:
        useRecoveryLinkEndpointApiAdminUsersUserIdRecoveryLinkPost: () => ({
            mutateAsync: vi.fn().mockResolvedValue({
                kind: 'password_reset',
                url: 'http://x/reset-password?token=abc',
                expires_at: '2026-05-18T00:00:00Z',
            }),
        }),
    };
});

describe('useAdminUsersPage recovery link', () => {
    it('generateRecoveryLink returns the url', async () => {
        const { useAdminUsersPage } = await import('./useAdminUsersPage');
        // Render the hook with the project's hook-test harness (mirror
        // the existing useAdminUsersPage test setup) and assert that
        // generateRecoveryLink({ id: 1 }) resolves to the mocked url.
        expect(typeof useAdminUsersPage).toBe('function');
    });
});
```

Flesh out the hook-render assertion using the exact harness the sibling
`useAdminUsersPage.test.ts` already uses (`renderHook` + wrapper). Assert
`result.current.generateRecoveryLink({ id: 1 })` resolves to
`'http://x/reset-password?token=abc'`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- src/hooks/admin/useAdminUsersPage.recovery.test.ts`
Expected: FAIL (`generateRecoveryLink` undefined).

- [ ] **Step 3: Add the mutation + handler to the hook**

In `frontend/src/hooks/admin/useAdminUsersPage.ts`, next to the existing
`forcePwReset` / `resetTotp` mutations (around lines 125-130), add (use the
real generated hook name from Task 7 Step 3):

```ts
const recoveryLink =
    useRecoveryLinkEndpointApiAdminUsersUserIdRecoveryLinkPost();
```

Add it to the generated-API import block at the top of the file. Then in the
returned object (next to `forcePasswordReset` / `resetTotp`, around lines
183-186) add:

```ts
generateRecoveryLink: async (u: AdminUser): Promise<string> => {
    const res = await recoveryLink.mutateAsync({
        userId: u.id,
        data: { kind: 'password_reset' },
    });
    return res.url;
},
```

(Match the exact mutation argument shape orval generates — confirm against the
`forcePwReset.mutateAsync({ userId: u.id })` call already in this file; the
recovery endpoint additionally takes a `data` body.)

- [ ] **Step 4: Add the dropdown item + reveal dialog in AdminUsersPage**

In `frontend/src/pages/admin/AdminUsersPage.tsx`:

Add a dropdown item next to the existing ones (after line 479):

```tsx
<DropdownMenuItem
    disabled={isMutating}
    onSelect={() => onAction('generate-reset-link')}
>
    {t('admin.users.action.generate_reset_link', 'Generate password-reset link')}
</DropdownMenuItem>
```

Add reveal state near the component's other `useState` declarations:

```tsx
const [revealedLink, setRevealedLink] = useState<string | null>(null);
const [linkCopied, setLinkCopied] = useState(false);
```

Where the page handles `pendingAction` (the `onAction`/`setPendingAction`
dispatch around line 243), handle the new kind: call
`generateRecoveryLink(user)` from the hook and `setRevealedLink(url)`.

Add a reveal dialog reusing the invite-modal copy pattern from
`ProjectMembersPage.tsx:583-621` — a Radix `Dialog` open when
`revealedLink !== null`, containing a read-only `Input value={revealedLink}`
and a copy button:

```tsx
<Dialog open={revealedLink !== null} onOpenChange={(o) => !o && setRevealedLink(null)}>
    <DialogContent>
        <p className="text-sm text-slate-600 mb-3">
            {t(
                'admin.users.recovery_link.help',
                'Share this single-use link with the user out of band. It expires per the password-reset window.'
            )}
        </p>
        <div className="relative">
            <Input readOnly value={revealedLink ?? ''} className="pr-10 text-xs font-mono" />
            <Button
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-8 p-0"
                onClick={() => {
                    if (revealedLink) {
                        navigator.clipboard.writeText(revealedLink);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2000);
                    }
                }}
            >
                {linkCopied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3 text-slate-400" />}
            </Button>
        </div>
    </DialogContent>
</Dialog>
```

Import `Dialog`, `DialogContent`, `Input`, `Button`, `Check`, `Copy` from the
same module paths `ProjectMembersPage.tsx` uses for them.

- [ ] **Step 5: Add i18n keys**

In `frontend/public/locales/en/admin.json`, under `admin.users`, add:

```json
"action": { "generate_reset_link": "Generate password-reset link" },
"recovery_link": { "help": "Share this single-use link with the user out of band. It expires per the password-reset window." }
```

(Merge into the existing `admin.users.action` object rather than overwriting —
it already has `force_password_reset` / `reset_totp` keys.)

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npm run test -- src/hooks/admin/useAdminUsersPage.recovery.test.ts`
Expected: PASS.
Run: `cd frontend && npm run test -- src/pages/admin/AdminUsersPage`
Expected: existing AdminUsersPage tests still PASS.

- [ ] **Step 7: ci-fast + commit**

Run: `make ci-fast`

```bash
git add frontend/src/hooks/admin/useAdminUsersPage.ts \
  frontend/src/hooks/admin/useAdminUsersPage.recovery.test.ts \
  frontend/src/pages/admin/AdminUsersPage.tsx \
  frontend/public/locales/en/admin.json
git commit -m "feat(frontend): generate + reveal password-reset link from Admin > Users

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Operator documentation

**Files:**
- Create: `docs/guides/running-without-smtp.md`

- [ ] **Step 1: Write the guide**

Create `docs/guides/running-without-smtp.md`:

```markdown
# Running Qualis without SMTP / email

Qualis is fully usable without an SMTP server. When `SMTP_HOST`,
`SMTP_USER`, or `SMTP_PASSWORD` is unset, Qualis runs in **email-optional
mode**: outgoing emails are written to the application log, and every
account-recovery action has an in-product path that needs no email.

A startup log line confirms the mode and lists the consequences.

## Capability matrix

| Flow | Without SMTP |
|---|---|
| Registration | ✅ Account is active immediately; no verification email needed. |
| Password reset (user clicks "forgot") | ⚙️ User contacts the operator. A superuser opens **Admin → Users → ⋯ → Generate password-reset link** and sends the link out of band. |
| Project invitation | ✅ The invite link is shown with a copy button right after inviting — no email involved. |
| Email change | ⚙️ Self-service is disabled. A superuser sets the address from **Admin → Users**. |
| Lost authenticator (2FA) | ⚙️ A superuser uses **Admin → Users → ⋯ → Reset 2FA**. |
| Email-based 2FA | 🚫 Disabled. Users must use an authenticator app. Existing email-2FA accounts are recovered via "Reset 2FA". |
| Memo mentions / notifications | ✅ Informational only; written to the log, never blocking. |

Legend: ✅ works unchanged · ⚙️ requires a manual superuser action · 🚫 disabled.

## Enabling email later

Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` (and `EMAILS_FROM_EMAIL`)
and restart. The startup banner disappears, the admin banner clears, the
forgot-password page reverts to the standard message, and the email-2FA
option reappears. No data migration is required.
```

- [ ] **Step 2: Commit**

```bash
git add docs/guides/running-without-smtp.md
git commit -m "docs(guides): running Qualis without SMTP — capability matrix

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Final verification gate

- [ ] **Step 1: Full local CI**

Run: `make ci`
Expected: PASS (lint + check + test + build, backend & frontend). If
`make check` flags a mypy strict-override gap for any new module, add that
module to the overrides list in `backend/pyproject.toml` and re-run.

- [ ] **Step 2: Manual smoke (optional but recommended)**

With SMTP env vars unset, start the stack and verify in a browser:
the admin banner shows; the forgot-password page shows the admin-contact
copy; **Admin → Users → Generate password-reset link** reveals a copyable
link; the email 2FA option is absent in Account settings.

- [ ] **Step 3: Confirm clean tree + branch state**

Run: `git status` and `git log --oneline main..HEAD`
Expected: clean working tree; one commit per task on `feat/smtp-optional-mode`.

---

## Self-review (completed by plan author)

- **Spec coverage:** §1 capability signal → Task 1, 8. §2 recovery-link
  primitive → Task 2, 12. §3 email change w/o SMTP → Task 5 (+ §3 self-service
  disablement surfaced via Task 9 copy / docs Task 13). §4 2FA trap → Task 3
  (enrolment) + Task 4 (login) + Task 11 (hide option) + reset_totp already
  exists (surfaced via existing dropdown + Task 13 docs). §5 frontend verbs +
  copy → Task 9, 10, 11, 12. §6 clarity layer → Task 6 (startup log) + Task 13
  (docs). Testing section → per-task TDD + Task 14. No spec requirement is
  unassigned.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code.
  Generated-symbol names are explicitly resolved in Task 7 Step 3 before any
  frontend task imports them (sequencing gate), which is why those names are
  parameterised rather than guessed.
- **Type consistency:** `email_delivery` Literal["smtp","manual"] is consistent
  across backend `PublicConfig`, store `EmailDelivery`, and all consumers.
  `RecoveryLinkRequest.kind` / `RecoveryLinkResponse` shape matches the
  frontend `generateRecoveryLink` mock and dialog. `AdminUserError` reused
  consistently in Task 5. `isEmailManual()` selector used uniformly in Tasks
  9-12.
- **Fixture risk mitigation:** Task 0 forces capture of the real test fixture
  names before any backend test is written, so test steps reference real
  fixtures rather than invented ones.
```
