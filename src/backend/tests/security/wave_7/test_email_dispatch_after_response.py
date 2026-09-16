"""Anti-enumeration endpoints must answer before any e-mail leaves.

``password_reset_request``, ``resend_verification`` and
``twofa_disable_request`` pad both arms with one bcrypt call so a known
address and an unknown one take the same time. Before wave 7 the known
arm then called the synchronous SMTP sender inline — connect, STARTTLS,
LOGIN, send — and only then returned. With SMTP configured that is one to
two orders of magnitude more than the padding, and it exists on one arm
only, so the channel the padding closes was reopened just below it. The
same call also blocked the event loop for every other request on the
worker.

The fix hands the send to Starlette background tasks, which run after the
response has been written. The test observes exactly that ordering at the
ASGI boundary: the ``http.response.start`` message is sent before the
(patched) sender is called.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from tests.conftest import TEST_EMAIL

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]


class _RecordResponseStart:
    """ASGI wrapper that timestamps the first ``http.response.start``."""

    def __init__(self, inner: Any, marks: dict[str, float]) -> None:
        self.inner = inner
        self.marks = marks

    async def __call__(
        self,
        scope: Scope,
        receive: Callable[[], Awaitable[Message]],
        send: Callable[[Message], Awaitable[None]],
    ) -> None:
        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                self.marks.setdefault("response_started", time.perf_counter())
            await send(message)

        await self.inner(scope, receive, send_wrapper)


@pytest.fixture
async def recording_client(db):
    marks: dict[str, float] = {}

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=_RecordResponseStart(app, marks))
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c, marks
    app.dependency_overrides.clear()


def _slow_sender(marks: dict[str, float]):
    def sender(*args: Any, **kwargs: Any) -> None:
        marks.setdefault("send_called", time.perf_counter())
        time.sleep(0.05)

    return sender


@pytest.mark.asyncio
async def test_password_reset_request_answers_before_sending(
    recording_client, test_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, marks = recording_client
    monkeypatch.setattr("app.routers.auth.send_password_reset", _slow_sender(marks))

    r = await client.post("/api/password/reset/request", json={"email": TEST_EMAIL})

    assert r.status_code == 200
    assert "send_called" in marks, "known-address arm did not send"
    assert marks["response_started"] < marks["send_called"]


@pytest.mark.asyncio
async def test_twofa_disable_request_answers_before_sending(
    recording_client, totp_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, marks = recording_client
    monkeypatch.setattr("app.routers.auth.send_twofa_disable_link", _slow_sender(marks))

    r = await client.post("/api/2fa/disable/request", json={"email": totp_user.email})

    assert r.status_code == 200
    assert "send_called" in marks
    assert marks["response_started"] < marks["send_called"]


@pytest.mark.asyncio
async def test_resend_verification_answers_before_sending(
    recording_client, db, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.models import User
    from app.utils.security import get_password_hash

    user = User(email="unverified@example.org", hashed_password=get_password_hash("x" * 12))
    db.add(user)
    await db.commit()

    client, marks = recording_client
    monkeypatch.setattr("app.routers.auth.send_email_verification", _slow_sender(marks))

    r = await client.post("/api/email/verify/resend", json={"email": user.email})

    assert r.status_code == 200
    assert "send_called" in marks
    assert marks["response_started"] < marks["send_called"]
