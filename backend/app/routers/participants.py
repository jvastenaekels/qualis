"""API router for participant actions."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.limiter import limiter
from app.models import Participant, ParticipantStatus, Study, StudyState
from app.schemas import ConsentInput, DraftSaveInput, ProgressUpdate, ResumeResponse
from app.services.study_service import StudyService

router = APIRouter()


@router.post("/consent")
@limiter.limit("60/minute")
async def record_consent(
    data: ConsentInput,
    request: Request,
    slug: str = Path(
        ..., title="Study Slug", description="The distinct slug of the study"
    ),
    db: AsyncSession = Depends(get_db),
):
    """Records participant consent with timestamp and version."""
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent")
    return await StudyService.record_consent(
        db,
        study_slug=data.study_slug,
        session_token=data.session_token,
        language_code=data.language_code,
        consent_hash=data.consent_hash,
        ip_address=client_ip,
        user_agent=user_agent,
        is_test_run=data.is_test_run,
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
):
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
):
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


@router.get("/resume/{session_token}", response_model=ResumeResponse)
@limiter.limit("30/minute")
async def resume_session(
    request: Request,
    slug: str = Path(
        ..., title="Study Slug", description="The distinct slug of the study"
    ),
    session_token: UUID = Path(
        ..., title="Session Token", description="The participant's session token"
    ),
    db: AsyncSession = Depends(get_db),
):
    """Returns participant session data for resuming on another device."""
    result = await db.execute(
        select(Participant, Study)
        .join(Study, Participant.study_id == Study.id)
        .where(Participant.session_token == session_token, Study.slug == slug)
    )
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    participant, study = row.tuple()

    if participant.status == ParticipantStatus.completed:
        raise HTTPException(status_code=410, detail="Session already completed")

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
    )
