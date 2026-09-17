# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""A participant's session inside one study: progress, draft, resume, erasure.

Extracted from ``routers/participants.py``, where each handler re-ran the
same study-scoped lookup and applied its rules inline. The session token
(or the memorable resume code) is the bearer of every right here; every
lookup joins the study named in the URL so a token or code never reaches
across studies (wave 3).

Rejections carry the HTTP status the route always answered with — 400 /
403 / 404 / 410 — so the router stays a one-line translation.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant, ParticipantStatus, Study, StudyState
from app.schemas import ResumeResponse
from app.services.study_data_service import StudyDataService
from app.utils.audit import log_admin_action
from app.utils.study_flow import InvalidStepTransition, validate_step_transition

logger = logging.getLogger(__name__)

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)

JsonDraft = dict[str, object]


class SessionRejected(Exception):
    """A request the participant routes refuse; ``status_code`` is the answer."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# --- Pure rules -------------------------------------------------------------


def resume_lookup(
    code: str,
) -> tuple[Literal["session_token", "resume_code"], UUID | str]:
    """A legacy UUID resumes by session token; anything else is a memorable
    code, stored lowercase (mobile keyboards capitalise the first letter)."""
    lowered = code.lower()
    if _UUID_RE.match(lowered):
        return "session_token", UUID(lowered)
    return "resume_code", lowered


def should_advance(last_step_reached: int | None, step: int) -> bool:
    """Progress only ever moves forward."""
    return last_step_reached is None or step > last_step_reached


def strip_rough_slice(draft: JsonDraft, *, rough_sort_enabled: bool) -> JsonDraft:
    """A study without the rough-sort step ignores a stale ``rough`` slice a
    legacy client may still send."""
    incoming = dict(draft)
    if not rough_sort_enabled:
        incoming.pop("rough", None)
    return incoming


# --- Lookups ----------------------------------------------------------------


async def session_in_study(
    db: AsyncSession,
    slug: str,
    session_token: UUID,
    *,
    lock: Literal["none", "participant", "both"] = "none",
) -> tuple[Participant, Study]:
    """The participant behind ``session_token`` in the study ``slug``, or 404."""
    stmt = (
        select(Participant, Study)
        .join(Study, Participant.study_id == Study.id)
        .where(Participant.session_token == session_token, Study.slug == slug)
    )
    if lock == "participant":
        stmt = stmt.with_for_update(of=Participant)
    elif lock == "both":
        stmt = stmt.with_for_update()
    row = (await db.execute(stmt)).one_or_none()
    if not row:
        raise SessionRejected(404, "Participant not found")
    participant, study = row.tuple()
    return participant, study


async def session_for_resume(
    db: AsyncSession, slug: str, code: str
) -> tuple[Participant, Study]:
    kind, value = resume_lookup(code)
    column = (
        Participant.session_token
        if kind == "session_token"
        else Participant.resume_code
    )
    row = (
        await db.execute(
            select(Participant, Study)
            .join(Study, Participant.study_id == Study.id)
            .where(column == value, Study.slug == slug)
        )
    ).one_or_none()
    if not row:
        raise SessionRejected(404, "Session not found")
    participant, study = row.tuple()
    return participant, study


# --- Operations -------------------------------------------------------------


async def update_progress(
    db: AsyncSession, slug: str, session_token: UUID, step: int
) -> None:
    participant, study = await session_in_study(
        db, slug, session_token, lock="participant"
    )
    if not should_advance(participant.last_step_reached, step):
        return
    try:
        validate_step_transition(
            current_step=participant.last_step_reached or 1,
            target_step=step,
            rough_sort_enabled=study.rough_sort_enabled,
        )
    except InvalidStepTransition as exc:
        raise SessionRejected(400, str(exc)) from exc
    participant.last_step_reached = step
    participant.last_step_reached_at = datetime.now(timezone.utc)
    await db.commit()


async def save_draft(
    db: AsyncSession, slug: str, session_token: UUID, draft: JsonDraft
) -> None:
    participant, study = await session_in_study(db, slug, session_token, lock="both")
    if participant.status != ParticipantStatus.started:
        raise SessionRejected(410, "Session is no longer active")
    if study.state != StudyState.active:
        raise SessionRejected(403, "Study is not currently accepting responses")
    participant.draft_responses = strip_rough_slice(
        draft, rough_sort_enabled=study.rough_sort_enabled
    )
    await db.commit()


async def withdraw_draft(db: AsyncSession, slug: str, session_token: UUID) -> None:
    """Clear pre-submission scratch state and send the participant back to the
    start of the Q-sort on resume. Consent and all other columns stay; a
    participant who already submitted is a no-op (the consent-text promise
    is pre-submission only). Idempotent."""
    try:
        participant, _study = await session_in_study(
            db, slug, session_token, lock="both"
        )
    except SessionRejected as exc:
        raise SessionRejected(404, "Session not found") from exc
    if participant.status == ParticipantStatus.completed:
        return
    participant.draft_responses = None
    participant.last_step_reached = 1
    participant.last_step_reached_at = datetime.now(timezone.utc)
    await db.commit()


async def resume(db: AsyncSession, slug: str, code: str) -> ResumeResponse:
    participant, study = await session_for_resume(db, slug, code)
    if participant.status == ParticipantStatus.completed:
        # 410 rather than 404: telling users they already finished is worth
        # the minor enumeration oracle (codes are rate-limited per code).
        raise SessionRejected(410, "Session already completed")
    if participant.is_expired:
        raise SessionRejected(410, "Session has expired")
    if study.state != StudyState.active:
        raise SessionRejected(403, "Study is not currently accepting responses")
    return ResumeResponse(
        session_token=str(participant.session_token),
        language=participant.language_used,
        last_step_reached=participant.last_step_reached or 1,
        draft_responses=participant.draft_responses or {},
        resume_code=participant.resume_code or "",
    )


async def self_erase(db: AsyncSession, slug: str, session_token: UUID) -> None:
    """GDPR Art. 17 erasure by the participant. PII columns and audio go, the
    session token is rotated, the anonymous Q-sort entries stay. Idempotent,
    and audited with the participant as the actor (F-05-008)."""
    try:
        participant, _study = await session_in_study(db, slug, session_token)
    except SessionRejected as exc:
        raise SessionRejected(404, "Session not found") from exc
    was_already_anonymised = participant.anonymised_at is not None
    participant_id = participant.id
    study_id = participant.study_id
    await StudyDataService.anonymise_participant(db, participant)
    log_admin_action(
        actor_user_id=None,
        action="erase_personal_data",
        resource="participant",
        resource_id=participant_id,
        study_slug=slug,
        study_id=study_id,
        already_anonymised=was_already_anonymised,
        mode="participant_self",
    )
