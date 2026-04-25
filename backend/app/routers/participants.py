"""API router for participant actions."""

import re
from datetime import datetime, timezone
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.limiter import limiter
from app.models import Participant, ParticipantStatus, Study, StudyState
from app.schemas import (
    ConsentInput,
    ConsentResponse,
    DraftSaveInput,
    ProgressUpdate,
    ResumeResponse,
)
from app.services.study_service import StudyService

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)

router = APIRouter()


@router.post("/consent", response_model=ConsentResponse)
@limiter.limit("60/minute")
async def record_consent(
    data: ConsentInput,
    request: Request,
    slug: str = Path(
        ..., title="Study Slug", description="The distinct slug of the study"
    ),
    db: AsyncSession = Depends(get_db),
) -> ConsentResponse:
    """Records participant consent with timestamp and version."""
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent")
    # StudyService.record_consent is a *args/**kwargs proxy to
    # SubmissionService.record_consent; cast aligns mypy with the actual
    # ConsentResponse it returns until the proxy is typed (Phase 3 services wave).
    return cast(
        ConsentResponse,
        await StudyService.record_consent(
            db,
            study_slug=data.study_slug,
            session_token=data.session_token,
            language_code=data.language_code,
            consent_hash=data.consent_hash,
            ip_address=client_ip,
            user_agent=user_agent,
            is_test_run=data.is_test_run,
        ),
    )


@router.patch("/progress")
@limiter.limit("120/minute")
async def update_progress(
    data: ProgressUpdate,
    request: Request,
    slug: str = Path(
        ..., title="Study Slug", description="The distinct slug of the study"
    ),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Records the participant's current step (fire-and-forget from frontend)."""
    result = await db.execute(
        select(Participant)
        .join(Study, Participant.study_id == Study.id)
        .where(Participant.session_token == data.session_token, Study.slug == slug)
        .with_for_update()
    )
    participant = result.scalar_one_or_none()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Only advance forward (never regress)
    if (
        participant.last_step_reached is None
        or data.step > participant.last_step_reached
    ):
        participant.last_step_reached = data.step
        participant.last_step_reached_at = datetime.now(timezone.utc)
        await db.commit()

    return {"status": "ok"}


@router.put("/save-draft")
@limiter.limit("120/minute")
async def save_draft(
    data: DraftSaveInput,
    request: Request,
    slug: str = Path(
        ..., title="Study Slug", description="The distinct slug of the study"
    ),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Saves participant draft responses (fire-and-forget from frontend)."""
    result = await db.execute(
        select(Participant, Study)
        .join(Study, Participant.study_id == Study.id)
        .where(Participant.session_token == data.session_token, Study.slug == slug)
        .with_for_update()
    )
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant, study = row.tuple()

    if participant.status != ParticipantStatus.started:
        raise HTTPException(status_code=410, detail="Session is no longer active")

    if study.state != StudyState.active:
        raise HTTPException(
            status_code=403, detail="Study is not currently accepting responses"
        )

    participant.draft_responses = data.draft_responses
    await db.commit()

    return {"status": "ok"}


@router.get("/resume/{code}", response_model=ResumeResponse)
@limiter.limit("30/minute")
async def resume_session(
    request: Request,
    slug: str = Path(
        ..., title="Study Slug", description="The distinct slug of the study"
    ),
    code: str = Path(
        ...,
        title="Resume Code",
        description="Memorable resume code or legacy UUID",
        max_length=60,
        pattern=r"^[a-zA-Z0-9-]+$",  # allows uppercase input; normalized to lower in handler
    ),
    db: AsyncSession = Depends(get_db),
) -> ResumeResponse:
    """Returns participant session data for resuming on another device."""
    # Normalize to lowercase (codes are always lowercase; prevents 404 from
    # mobile keyboards that auto-capitalize the first letter).
    code = code.lower()

    # Build query: try resume_code first, fall back to session_token for legacy UUIDs
    if _UUID_RE.match(code):
        result = await db.execute(
            select(Participant, Study)
            .join(Study, Participant.study_id == Study.id)
            .where(Participant.session_token == UUID(code), Study.slug == slug)
        )
    else:
        result = await db.execute(
            select(Participant, Study)
            .join(Study, Participant.study_id == Study.id)
            .where(Participant.resume_code == code, Study.slug == slug)
        )
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    participant, study = row.tuple()

    if participant.status == ParticipantStatus.completed:
        # 410 rather than 404: UX benefit of telling users they finished
        # outweighs the minor enumeration oracle risk (codes are rate-limited).
        raise HTTPException(status_code=410, detail="Session already completed")

    if participant.is_expired:
        raise HTTPException(status_code=410, detail="Session has expired")

    if study.state != StudyState.active:
        raise HTTPException(
            status_code=403,
            detail="Study is not currently accepting responses",
        )

    return ResumeResponse(
        session_token=str(participant.session_token),
        language=participant.language_used,
        last_step_reached=participant.last_step_reached or 1,
        draft_responses=participant.draft_responses or {},
        resume_code=participant.resume_code or "",
    )


@router.delete("/personal-data", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def participant_self_erase_personal_data(
    request: Request,
    session_token: UUID,
    slug: str = Path(..., description="The slug of the study"),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Participant-initiated GDPR Art. 17 erasure of their own personal data.

    Authentication: the session_token query parameter is the bearer of
    the right — only someone in possession of the original token issued
    when the participant started the Q-sort can trigger erasure for
    that participant. This is the same model used by the resume flow.

    What is erased: ip_address, user_agent, confirmation_code,
    resume_code, consent_hash, draft_responses, presort_answers,
    postsort_answers, all audio recordings (biometric data). The
    session_token is rotated (the original token can never re-access).

    What is preserved: the Q-sort entries themselves (statement
    rankings) — these are anonymous research data after the PII removal
    and represent the participant's contribution to the research.
    Participants who want a hard delete (including the rankings) should
    contact the researcher directly per the consent text shown at study
    start.

    Idempotent: repeated calls return 204 (already-anonymised
    participants are no-ops).
    """
    from app.services.study_data_service import StudyDataService

    stmt = (
        select(Participant)
        .join(Study)
        .where(
            Participant.session_token == session_token,
            Study.slug == slug,
        )
    )
    participant = (await db.execute(stmt)).scalar_one_or_none()
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    await StudyDataService.anonymise_participant(db, participant)
    return None
