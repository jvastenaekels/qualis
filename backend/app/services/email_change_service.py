# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Email-change dual-confirmation flow (F-03-011).

PATCH /me with an ``email`` change does **not** rotate ``users.email``
in place. Instead the requested address is parked on
``users.pending_email`` and two short-lived JWTs are emailed:

* a ``email_change_confirm`` token to the **new** address — consuming it
  swaps ``email`` ← ``pending_email`` and clears ``pending_email``.
* a ``email_change_cancel`` token to the **old** address — consuming it
  clears ``pending_email`` without touching ``email``.

The flow defends against two attacker classes:

1. *Authenticated-session takeover.* An attacker who hijacks a live
   session (XSS, stolen access token before F-03-010 was closed) cannot
   silently move the account to an attacker-controlled mailbox: the new
   address must prove control by clicking the confirmation link, **and**
   the legitimate owner is told about the request on the old address
   with a one-click cancel.
2. *Stolen confirmation link.* The token carries the requested
   ``new_email`` as a claim, and the consume path cross-checks it
   against the user's current ``pending_email``. A second PATCH /me
   replaces ``pending_email``, so a previously-issued confirm token now
   mismatches the row and is rejected (single-use semantics without
   needing the JTI denylist).

Single pending change at a time: a fresh PATCH /me overwrites
``pending_email``. The prior confirm token is invalidated by the
new_email mismatch above; the prior cancel token still works (it only
needs to clear the row), which is fine — clearing a different pending
request than the one the user remembers is a no-op for them.
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import User
from app.utils.email import (
    send_email_change_confirmation,
    send_email_change_notification,
)
from app.utils.security import create_email_token


async def initiate_email_change(db: AsyncSession, user: User, new_email: str) -> None:
    """Park the requested new email and dispatch the two link emails.

    The caller is responsible for committing the surrounding transaction.
    The function flushes the ``pending_email`` write so token issuance
    sees the most recent value, but does not commit — keeping the DB
    write and the side-effecting emails inside the same unit of work.

    Anti-enumeration: this function does **not** check whether
    ``new_email`` is already used by another account. The check happens
    at confirm time (when the swap would otherwise hit the unique
    constraint on ``users.email``). If the address is already taken, the
    user receives a confirmation link that will fail at consume time —
    the API caller cannot distinguish "address taken" from "address free"
    by inspecting the PATCH response.
    """
    user.pending_email = new_email
    await db.flush()

    confirm_token = create_email_token(
        email=user.email,
        purpose="email_change_confirm",
        expires_delta=timedelta(hours=settings.EMAIL_CHANGE_CONFIRM_TOKEN_EXPIRE_HOURS),
        new_email=new_email,
    )
    cancel_token = create_email_token(
        email=user.email,
        purpose="email_change_cancel",
        expires_delta=timedelta(hours=settings.EMAIL_CHANGE_CANCEL_TOKEN_EXPIRE_HOURS),
    )

    confirm_url = f"{settings.FRONTEND_URL}/email-change/confirm?token={confirm_token}"
    cancel_url = f"{settings.FRONTEND_URL}/email-change/cancel?token={cancel_token}"

    send_email_change_confirmation(email_to=new_email, confirm_url=confirm_url)
    send_email_change_notification(
        email_to=user.email, new_email=new_email, cancel_url=cancel_url
    )
