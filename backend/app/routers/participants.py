"""API router for participant actions."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.limiter import limiter
from app.models import Participant, Study
from app.schemas import ConsentInput, ProgressUpdate
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
