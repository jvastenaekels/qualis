"""API router for study submissions."""

from typing import Any
from uuid import UUID
import logging

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import ServiceError
from app.limiter import limiter
from app.schemas import SubmissionInput
from app.schemas.responses import AckResponse, ResolvedStudyConfigResponse
from app.services.study_service import StudyService
from app.services.recruitment_service import RecruitmentService
from app.utils.security import verify_password

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/submit")
@limiter.limit("60/minute")
async def submit_study(
    request: Request, data: SubmissionInput, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Submits or updates a study participation.

    Logic moved to StudyService for maintainability.
    """
    # Edge case: Handle None request.client
    client_ip = "unknown"
    if request.client and hasattr(request.client, "host"):
        client_ip = request.client.host or "unknown"

    user_agent = request.headers.get("user-agent")

    try:
        result = await StudyService.process_submission(db, data, client_ip, user_agent)
        await db.commit()
        response = {
            "status": "success",
            "confirmation_code": result["confirmation_code"],
            "id": result["id"],
        }
        if result.get("already_submitted"):
            response["already_submitted"] = True
        return response
    except HTTPException:
        # Re-raise HTTP exceptions (they're already properly formatted)
        raise
    except ServiceError:
        # Re-raise business exceptions (handled by global exception handler)
        raise
    except Exception as e:
        await db.rollback()
        logger.error(
            f"Unexpected error during submission (study={data.study_slug}): {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error during submission: {str(e)}",
        )


@router.get("/study/{slug}", response_model=ResolvedStudyConfigResponse)
@limiter.limit("120/minute")
async def get_study(
    request: Request,
    slug: str = Path(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=100),
    lang: str | None = Query(None, pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5),
    session_token: UUID | None = Query(
        None, description="Participant session token for deterministic randomization"
    ),
    link_token: str | None = Query(None, description="Recruitment link token"),
    password: str | None = Query(None, description="Study access password"),
    db: AsyncSession = Depends(get_db),
) -> ResolvedStudyConfigResponse:
    """Fetches study configuration for the frontend, including language resolution.

    If the study has randomize_statement_order=True and a session_token is provided,
    statements will be shuffled deterministically using the token as seed.
    This ensures the same participant always sees statements in the same order.
    """
    study = await StudyService.get_study_by_slug(db, slug)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    # 3. Recruitment Link Validation
    if link_token:
        link = await RecruitmentService.validate_link_token(db, study.id, link_token)
        if not link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid, expired, or full recruitment link",
            )
        # Record start (participant accessed the study layout)
        await RecruitmentService.record_start(db, link.id)
        await db.commit()

    # 4. Password Protection
    if study.access_password and not verify_password(
        password or "", study.access_password
    ):
        # Return only basic metadata if password is not provided or incorrect
        metadata = StudyService.get_basic_metadata(study, lang)
        metadata["requires_password"] = True
        return ResolvedStudyConfigResponse.model_validate(metadata)

    # Delegate complex resolution and transformation to service layer
    resolved = await StudyService.get_resolved_study_config(
        study=study, lang=lang, session_token=session_token
    )
    return ResolvedStudyConfigResponse.model_validate(resolved)


@router.post("/study/{slug}/unlock", response_model=AckResponse)
@limiter.limit("10/minute")
async def unlock_study(
    request: Request,
    password: str = Query(...),
    slug: str = Path(..., pattern="^[a-z0-9-]+$"),
    db: AsyncSession = Depends(get_db),
) -> AckResponse:
    """Validate study access password."""
    study = await StudyService.get_study_by_slug(db, slug)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    if not study.access_password:
        return AckResponse(status="unlocked", details="No password required")

    if verify_password(password, study.access_password):
        return AckResponse(status="unlocked")

    raise HTTPException(status_code=403, detail="Incorrect password")
