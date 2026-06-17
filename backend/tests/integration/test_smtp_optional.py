"""SMTP-optional mode: capability flag, recovery link, 2FA guards."""

import logging

import pytest

from app.core.config import settings


@pytest.mark.asyncio
class TestPublicConfig:
    async def test_config_reports_manual_when_smtp_absent(self, client, monkeypatch):
        monkeypatch.setattr(settings, "SMTP_HOST", None)
        monkeypatch.setattr(settings, "SMTP_USER", None)
        monkeypatch.setattr(settings, "SMTP_PASSWORD", None)
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["email_delivery"] == "manual"

    async def test_config_reports_smtp_when_configured(self, client, monkeypatch):
        monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(settings, "SMTP_USER", "user")
        monkeypatch.setattr(settings, "SMTP_PASSWORD", "pw")
        r = await client.get("/api/config")
        assert r.status_code == 200
        assert r.json()["email_delivery"] == "smtp"


@pytest.mark.asyncio
class TestRecoveryLink:
    async def test_non_superuser_forbidden(self, client, test_user):
        r = await client.post(
            f"/api/admin/users/{test_user.id}/recovery-link",
            json={"kind": "password_reset"},
        )
        assert r.status_code in (401, 403)

    async def test_unknown_user_404(self, client, superuser_token):
        headers = {"Authorization": f"Bearer {superuser_token}"}
        r = await client.post(
            "/api/admin/users/999999/recovery-link",
            json={"kind": "password_reset"},
            headers=headers,
        )
        assert r.status_code == 404

    async def test_returns_usable_reset_link(self, client, superuser_token, test_user):
        headers = {"Authorization": f"Bearer {superuser_token}"}
        r = await client.post(
            f"/api/admin/users/{test_user.id}/recovery-link",
            json={"kind": "password_reset"},
            headers=headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["kind"] == "password_reset"
        assert "/reset-password?token=" in body["url"]
        token = body["url"].split("token=")[1]
        confirm = await client.post(
            "/api/password/reset/confirm",
            json={"token": token, "new_password": "NewStr0ngPass!23"},
        )
        assert confirm.status_code == 200

    async def test_emits_audit_entry(self, client, superuser_token, test_user, caplog):
        """Minting a recovery link is security-sensitive and the service
        docstring claims it is audit-logged on every call. Pin that here.

        Uses ``caplog`` on logger ``app.audit`` — the same pattern as
        ``tests/integration/test_admin_user_guards.py``.
        """
        headers = {"Authorization": f"Bearer {superuser_token}"}
        with caplog.at_level(logging.INFO, logger="app.audit"):
            caplog.clear()
            r = await client.post(
                f"/api/admin/users/{test_user.id}/recovery-link",
                json={"kind": "password_reset"},
                headers=headers,
            )
            assert r.status_code == 200
        audit_records = [rec for rec in caplog.records if rec.name == "app.audit"]
        assert any(
            "recovery_link_revealed" in rec.getMessage()
            and f"id={test_user.id}" in rec.getMessage()
            for rec in audit_records
        ), f"Expected recovery_link_revealed audit entry; got: {audit_records}"

    async def test_does_not_rotate_password(self, client, superuser_token, test_user):
        headers = {"Authorization": f"Bearer {superuser_token}"}
        await client.post(
            f"/api/admin/users/{test_user.id}/recovery-link",
            json={"kind": "password_reset"},
            headers=headers,
        )
        login = await client.post(
            "/api/token",
            data={"username": test_user.email, "password": "testpassword"},
        )
        assert login.status_code == 200


@pytest.mark.asyncio
class TestApp2FALoginSmtpOptional:
    async def test_app_channel_2fa_unaffected_when_smtp_manual(
        self, client, db, monkeypatch
    ):
        # App (TOTP) 2FA users must STILL get the normal requires_2fa
        # response even when SMTP is manual (regression guard).
        monkeypatch.setattr(settings, "SMTP_HOST", None)
        monkeypatch.setattr(settings, "SMTP_USER", None)
        monkeypatch.setattr(settings, "SMTP_PASSWORD", None)

        from datetime import datetime, timezone

        from app.models import User
        from app.utils.security import get_password_hash

        u = User(
            email="app2fa@example.com",
            hashed_password=get_password_hash("testpassword"),
            is_active=True,
            is_totp_enabled=True,
            totp_channel="app",
            totp_secret="JBSWY3DPEHPK3PXP",
            email_verified_at=datetime.now(timezone.utc),
            password_changed_at=datetime.now(timezone.utc),
        )
        db.add(u)
        await db.commit()

        r = await client.post(
            "/api/token",
            data={"username": "app2fa@example.com", "password": "testpassword"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["requires_2fa"] is True


class TestAdminSetEmail:
    @pytest.mark.asyncio
    async def test_superuser_sets_email(self, client, superuser_token, test_user):
        headers = {"Authorization": f"Bearer {superuser_token}"}
        r = await client.post(
            f"/api/admin/users/{test_user.id}/set-email",
            json={"new_email": "moved@example.com"},
            headers=headers,
        )
        assert r.status_code == 200
        assert r.json()["email"] == "moved@example.com"

    @pytest.mark.asyncio
    async def test_duplicate_email_conflict(
        self, client, superuser_token, test_user, db
    ):
        from datetime import datetime, timezone

        from app.models import User
        from app.utils.security import get_password_hash

        other = User(
            email="taken@example.com",
            hashed_password=get_password_hash("x"),
            is_active=True,
            email_verified_at=datetime.now(timezone.utc),
            password_changed_at=datetime.now(timezone.utc),
        )
        db.add(other)
        await db.commit()

        headers = {"Authorization": f"Bearer {superuser_token}"}
        r = await client.post(
            f"/api/admin/users/{test_user.id}/set-email",
            json={"new_email": "taken@example.com"},
            headers=headers,
        )
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_non_superuser_forbidden(self, client, test_user):
        r = await client.post(
            f"/api/admin/users/{test_user.id}/set-email",
            json={"new_email": "x@example.com"},
        )
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_authenticated_non_superuser_forbidden(
        self, client, regular_user_token, test_user
    ):
        # Authenticated as an ordinary (non-superuser) user, targeting a
        # DIFFERENT user — genuine privilege check, must be 403 (not 401).
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        r = await client.post(
            f"/api/admin/users/{test_user.id}/set-email",
            json={"new_email": "x@example.com"},
            headers=headers,
        )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_set_email_clears_pending_email(
        self, client, superuser_token, test_user, db
    ):
        test_user.pending_email = "wanted@example.com"
        db.add(test_user)
        await db.commit()

        headers = {"Authorization": f"Bearer {superuser_token}"}
        r = await client.post(
            f"/api/admin/users/{test_user.id}/set-email",
            json={"new_email": "cleared@example.com"},
            headers=headers,
        )
        assert r.status_code == 200

        await db.refresh(test_user)
        assert test_user.pending_email is None
        assert test_user.email == "cleared@example.com"

    @pytest.mark.asyncio
    async def test_unknown_user_404(self, client, superuser_token):
        headers = {"Authorization": f"Bearer {superuser_token}"}
        r = await client.post(
            "/api/admin/users/999999/set-email",
            json={"new_email": "x@example.com"},
            headers=headers,
        )
        assert r.status_code == 404
