"""One lookup for "the user behind this e-mail address".

routers/auth.py held ten copies of ``select(User).where(User.email == …)``
and dependencies.py an eleventh. They all mean the same thing; a future
change (case folding, a soft-delete filter) would have had eleven places
to miss.
"""

from __future__ import annotations

import pytest

from app.dependencies import user_by_email
from tests.conftest import TEST_EMAIL


@pytest.mark.asyncio
async def test_user_by_email_returns_the_user_or_none(db, test_user) -> None:
    assert (await user_by_email(db, TEST_EMAIL)) is not None
    assert (await user_by_email(db, TEST_EMAIL)).id == test_user.id  # type: ignore[union-attr]
    assert (await user_by_email(db, "nobody@example.org")) is None


def test_auth_router_has_no_inline_copy_left() -> None:
    from pathlib import Path

    src = (
        Path(__file__).resolve().parents[2] / "app" / "routers" / "auth.py"
    ).read_text(encoding="utf-8")
    assert "select(User).where(User.email" not in src
