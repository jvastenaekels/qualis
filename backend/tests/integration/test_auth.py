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
        """Duplicate email returns 400."""
        response = await client.post(
            "/api/register",
            json={"email": test_user.email, "password": "anypassword"},
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["message"]

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
            role="researcher",  # ProjectRole
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
        assert invited.role == ProjectRole.researcher

    async def test_register_invitation_token_email_mismatch(
        self, client: AsyncClient, user_factory, project_factory
    ):
        """Invitation token email must match registration email."""
        owner = await user_factory()
        project = await project_factory(owner=owner)
        token = create_invitation_token(
            email="invited@example.com", project_id=project.id, role="researcher"
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
            role="researcher",
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

        # 2. Enable 2FA
        totp = pyotp.TOTP(secret)
        valid_token = totp.now()
        response = await client.post(
            "/api/me/2fa/enable", json={"token": valid_token}, headers=headers
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
            role=ProjectRole.researcher.value,
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
        assert member.role == ProjectRole.researcher

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
            role=ProjectRole.researcher.value,
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
        assert member_result.scalar_one().role == ProjectRole.researcher


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

        token = create_email_token(
            "anyone@example.com", "email_verify", timedelta(seconds=-1)
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
