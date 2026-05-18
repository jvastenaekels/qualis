"""Consolidated integration tests for authentication, user profiles, and 2FA."""

import os
import pytest
import pyotp
from datetime import timedelta
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, ProjectRole, ProjectMember
from app.utils.security import create_invitation_token
from tests.conftest import TEST_PASSWORD


@pytest.mark.asyncio
class TestAuth:
    """Tests for authentication and token generation."""

    async def test_login_success(self, client: AsyncClient, test_user: User):
        """Valid credentials return access token."""
        response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Wrong password returns 401."""
        response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": "wrongpassword"},
        )
        assert response.status_code == 401
        assert "Incorrect" in response.json()["message"]

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Non-existent user returns 401."""
        response = await client.post(
            "/api/token",
            data={"username": "nobody@example.com", "password": "anypassword"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
class TestRegistration:
    """Tests for user registration."""

    async def test_register_success(self, client: AsyncClient, db: AsyncSession):
        """New user registration creates account."""
        response = await client.post(
            "/api/register",
            json={"email": "newuser@example.com", "password": "securepass123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["user"]["email"] == "newuser@example.com"

        # Verify in DB
        result = await db.execute(
            select(User).where(User.email == "newuser@example.com")
        )
        user = result.scalar_one_or_none()
        assert user is not None

    async def test_register_duplicate_email(self, client: AsyncClient, test_user: User):
        """F-06-007: duplicate email no longer leaks via 400 + body. The
        response now mirrors the new-user shape (201 + generic body) and
        the duplicate is signalled out-of-band via a "you already have
        an account" email — tested in
        ``backend/tests/security/wave_5/test_register_enumeration.py``.
        """
        response = await client.post(
            "/api/register",
            json={"email": test_user.email, "password": "anypassword"},
        )
        assert response.status_code == 201
        data = response.json()
        # Response shape: same as the new-user path (placeholder user
        # echoing the submitted email; no admin flags).
        assert data["user"]["email"] == test_user.email
        assert "requires_email_verification" in data

    async def test_register_with_valid_invitation(
        self,
        client: AsyncClient,
        db: AsyncSession,
        user_factory,
        project_factory,
    ):
        """Registration with valid invitation token adds user to project."""
        # Setup: Create project
        owner = await user_factory()
        project = await project_factory(owner=owner)

        # Create invitation token for project
        token = create_invitation_token(
            email="invited@example.com",
            project_id=project.id,
            role="member",  # ProjectRole
        )

        # Register with token
        response = await client.post(
            "/api/register",
            json={
                "email": "invited@example.com",
                "password": "securepass123",
                "invitation_token": token,
            },
        )
        assert response.status_code == 201

        # Verify ProjectMember was added
        result = await db.execute(
            select(ProjectMember).where(ProjectMember.project_id == project.id)
        )
        members = result.scalars().all()
        assert len(members) == 2  # Owner + Invited
        invited = next(m for m in members if m.user_id != owner.id)
        assert invited.role == ProjectRole.member

    async def test_register_invitation_token_email_mismatch(
        self, client: AsyncClient, user_factory, project_factory
    ):
        """Invitation token email must match registration email."""
        owner = await user_factory()
        project = await project_factory(owner=owner)
        token = create_invitation_token(
            email="invited@example.com", project_id=project.id, role="member"
        )
        response = await client.post(
            "/api/register",
            json={
                "email": "hacker@example.com",
                "password": "password123",
                "invitation_token": token,
            },
        )
        assert response.status_code == 400
        assert "does not match" in response.json()["message"]

    async def test_register_invitation_token_expired(
        self, client: AsyncClient, user_factory, project_factory
    ):
        """Expired invitation token is rejected."""
        owner = await user_factory()
        project = await project_factory(owner=owner)
        token = create_invitation_token(
            email="late@example.com",
            project_id=project.id,
            role="member",
            expires_delta=timedelta(minutes=-1),
        )
        response = await client.post(
            "/api/register",
            json={
                "email": "late@example.com",
                "password": "password123",
                "invitation_token": token,
            },
        )
        assert response.status_code == 400
        assert "Invalid invitation token" in response.json()["message"]


@pytest.mark.asyncio
class Test2FA:
    """Tests for 2FA (TOTP) flow."""

    async def test_2fa_full_flow(
        self, client: AsyncClient, db: AsyncSession, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)

        # 1. Setup 2FA
        response = await client.get("/api/me/2fa/setup", headers=headers)
        assert response.status_code == 200
        setup_data = response.json()
        secret = setup_data["secret"]
        assert secret is not None

        # 2. Enable 2FA (channel='app' since this is the authenticator-app flow)
        totp = pyotp.TOTP(secret)
        valid_token = totp.now()
        response = await client.post(
            "/api/me/2fa/enable",
            json={"channel": "app", "token": valid_token},
            headers=headers,
        )
        assert response.status_code == 200

        # 3. Login with 2FA
        # First step: regular login returns requires_2fa
        response = await client.post(
            "/api/token", data={"username": test_user.email, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        assert response.json()["requires_2fa"] is True

        # Second step: login with 2FA header
        valid_token = totp.now()
        response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
            headers={"X-TOTP-Token": valid_token},
        )
        assert response.status_code == 200
        assert "access_token" in response.json()

        # 4. Disable 2FA
        response = await client.post(
            "/api/me/2fa/disable",
            json={
                "current_password": TEST_PASSWORD,
            },
            headers=headers,
        )
        assert response.status_code == 200
        await db.refresh(test_user)
        assert test_user.is_totp_enabled is False


@pytest.mark.asyncio
class TestProfile:
    """Tests for user profile management."""

    async def test_get_profile(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        response = await client.get("/api/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["email"] == test_user.email

    async def test_update_profile(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        response = await client.patch(
            "/api/me", json={"full_name": "New Name"}, headers=headers
        )
        assert response.status_code == 200
        assert response.json()["full_name"] == "New Name"

    async def test_change_password_success(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        payload = {
            "current_password": TEST_PASSWORD,
            "new_password": "newSecurePassword123!",
        }
        response = await client.post("/api/me/password", json=payload, headers=headers)
        assert response.status_code == 200

        # Verify login
        login_response = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": "newSecurePassword123!"},
        )
        assert login_response.status_code == 200

    async def test_change_password_wrong_current(
        self, client: AsyncClient, test_user: User, auth_token_factory
    ):
        headers = auth_token_factory(test_user)
        payload = {
            "current_password": "wrongpassword",
            "new_password": "newSecurePassword123!",
        }
        response = await client.post("/api/me/password", json=payload, headers=headers)
        assert response.status_code == 400


@pytest.mark.asyncio
class TestRegistrationEmailVerification:
    async def test_register_without_invitation_creates_inactive_account(
        self, client: AsyncClient, db: AsyncSession, caplog, monkeypatch
    ):
        # The verification gate is conditional on SMTP being configured.
        # Force SMTP-configured so this test exercises the gated path; stub
        # the actual sender to avoid hitting smtp.example.com.
        import logging
        from app.core.config import settings
        from app.routers import auth as auth_router

        monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(settings, "SMTP_USER", "user")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "pass")

        sender_log = logging.getLogger("app.utils.email")

        def _fake_send(email_to: str, verify_url: str) -> None:
            sender_log.info(f"MOCK email-verification to {email_to}: {verify_url}")

        monkeypatch.setattr(auth_router, "send_email_verification", _fake_send)

        with caplog.at_level("INFO", logger="app.utils.email"):
            response = await client.post(
                "/api/register",
                json={"email": "newverify@example.com", "password": "securepass123"},
            )
        assert response.status_code == 201
        body = response.json()
        assert body["requires_email_verification"] is True
        assert body["user"]["email"] == "newverify@example.com"

        result = await db.execute(
            select(User).where(User.email == "newverify@example.com")
        )
        user = result.scalar_one()
        assert user.is_active is False
        assert user.email_verified_at is None
        # The (stubbed) sender was invoked for the verification email
        assert any("email-verification" in r.message for r in caplog.records)

    async def test_register_with_invitation_still_requires_verification_when_smtp_active(
        self, client: AsyncClient, db: AsyncSession, test_project, monkeypatch, caplog
    ):
        """Invitation grants project membership but does NOT skip the email-verification gate.
        Spec: docs/superpowers/specs/2026-05-02-auth-email-flows-design.md (amendment)."""
        from app.core.config import settings
        from app.routers import auth as auth_router

        # Force SMTP-active for this test
        monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(settings, "SMTP_USER", "user")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "pass")
        # Stub the email send so we don't hit a real SMTP server
        sent: list[tuple[str, str]] = []
        monkeypatch.setattr(
            auth_router,
            "send_email_verification",
            lambda email_to, verify_url: sent.append((email_to, verify_url)),
        )

        token = create_invitation_token(
            email="invite-needs-verify@example.com",
            project_id=test_project.id,
            role=ProjectRole.member.value,
        )

        response = await client.post(
            "/api/register",
            json={
                "email": "invite-needs-verify@example.com",
                "password": "securepass123",
                "invitation_token": token,
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["requires_email_verification"] is True

        # The user is created inactive + unverified
        result = await db.execute(
            select(User).where(User.email == "invite-needs-verify@example.com")
        )
        user = result.scalar_one()
        assert user.is_active is False
        assert user.email_verified_at is None

        # The membership is STILL created — invitation acceptance is independent of verification
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.user_id == user.id,
                ProjectMember.project_id == test_project.id,
            )
        )
        member = member_result.scalar_one()
        assert member.role == ProjectRole.member

        # Verification email was emitted
        assert len(sent) == 1
        assert sent[0][0] == "invite-needs-verify@example.com"
        assert "verify-email" in sent[0][1]

    async def test_register_with_invitation_skips_verification_when_smtp_unconfigured(
        self, client: AsyncClient, db: AsyncSession, test_project, monkeypatch
    ):
        """SMTP-fallback rule: when SMTP isn't configured, invited users get
        active+verified accounts in one shot (no verification mail could be sent)."""
        from app.core.config import settings

        # Force SMTP-unconfigured
        monkeypatch.setattr(settings, "SMTP_HOST", None)
        monkeypatch.setattr(settings, "SMTP_USER", None)
        monkeypatch.setattr(settings, "SMTP_PASSWORD", None)

        token = create_invitation_token(
            email="invite-fallback@example.com",
            project_id=test_project.id,
            role=ProjectRole.member.value,
        )

        response = await client.post(
            "/api/register",
            json={
                "email": "invite-fallback@example.com",
                "password": "securepass123",
                "invitation_token": token,
            },
        )
        assert response.status_code == 201
        body = response.json()
        assert body["requires_email_verification"] is False

        result = await db.execute(
            select(User).where(User.email == "invite-fallback@example.com")
        )
        user = result.scalar_one()
        assert user.is_active is True
        assert user.email_verified_at is not None

        # Membership applied
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.user_id == user.id,
                ProjectMember.project_id == test_project.id,
            )
        )
        assert member_result.scalar_one().role == ProjectRole.member


@pytest.mark.skipif(
    os.getenv("TESTING", "").lower() == "true",
    reason="Rate limiting is disabled in testing mode",
)
@pytest.mark.asyncio
async def test_rate_limiting_login(client: AsyncClient):
    """Test rate limiting on the login endpoint."""
    limit_hit = False
    for _ in range(10):
        response = await client.post(
            "/api/token",
            data={"username": "wrong@example.com", "password": "wrongpassword"},
        )
        if response.status_code == 429:
            limit_hit = True
            break
    assert limit_hit


@pytest.mark.asyncio
class TestEmailVerify:
    async def _new_unverified(self, db: AsyncSession, email: str) -> User:
        from app.utils.security import get_password_hash
        u = User(
            email=email,
            hashed_password=get_password_hash("pass"),
            is_active=False,
            email_verified_at=None,
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u

    async def test_verify_with_valid_token_activates_user(
        self, client: AsyncClient, db: AsyncSession
    ):
        from datetime import timedelta
        from app.utils.security import create_email_token

        user = await self._new_unverified(db, "verifyme@example.com")
        token = create_email_token(user.email, "email_verify", timedelta(hours=24))

        r = await client.post("/api/email/verify", json={"token": token})
        assert r.status_code == 200

        await db.refresh(user)
        assert user.is_active is True
        assert user.email_verified_at is not None

    async def test_verify_already_verified_is_idempotent(
        self, client: AsyncClient, db: AsyncSession
    ):
        from datetime import timedelta, datetime, timezone
        from app.utils.security import create_email_token

        user = await self._new_unverified(db, "verified@example.com")
        user.email_verified_at = datetime.now(timezone.utc)
        user.is_active = True
        await db.commit()

        token = create_email_token(user.email, "email_verify", timedelta(hours=24))
        r = await client.post("/api/email/verify", json={"token": token})
        assert r.status_code == 200

    async def test_verify_with_expired_token_returns_400(self, client: AsyncClient):
        from datetime import timedelta
        from app.utils.security import create_email_token

        # F-03-012: expiry must exceed JWT_LEEWAY_SECONDS (default 30s).
        token = create_email_token(
            "anyone@example.com", "email_verify", timedelta(seconds=-60)
        )
        r = await client.post("/api/email/verify", json={"token": token})
        assert r.status_code == 400

    async def test_verify_unknown_user_silent_200(self, client: AsyncClient):
        # JWT valid but no matching user — must NOT 4xx (anti-enum)
        from datetime import timedelta
        from app.utils.security import create_email_token

        token = create_email_token(
            "ghost@example.com", "email_verify", timedelta(hours=24)
        )
        r = await client.post("/api/email/verify", json={"token": token})
        assert r.status_code == 200

    async def test_resend_unknown_email_returns_200_anti_enum(self, client: AsyncClient):
        r = await client.post(
            "/api/email/verify/resend", json={"email": "ghost@example.com"}
        )
        assert r.status_code == 200

    async def test_resend_for_unverified_user_logs_email(
        self, client: AsyncClient, db: AsyncSession, caplog
    ):
        await self._new_unverified(db, "resendme@example.com")
        with caplog.at_level("INFO", logger="app.utils.email"):
            r = await client.post(
                "/api/email/verify/resend",
                json={"email": "resendme@example.com"},
            )
        assert r.status_code == 200
        assert any("email-verification" in rec.message for rec in caplog.records)

    async def test_resend_for_verified_user_does_NOT_log(
        self, client: AsyncClient, db: AsyncSession, test_user: User, caplog
    ):
        # test_user has email_verified_at set (per T10 fixture update; if not yet, set it)
        from datetime import datetime, timezone
        if test_user.email_verified_at is None:
            test_user.email_verified_at = datetime.now(timezone.utc)
            await db.commit()

        with caplog.at_level("INFO", logger="app.utils.email"):
            r = await client.post(
                "/api/email/verify/resend", json={"email": test_user.email}
            )
        assert r.status_code == 200
        assert not any("email-verification" in rec.message for rec in caplog.records)


@pytest.mark.asyncio
class TestLoginVerificationGuard:
    async def test_unverified_user_login_returns_403(
        self, client: AsyncClient, db: AsyncSession, monkeypatch
    ):
        # Force SMTP-configured state so the verification gate is active.
        # Without this, the gate short-circuits when SMTP is unset (the
        # SMTP-fallback hotfix) and the test would see 200 instead of 403.
        from app.core.config import settings
        from app.utils.security import get_password_hash

        monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(settings, "SMTP_USER", "user")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "pass")

        u = User(
            email="unverified@example.com",
            hashed_password=get_password_hash("pass123"),
            is_active=True,  # is_active alone is not enough — verification gate is separate
            email_verified_at=None,
        )
        db.add(u)
        await db.commit()

        r = await client.post(
            "/api/token",
            data={"username": "unverified@example.com", "password": "pass123"},
        )
        assert r.status_code == 403
        assert "email_not_verified" in r.json()["message"]

    async def test_verified_user_login_succeeds(
        self, client: AsyncClient, test_user: User
    ):
        # test_user fixture must now set email_verified_at — otherwise all auth tests fail
        from tests.conftest import TEST_PASSWORD
        r = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
        )
        assert r.status_code == 200

    async def test_kill_switch_disables_check(
        self, client: AsyncClient, db: AsyncSession, monkeypatch
    ):
        from app.core.config import settings
        from app.utils.security import get_password_hash

        monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", False)
        u = User(
            email="ks@example.com",
            hashed_password=get_password_hash("pass123"),
            is_active=True,
            email_verified_at=None,
        )
        db.add(u)
        await db.commit()

        r = await client.post(
            "/api/token",
            data={"username": "ks@example.com", "password": "pass123"},
        )
        assert r.status_code == 200

    async def test_password_check_runs_before_verification_check(
        self, client: AsyncClient, db: AsyncSession, monkeypatch
    ):
        # An attacker submitting wrong password against an unverified account
        # must get 401 (Incorrect credentials), NOT 403 (email_not_verified) —
        # otherwise the response code itself becomes an oracle revealing
        # whether an unverified account exists for that email.
        # SMTP must be monkeypatched truthy so the gate is active and the
        # 401-vs-403 ordering is observable.
        from app.core.config import settings
        from app.utils.security import get_password_hash

        monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(settings, "SMTP_USER", "user")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "pass")

        u = User(
            email="enum-probe@example.com",
            hashed_password=get_password_hash("realpass"),
            is_active=True,
            email_verified_at=None,
        )
        db.add(u)
        await db.commit()

        r = await client.post(
            "/api/token",
            data={"username": "enum-probe@example.com", "password": "WRONGpass"},
        )
        assert r.status_code == 401  # not 403 — password check runs first


@pytest.mark.asyncio
class TestSMTPUnconfiguredFallback:
    """When SMTP is not configured, the app must still function:
    login is not blocked on missing verification, and registration
    creates immediately-active accounts.
    """

    async def test_register_without_smtp_creates_active_verified_account(
        self, client: AsyncClient, db: AsyncSession, monkeypatch
    ):
        # Force SMTP-unconfigured state regardless of test env
        from app.core.config import settings
        monkeypatch.setattr(settings, "SMTP_HOST", None)
        monkeypatch.setattr(settings, "SMTP_USER", None)
        monkeypatch.setattr(settings, "SMTP_PASSWORD", None)

        r = await client.post(
            "/api/register",
            json={"email": "smtpoff@example.com", "password": "securepass123"},
        )
        assert r.status_code == 201
        body = r.json()
        # No verification flag — the app behaves as if verification is off
        assert body["requires_email_verification"] is False

        result = await db.execute(select(User).where(User.email == "smtpoff@example.com"))
        user = result.scalar_one()
        assert user.is_active is True
        assert user.email_verified_at is not None

    async def test_login_without_smtp_does_not_block_unverified(
        self, client: AsyncClient, db: AsyncSession, monkeypatch
    ):
        from app.core.config import settings
        from app.utils.security import get_password_hash

        # Pre-existing unverified account (e.g., created when SMTP was on, now off)
        u = User(
            email="unverified-smtpoff@example.com",
            hashed_password=get_password_hash("pass123"),
            is_active=True,
            email_verified_at=None,
        )
        db.add(u)
        await db.commit()

        # Turn SMTP off
        monkeypatch.setattr(settings, "SMTP_HOST", None)
        monkeypatch.setattr(settings, "SMTP_USER", None)
        monkeypatch.setattr(settings, "SMTP_PASSWORD", None)

        r = await client.post(
            "/api/token",
            data={"username": "unverified-smtpoff@example.com", "password": "pass123"},
        )
        # Without SMTP, the gate must not fire
        assert r.status_code == 200

    async def test_login_with_smtp_configured_still_blocks_unverified(
        self, client: AsyncClient, db: AsyncSession, monkeypatch
    ):
        # Conversely: when SMTP IS configured AND EMAIL_VERIFICATION_REQUIRED=True,
        # the gate fires (the behavior we shipped in T10).
        from app.core.config import settings
        from app.utils.security import get_password_hash

        monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(settings, "SMTP_USER", "user")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "pass")
        monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", True)

        u = User(
            email="unverified-smtpon@example.com",
            hashed_password=get_password_hash("pass123"),
            is_active=True,
            email_verified_at=None,
        )
        db.add(u)
        await db.commit()

        r = await client.post(
            "/api/token",
            data={"username": "unverified-smtpon@example.com", "password": "pass123"},
        )
        assert r.status_code == 403
        assert "email_not_verified" in r.json()["message"]


@pytest.mark.asyncio
class TestPasswordReset:
    async def test_request_unknown_email_returns_200(self, client: AsyncClient):
        r = await client.post(
            "/api/password/reset/request", json={"email": "ghost@example.com"}
        )
        assert r.status_code == 200

    async def test_request_known_email_logs_email(
        self, client: AsyncClient, test_user: User, caplog
    ):
        with caplog.at_level("INFO", logger="app.utils.email"):
            r = await client.post(
                "/api/password/reset/request", json={"email": test_user.email}
            )
        assert r.status_code == 200
        assert any("password-reset" in rec.message for rec in caplog.records)

    async def test_constant_time_unknown_vs_known_within_500ms(
        self, client: AsyncClient, test_user: User
    ):
        # Loose bound (CI variance) — the test is qualitative: both paths
        # do roughly the same amount of work (one bcrypt either way).
        import time
        t0 = time.perf_counter()
        await client.post(
            "/api/password/reset/request", json={"email": "ghost@example.com"}
        )
        t1 = time.perf_counter()
        await client.post(
            "/api/password/reset/request", json={"email": test_user.email}
        )
        t2 = time.perf_counter()
        # Within 500ms of each other on CI hardware
        assert abs((t2 - t1) - (t1 - t0)) < 0.5

    async def test_confirm_rotates_password(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        from datetime import timedelta
        from app.utils.security import create_email_token, verify_password
        from tests.conftest import TEST_PASSWORD

        await db.refresh(test_user)
        original_pca = test_user.password_changed_at
        token = create_email_token(
            test_user.email, "password_reset",
            expires_delta=timedelta(hours=1),
            password_changed_at=original_pca,
        )
        r = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "newSecret123"},
        )
        assert r.status_code == 200

        await db.refresh(test_user)
        assert verify_password("newSecret123", test_user.hashed_password)
        assert not verify_password(TEST_PASSWORD, test_user.hashed_password)
        assert test_user.password_changed_at > original_pca

    async def test_confirm_replay_after_rotation_fails(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        from datetime import timedelta
        from app.utils.security import create_email_token

        await db.refresh(test_user)
        token = create_email_token(
            test_user.email, "password_reset",
            expires_delta=timedelta(hours=1),
            password_changed_at=test_user.password_changed_at,
        )
        r1 = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "first123abc"},
        )
        assert r1.status_code == 200

        r2 = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "second123abc"},
        )
        assert r2.status_code == 400
        # Specifically the pwa-mismatch path
        assert "consumed" in r2.json()["message"].lower() or \
               "invalid" in r2.json()["message"].lower()

    async def test_confirm_expired_token_returns_400(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        from datetime import timedelta
        from app.utils.security import create_email_token

        await db.refresh(test_user)
        # F-03-012: expiry must exceed JWT_LEEWAY_SECONDS (default 30s).
        token = create_email_token(
            test_user.email, "password_reset",
            expires_delta=timedelta(seconds=-60),
            password_changed_at=test_user.password_changed_at,
        )
        r = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "anything123"},
        )
        assert r.status_code == 400

    async def test_confirm_unknown_user_returns_400(self, client: AsyncClient):
        from datetime import datetime, timedelta, timezone
        from app.utils.security import create_email_token

        token = create_email_token(
            "ghost@example.com", "password_reset",
            expires_delta=timedelta(hours=1),
            password_changed_at=datetime.now(timezone.utc),
        )
        r = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "anything123"},
        )
        assert r.status_code == 400

    async def test_confirm_invalidates_active_otps(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        from datetime import timedelta
        from app.models import TwoFAEmailOTPCode
        from app.services.email_otp_service import issue_otp
        from app.utils.security import create_email_token
        from sqlalchemy import select

        # Issue an OTP (simulating an in-flight 2FA login attempt)
        await issue_otp(db, test_user)
        await db.commit()
        await db.refresh(test_user)

        token = create_email_token(
            test_user.email, "password_reset",
            expires_delta=timedelta(hours=1),
            password_changed_at=test_user.password_changed_at,
        )
        r = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "newone123"},
        )
        assert r.status_code == 200

        # All previously-active OTPs are now used_at-stamped
        result = await db.execute(
            select(TwoFAEmailOTPCode).where(
                TwoFAEmailOTPCode.user_id == test_user.id,
                TwoFAEmailOTPCode.used_at.is_(None),
            )
        )
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
class TestTwoFAEmailOTP:
    async def _enable_email_2fa(self, db: AsyncSession, user: User) -> None:
        """Helper: directly flip a user to email-channel 2FA in the DB."""
        user.is_totp_enabled = True
        user.totp_channel = "email"
        user.totp_secret = None
        await db.commit()
        await db.refresh(user)

    async def test_login_email_channel_no_header_issues_otp(
        self, client: AsyncClient, db: AsyncSession, test_user: User, caplog,
        monkeypatch,
    ):
        from tests.conftest import TEST_PASSWORD
        from app.core.config import settings

        # Email-channel OTP issuance at login is only reachable when SMTP
        # can actually deliver the code. With SMTP unconfigured the login
        # endpoint now returns a distinct 503 (SMTP-optional mode) instead
        # of silently issuing an OTP that only lands in the logs.
        monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(settings, "SMTP_USER", "user")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "pass")

        # Stub the SMTP sender (no real network in tests) but keep the
        # log line the assertion below greps for, matching the
        # established _fake_send pattern used elsewhere in this module.
        import logging

        from app.routers import auth as auth_router

        sender_log = logging.getLogger("app.utils.email")

        def _fake_send_otp(email_to: str, code: str) -> None:
            sender_log.info(f"MOCK 2fa-login-otp to {email_to}")

        monkeypatch.setattr(auth_router, "send_twofa_login_otp", _fake_send_otp)
        await self._enable_email_2fa(db, test_user)

        with caplog.at_level("INFO", logger="app.utils.email"):
            r = await client.post(
                "/api/token",
                data={"username": test_user.email, "password": TEST_PASSWORD},
            )
        assert r.status_code == 200
        body = r.json()
        assert body["requires_2fa"] is True
        assert body["channel"] == "email"
        # Email logged
        assert any("2fa-login-otp" in rec.message for rec in caplog.records)

    async def test_login_email_channel_with_correct_otp_issues_token(
        self, client: AsyncClient, db: AsyncSession, test_user: User, caplog
    ):
        from tests.conftest import TEST_PASSWORD
        from app.services.email_otp_service import issue_otp
        await self._enable_email_2fa(db, test_user)

        # Trigger an OTP via the service (simulates the "first call" path)
        code = await issue_otp(db, test_user)
        await db.commit()

        r = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
            headers={"x-totp-token": code},
        )
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"

    async def test_login_email_channel_wrong_otp_returns_401(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        from tests.conftest import TEST_PASSWORD
        from app.services.email_otp_service import issue_otp
        await self._enable_email_2fa(db, test_user)

        await issue_otp(db, test_user)
        await db.commit()

        r = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
            headers={"x-totp-token": "000000"},
        )
        assert r.status_code == 401

    async def test_login_app_channel_unchanged(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        # Existing TOTP-app flow must still work
        from tests.conftest import TEST_PASSWORD
        from app.utils.security import generate_totp_secret
        import pyotp

        secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        test_user.totp_secret = secret
        test_user.totp_channel = "app"
        await db.commit()

        # No header → 200 with requires_2fa, channel='app'
        r = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
        )
        assert r.status_code == 200
        assert r.json()["requires_2fa"] is True
        assert r.json()["channel"] == "app"

        # With header → 200 access_token
        valid_token = pyotp.TOTP(secret).now()
        r2 = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
            headers={"x-totp-token": valid_token},
        )
        assert r2.status_code == 200
        assert "access_token" in r2.json()

    async def test_enable_email_channel_does_not_require_totp_token(
        self, client: AsyncClient, db: AsyncSession, test_user: User,
        monkeypatch,
    ):
        """The /me/2fa/enable endpoint with channel='email' enables 2FA
        without needing a TOTP token (since the user is enrolling for email,
        not authenticator-app)."""
        from tests.conftest import TEST_PASSWORD
        from app.core.config import settings

        # Email-channel enrolment is only permitted when SMTP can deliver
        # the codes; with SMTP unconfigured the endpoint now rejects it
        # (SMTP-optional mode). This test pins the SMTP-configured path.
        monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(settings, "SMTP_USER", "user")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "pass")

        # Get an access token first
        login = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
        )
        access = login.json()["access_token"]

        # Enable with channel='email'
        r = await client.post(
            "/api/me/2fa/enable",
            headers={"Authorization": f"Bearer {access}"},
            json={"channel": "email"},
        )
        assert r.status_code == 200

        await db.refresh(test_user)
        assert test_user.is_totp_enabled is True
        assert test_user.totp_channel == "email"
        assert test_user.totp_secret is None

    async def test_enable_app_channel_still_requires_token(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        """The existing TOTP-app enable path still requires a valid TOTP token."""
        from tests.conftest import TEST_PASSWORD
        from app.utils.security import generate_totp_secret
        import pyotp

        login = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
        )
        access = login.json()["access_token"]

        # First, set up a secret (existing flow)
        secret = generate_totp_secret()
        test_user.totp_secret = secret
        await db.commit()

        # Then enable with channel='app' + valid token
        valid = pyotp.TOTP(secret).now()
        r = await client.post(
            "/api/me/2fa/enable",
            headers={"Authorization": f"Bearer {access}"},
            json={"channel": "app", "token": valid},
        )
        assert r.status_code == 200

        await db.refresh(test_user)
        assert test_user.is_totp_enabled is True
        assert test_user.totp_channel == "app"
        assert test_user.totp_secret == secret  # preserved

    async def test_enable_app_channel_without_token_rejected(
        self, client: AsyncClient, db: AsyncSession, test_user: User
    ):
        from tests.conftest import TEST_PASSWORD

        login = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": TEST_PASSWORD},
        )
        access = login.json()["access_token"]

        r = await client.post(
            "/api/me/2fa/enable",
            headers={"Authorization": f"Bearer {access}"},
            json={"channel": "app"},  # no token
        )
        assert r.status_code == 400


@pytest.mark.asyncio
class TestTwoFADisableRecovery:
    """Self-serve 2FA disable via single-use email link.

    Most security-critical flow in the auth-email-flows family: a successful
    confirm defeats the user's second factor. Single-use enforcement comes
    from the consumed_email_tokens table (PK on jti).
    """

    async def _user_with_2fa(
        self,
        db: AsyncSession,
        email: str = "twofa-recover@example.com",
        channel: str = "app",
    ) -> User:
        from datetime import datetime, timezone
        from app.utils.security import get_password_hash

        u = User(
            email=email,
            hashed_password=get_password_hash("pass"),
            is_active=True,
            email_verified_at=datetime.now(timezone.utc),
            is_totp_enabled=True,
            totp_channel=channel,
            totp_secret="JBSWY3DPEHPK3PXP" if channel == "app" else None,
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u

    async def test_request_for_2fa_user_logs_disable_link(
        self, client: AsyncClient, db: AsyncSession, caplog
    ):
        user = await self._user_with_2fa(db)
        with caplog.at_level("INFO", logger="app.utils.email"):
            r = await client.post(
                "/api/2fa/disable/request", json={"email": user.email}
            )
        assert r.status_code == 200
        assert any("2fa-disable-link" in rec.message for rec in caplog.records)

    async def test_request_unknown_email_returns_200_no_email(
        self, client: AsyncClient, caplog
    ):
        with caplog.at_level("INFO", logger="app.utils.email"):
            r = await client.post(
                "/api/2fa/disable/request", json={"email": "ghost@example.com"}
            )
        assert r.status_code == 200
        assert not any("2fa-disable-link" in rec.message for rec in caplog.records)

    async def test_request_user_without_2fa_returns_200_no_email(
        self, client: AsyncClient, db: AsyncSession, test_user: User, caplog
    ):
        # test_user fixture doesn't have 2FA enabled
        assert test_user.is_totp_enabled is False
        with caplog.at_level("INFO", logger="app.utils.email"):
            r = await client.post(
                "/api/2fa/disable/request", json={"email": test_user.email}
            )
        assert r.status_code == 200
        assert not any("2fa-disable-link" in rec.message for rec in caplog.records)

    async def test_confirm_disables_2fa_and_sends_notification(
        self, client: AsyncClient, db: AsyncSession, caplog
    ):
        from app.utils.security import create_email_token

        user = await self._user_with_2fa(db, email="confirm-disable@example.com")
        token = create_email_token(
            user.email,
            "twofa_disable",
            expires_delta=timedelta(minutes=15),
        )

        with caplog.at_level("INFO", logger="app.utils.email"):
            r = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert r.status_code == 200

        await db.refresh(user)
        assert user.is_totp_enabled is False
        assert user.totp_secret is None
        assert user.totp_channel is None
        # Post-action notification email logged
        assert any(
            "2fa-disabled-notification" in rec.message for rec in caplog.records
        )

    async def test_confirm_replay_returns_409(
        self, client: AsyncClient, db: AsyncSession
    ):
        from app.utils.security import create_email_token

        user = await self._user_with_2fa(db, email="replay-disable@example.com")
        token = create_email_token(
            user.email,
            "twofa_disable",
            expires_delta=timedelta(minutes=15),
        )

        r1 = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert r1.status_code == 200

        r2 = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert r2.status_code == 409

    async def test_confirm_expired_token_returns_400(
        self, client: AsyncClient, db: AsyncSession
    ):
        from app.utils.security import create_email_token

        await self._user_with_2fa(db, email="expired-disable@example.com")
        # F-03-012: expiry must exceed JWT_LEEWAY_SECONDS (default 30s).
        token = create_email_token(
            "expired-disable@example.com",
            "twofa_disable",
            expires_delta=timedelta(seconds=-60),  # past leeway window
        )

        r = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert r.status_code == 400

    async def test_confirm_unknown_user_consumes_jti_anyway(
        self, client: AsyncClient, db: AsyncSession
    ):
        """Anti-enum: even when the user does not exist, the JTI is consumed
        so an attacker can't probe for valid users by replaying a token.
        """
        from sqlalchemy import select

        from app.models import ConsumedEmailToken
        from app.utils.security import create_email_token, decode_email_token

        # Issue a token for a non-existent user
        token = create_email_token(
            "ghost-disable@example.com",
            "twofa_disable",
            expires_delta=timedelta(minutes=15),
        )
        # Decode it here to grab the jti for our assertion
        jti = decode_email_token(token, expected_purpose="twofa_disable")["jti"]

        await client.post("/api/2fa/disable/confirm", json={"token": token})
        # Whatever the response code, the jti must be consumed (so a replay
        # by an attacker who somehow got the token can't probe valid users).
        result = await db.execute(
            select(ConsumedEmailToken).where(ConsumedEmailToken.jti == jti)
        )
        assert result.scalar_one_or_none() is not None

    async def test_sequential_confirm_second_returns_409(
        self, client: AsyncClient, db: AsyncSession
    ):
        """Two sequential POSTs with the same token: the second must 409.

        Note: the plan also describes a parallel `asyncio.gather` variant.
        That variant would race against a single shared session in the test
        harness (the `client` fixture overrides get_db with one AsyncSession
        per test) and produce non-deterministic ordering rather than truly
        exercising DB-level concurrency. The atomic single-use guarantee
        is encoded in the consumed_email_tokens PK; the sequential test
        here verifies that contract end-to-end without harness flakiness.
        """
        from app.utils.security import create_email_token

        user = await self._user_with_2fa(db, email="concurrent-disable@example.com")
        token = create_email_token(
            user.email,
            "twofa_disable",
            expires_delta=timedelta(minutes=15),
        )

        r1 = await client.post("/api/2fa/disable/confirm", json={"token": token})
        r2 = await client.post("/api/2fa/disable/confirm", json={"token": token})
        assert sorted([r1.status_code, r2.status_code]) == [200, 409]
