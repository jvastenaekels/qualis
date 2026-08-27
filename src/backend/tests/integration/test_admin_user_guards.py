"""Integration tests for PATCH /api/admin/users/{id} and verb endpoints.

Error-body note: the error middleware (``app/middleware/errors.py``) wraps a
string ``HTTPException.detail`` into the StandardError envelope
``{"code", "message", "details"}`` — so the human-readable message lives at
``resp.json()["message"]``, NOT ``["detail"]``. This mirrors the proven
pattern in ``test_inactive_user_lockout.py``.

NOTE — non-constructibility of the distinct-actor floor refusal at integration
level: the at-least-one-active-superuser floor (refusing demote/deactivate
when only one active superuser remains) cannot be triggered by two *distinct*
actors via sequential HTTP calls. ``check_superuser`` requires the caller to
be an active superuser, so whenever the target is a *different* active
superuser, the count is already ≥ 2 and the floor (``<= 1``) cannot fire.
The only reachable path to count == 1 is through self-action (blocked by the
self-demote guard) or concurrency (serialised by ``FOR UPDATE`` row locks in
``_count_active_superusers``). That concurrency invariant is covered by the
T5 unit tests (``test_admin_user_service.py``, mutation-tested) and the
contract comment in ``admin_user_service.py``. Do not add an integration test
that demotes a distinct last-active superuser and expects 400 — it is
structurally unreachable and would be a wrong test.
"""

import logging
import time

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
    assert "2FA" in resp.json()["message"]


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
    assert "yourself" in resp.json()["message"]


@pytest.mark.asyncio
async def test_patch_user_deactivate_immediately_locks_token(
    client: AsyncClient,
    superuser_token: str,
    regular_user: User,
    regular_user_token: str,
) -> None:
    pre = await client.get(
        "/api/me", headers={"Authorization": f"Bearer {regular_user_token}"}
    )
    assert pre.status_code == 200

    resp = await client.patch(
        f"/api/admin/users/{regular_user.id}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 200

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


@pytest.mark.asyncio
async def test_patch_demote_one_of_two_superusers_succeeds(
    client: AsyncClient,
    superuser: User,
    superuser_token: str,
    second_superuser: User,
    db: AsyncSession,
) -> None:
    """Positive control: the floor ALLOWS demotion when a second active superuser
    remains after the change. Two active superusers exist; removing one leaves
    one → count stays >= 1 → 200."""
    resp = await client.patch(
        f"/api/admin/users/{second_superuser.id}",
        json={"is_superuser": False},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 200
    await db.refresh(second_superuser)
    assert second_superuser.is_superuser is False


@pytest.mark.asyncio
async def test_patch_self_deactivate_and_demote_combined_refused(
    client: AsyncClient,
    superuser: User,
    superuser_token: str,
) -> None:
    """The combined-field self path. When a superuser PATCHes themselves with
    both is_superuser=False and is_active=False, the self-deactivate guard fires
    first (assert_can_deactivate runs before assert_can_demote_superuser in the
    router) and returns 400 with 'yourself' in the message."""
    resp = await client.patch(
        f"/api/admin/users/{superuser.id}",
        json={"is_superuser": False, "is_active": False},
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 400
    assert "yourself" in resp.json()["message"]


@pytest.mark.asyncio
async def test_patch_noop_writes_no_audit_log(
    client: AsyncClient,
    superuser: User,
    superuser_token: str,
    regular_user: User,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A no-op PATCH (body sets a field to its current value) must not emit
    an audit log entry — spamming the audit trail with identity mutations
    obscures real changes. Conversely, a real mutation MUST emit exactly one
    entry. Both directions are pinned here so the test proves the guard works
    both ways, not merely that the mock never fires.

    Uses ``caplog`` on logger ``app.audit`` — the same pattern as
    ``tests/security/wave_4/test_subject_rights.py::test_article_17_audit_trail``.
    """
    # --- no-op path: is_active=True when regular_user.is_active is already True ---
    assert regular_user.is_active is True  # guard: fixture must be active
    with caplog.at_level(logging.INFO, logger="app.audit"):
        caplog.clear()
        resp = await client.patch(
            f"/api/admin/users/{regular_user.id}",
            json={"is_active": True},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert resp.status_code == 200
        audit_records = [r for r in caplog.records if r.name == "app.audit"]
        assert audit_records == [], (
            f"No-op PATCH must not emit audit entries; got: {audit_records}"
        )

    # --- real-change path: mutate full_name → audit entry is emitted ---
    with caplog.at_level(logging.INFO, logger="app.audit"):
        caplog.clear()
        resp = await client.patch(
            f"/api/admin/users/{regular_user.id}",
            json={"full_name": "Audit Canary"},
            headers={"Authorization": f"Bearer {superuser_token}"},
        )
        assert resp.status_code == 200
        audit_records = [r for r in caplog.records if r.name == "app.audit"]
        assert len(audit_records) == 1, (
            f"Real-change PATCH must emit exactly one audit entry; got: {audit_records}"
        )
        rendered = audit_records[0].getMessage()
        assert "action=patch" in rendered
        assert "resource=user" in rendered


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

    # F-03-010 compares iat vs password_changed_at at epoch-SECOND
    # resolution and allows equality (false-rejection guard,
    # dependencies.py:71-73). The fixture token's iat and the reset's
    # password_changed_at would otherwise land in the same wall-clock
    # second → token survives. Sleep one second so password_changed_at
    # strictly exceeds the token's iat. Mirrors the canonical F-03-010
    # precedent in test_session_invalidation.py:108-110.
    time.sleep(1)

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


@pytest.mark.asyncio
async def test_reset_totp_404_when_target_missing(
    client: AsyncClient, superuser_token: str
) -> None:
    resp = await client.post(
        "/api/admin/users/999999/reset-totp",
        headers={"Authorization": f"Bearer {superuser_token}"},
    )
    assert resp.status_code == 404
