"""Account invitation: a superuser invites an address, the invitee picks the password."""

import logging
from unittest.mock import patch

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import delete, func, select

from app.core.config import settings
from app.models import ProjectMember, User
from app.utils.security import create_invitation_token

URL = "/api/admin/users/invitations"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _invite(client: AsyncClient, token: str, email: str):
    return await client.post(URL, json={"email": email}, headers=_auth(token))


def _token_of(resp) -> str:
    return resp.json()["invite_url"].split("token=", 1)[1]


async def _register(
    client: AsyncClient, email: str, token: str, pw: str = "chosen-pw-123"
):
    return await client.post(
        "/api/register",
        json={"email": email, "password": pw, "invitation_token": token},
    )


@pytest.mark.asyncio
async def test_superuser_invites_and_invitee_registers(
    client: AsyncClient, superuser_token: str, db
) -> None:
    resp = await _invite(client, superuser_token, "newcomer@example.com")
    assert resp.status_code == 201
    body = resp.json()
    assert body["invite_url"].startswith(f"{settings.FRONTEND_URL}/register?token=")
    assert body["expires_at"]

    reg = await _register(client, "newcomer@example.com", _token_of(resp))
    assert reg.status_code == 201, reg.text

    login = await client.post(
        "/api/token",
        data={"username": "newcomer@example.com", "password": "chosen-pw-123"},
    )
    assert login.status_code == 200
    user = (
        await db.execute(select(User).where(User.email == "newcomer@example.com"))
    ).scalar_one()
    count = await db.scalar(
        select(func.count())
        .select_from(ProjectMember)
        .where(ProjectMember.user_id == user.id)
    )
    assert count == 0


@pytest.mark.asyncio
async def test_invitation_requires_superuser(
    client: AsyncClient, regular_user_token: str
) -> None:
    resp = await _invite(client, regular_user_token, "x@example.com")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invitation_refuses_registered_email_any_case(
    client: AsyncClient, superuser_token: str, user_factory
) -> None:
    await user_factory(email="a@x.fi")
    resp = await _invite(client, superuser_token, "A@X.FI")
    assert resp.status_code == 409
    assert resp.json()["message"] == "email_already_registered"


@pytest.mark.asyncio
async def test_invitation_lowercases_email(
    client: AsyncClient, superuser_token: str
) -> None:
    resp = await _invite(client, superuser_token, "Mixed.Case@Example.COM")
    assert resp.status_code == 201
    payload = jwt.decode(
        _token_of(resp), settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
    )
    assert payload["sub"] == "mixed.case@example.com"


@pytest.mark.asyncio
async def test_register_works_when_public_registration_closed(
    client: AsyncClient, superuser_token: str, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "ALLOW_PUBLIC_REGISTRATION", False)
    resp = await _invite(client, superuser_token, "closed@example.com")
    reg = await _register(client, "closed@example.com", _token_of(resp))
    assert reg.status_code == 201, reg.text

    # 201 is also the anti-enumeration no-op shape: only a login proves creation.
    login = await client.post(
        "/api/token",
        data={"username": "closed@example.com", "password": "chosen-pw-123"},
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_replay_after_account_deletion_is_refused(
    client: AsyncClient, superuser_token: str, db
) -> None:
    resp = await _invite(client, superuser_token, "replay@example.com")
    token = _token_of(resp)
    assert (await _register(client, "replay@example.com", token)).status_code == 201
    await db.execute(delete(User).where(User.email == "replay@example.com"))
    await db.commit()

    again = await _register(client, "replay@example.com", token)
    assert again.status_code == 400
    assert again.json()["message"] == "invitation_already_used"


@pytest.mark.asyncio
async def test_replay_on_existing_account_is_refused(
    client: AsyncClient, superuser_token: str
) -> None:
    resp = await _invite(client, superuser_token, "twice@example.com")
    token = _token_of(resp)
    assert (await _register(client, "twice@example.com", token)).status_code == 201

    with patch("app.routers.auth.send_register_already_registered") as notify:
        again = await _register(client, "twice@example.com", token, pw="other-pw-456")
    assert again.status_code == 400
    assert again.json()["message"] == "invitation_already_used"
    notify.assert_not_called()


@pytest.mark.asyncio
async def test_existing_account_password_unchanged(
    client: AsyncClient, superuser_token: str, user_factory
) -> None:
    resp = await _invite(client, superuser_token, "late@example.com")
    await user_factory(email="late@example.com", password="old-password-1")

    await _register(client, "late@example.com", _token_of(resp), pw="new-password-2")

    old = await client.post(
        "/api/token",
        data={"username": "late@example.com", "password": "old-password-1"},
    )
    new = await client.post(
        "/api/token",
        data={"username": "late@example.com", "password": "new-password-2"},
    )
    assert old.status_code == 200
    assert new.status_code == 401


@pytest.mark.asyncio
async def test_accept_refuses_account_invitation(
    client: AsyncClient, superuser_token: str, regular_user, regular_user_token: str
) -> None:
    token = create_invitation_token(email=regular_user.email, role="member")
    resp = await client.post(
        "/api/admin/invitations/accept",
        json={"token": token},
        headers=_auth(regular_user_token),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_verify_reports_no_project(
    client: AsyncClient, superuser_token: str
) -> None:
    resp = await _invite(client, superuser_token, "verify@example.com")
    out = await client.get(
        "/api/admin/invitations/verify", params={"token": _token_of(resp)}
    )
    assert out.status_code == 200
    body = out.json()
    assert body["email"] == "verify@example.com"
    assert body["project_id"] is None
    assert body["project_name"] is None


@pytest.mark.asyncio
async def test_verify_refuses_used_invitation(
    client: AsyncClient, superuser_token: str
) -> None:
    resp = await _invite(client, superuser_token, "used@example.com")
    token = _token_of(resp)
    assert (await _register(client, "used@example.com", token)).status_code == 201

    out = await client.get("/api/admin/invitations/verify", params={"token": token})
    assert out.status_code == 400
    assert out.json()["message"] == "invitation_already_used"


@pytest.mark.asyncio
async def test_no_email_and_no_token_in_logs_without_smtp(
    client: AsyncClient, superuser_token: str, monkeypatch, caplog
) -> None:
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    with (
        caplog.at_level(logging.DEBUG),
        patch("app.routers.admin.users.send_account_invitation_email") as sender,
    ):
        resp = await _invite(client, superuser_token, "quiet@example.com")
    assert resp.status_code == 201
    sender.assert_not_called()
    assert _token_of(resp) not in caplog.text


@pytest.mark.asyncio
async def test_email_sent_when_smtp_configured(
    client: AsyncClient, superuser_token: str, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USER", "user")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "pass")
    with patch("app.routers.admin.users.send_account_invitation_email") as sender:
        resp = await _invite(client, superuser_token, "mailed@example.com")
    assert resp.status_code == 201
    sender.assert_called_once_with("mailed@example.com", resp.json()["invite_url"])


@pytest.mark.asyncio
async def test_register_folds_case_against_account_created_after_invitation(
    client: AsyncClient, superuser_token: str, user_factory, db
) -> None:
    resp = await _invite(client, superuser_token, "alice@example.com")
    await user_factory(email="Alice@Example.com", password="old-password-1")

    reg = await _register(
        client, "alice@example.com", _token_of(resp), pw="new-password-2"
    )
    assert reg.status_code == 201, reg.text

    rows = (
        (
            await db.execute(
                select(User.email).where(func.lower(User.email) == "alice@example.com")
            )
        )
        .scalars()
        .all()
    )
    assert rows == ["Alice@Example.com"]
    old = await client.post(
        "/api/token",
        data={"username": "Alice@Example.com", "password": "old-password-1"},
    )
    new = await client.post(
        "/api/token",
        data={"username": "Alice@Example.com", "password": "new-password-2"},
    )
    assert old.status_code == 200
    assert new.status_code == 401
