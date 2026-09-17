# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Participant session endpoints, mounted under ``/api/study/{slug}``.

Every rule lives in ``app.services.participant_session_service``; each
handler reads the request, calls the service, and turns a
``SessionRejected`` into the HTTPException the route always answered with.
The consent step goes to ``SubmissionService`` directly.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.limiter import limiter, resume_code_key_func_sync
from app.schemas import (
    ConsentInput,
    ConsentResponse,
    DraftSaveInput,
    ProgressUpdate,
    ResumeResponse,
)
from app.schemas.responses import AckResponse
from app.services import participant_session_service as sessions
from app.services.participant_session_service import SessionRejected
from app.services.submission_service import SubmissionService

router = APIRouter()

_SLUG = Path(..., title="Study Slug", description="The distinct slug of the study")


@router.post("/consent", response_model=ConsentResponse)
@limiter.limit("60/minute")
async def record_consent(
    data: ConsentInput,
    request: Request,
    slug: str = _SLUG,
    db: AsyncSession = Depends(get_db),
) -> ConsentResponse:
    """Records participant consent with timestamp and version.

    The study is the one in the URL. The body still carries ``study_slug``
    for older clients; a value that disagrees with the path is a client
    bug and is refused rather than silently recorded on another study.
    """
    if data.study_slug != slug:
        raise HTTPException(
            status_code=400,
            detail="study_slug in the body does not match the study in the URL",
        )
    client_ip = request.client.host if request.client else "unknown"
    result = await SubmissionService.record_consent(
        db,
        study_slug=slug,
        session_token=data.session_token,
        language_code=data.language_code,
        consent_hash=data.consent_hash,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
    )
    return ConsentResponse.model_validate(result)


@router.patch("/progress", response_model=AckResponse)
@limiter.limit("120/minute")
async def update_progress(
    data: ProgressUpdate,
    request: Request,
    slug: str = _SLUG,
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Records the participant's current step (fire-and-forget from frontend)."""
    try:
        await sessions.update_progress(db, slug, data.session_token, data.step)
    except SessionRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return AckResponse(status="ok")


@router.put("/save-draft", response_model=AckResponse)
@limiter.limit("120/minute")
async def save_draft(
    data: DraftSaveInput,
    request: Request,
    slug: str = _SLUG,
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Saves participant draft responses (fire-and-forget from frontend)."""
    try:
        await sessions.save_draft(db, slug, data.session_token, data.draft_responses)
    except SessionRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return AckResponse(status="ok")


@router.delete("/draft", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def withdraw_draft(
    request: Request,
    session_token: UUID,
    slug: str = _SLUG,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Participant-initiated withdrawal of in-flight draft responses.

    Honours the consent-text promise that "If you withdraw before
    finalizing your sort, no partial data will be retained": clears
    ``draft_responses`` and resets progress to the start of the Q-sort.
    The ``session_token`` query parameter is the bearer of the right, as
    in the resume flow. Only the draft is cleared — full pre-submission
    erasure is the Art. 17 ``DELETE /personal-data`` route. Idempotent.
    """
    try:
        await sessions.withdraw_draft(db, slug, session_token)
    except SessionRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("/resume/{code}", response_model=ResumeResponse)
@limiter.limit("30/minute")
@limiter.limit("10/hour", key_func=resume_code_key_func_sync)
async def resume_session(
    request: Request,
    slug: str = _SLUG,
    code: str = Path(
        ...,
        title="Resume Code",
        description="Memorable resume code or legacy UUID",
        max_length=60,
        pattern=r"^[a-zA-Z0-9-]+$",  # uppercase accepted; the service lowercases
    ),
    db: AsyncSession = Depends(get_db),
) -> ResumeResponse:
    """Returns participant session data for resuming on another device.

    The lookup is scoped to the study in the URL, so a resume code never
    resolves across studies (wave 3; guarded on the service query).
    """
    try:
        return await sessions.resume(db, slug, code)
    except SessionRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.delete("/personal-data", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def participant_self_erase_personal_data(
    request: Request,
    session_token: UUID,
    slug: str = Path(..., description="The slug of the study"),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Participant-initiated GDPR Art. 17 erasure of their own personal data.

    The ``session_token`` query parameter is the bearer of the right. What
    is erased: ip_address, user_agent, confirmation_code, resume_code,
    consent_hash, draft_responses, presort_answers, postsort_answers and
    all audio recordings; the token is rotated. What is preserved: the
    Q-sort entries, anonymous research data after PII removal. Participants
    who want a hard delete should contact the researcher as the consent
    text says. Idempotent and audited.
    """
    try:
        await sessions.self_erase(db, slug, session_token)
    except SessionRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
