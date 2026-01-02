"""API router for participant actions."""

from fastapi import APIRouter, Depends, Path, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.limiter import limiter
from app.schemas import ConsentInput
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
    )
