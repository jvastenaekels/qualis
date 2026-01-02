"""API router for study submissions."""

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.limiter import limiter
from app.schemas import SubmissionInput
from app.services.study_service import StudyService

router = APIRouter()


@router.post("/submit")
@limiter.limit("60/minute")
async def submit_study(
    data: SubmissionInput, request: Request, db: AsyncSession = Depends(get_db)
):
    """Submits or updates a study participation.

    Logic moved to StudyService for maintainability.
    """
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent")
    confirmation_code = await StudyService.process_submission(
        db, data, client_ip, user_agent
    )
    return {"status": "success", "confirmation_code": confirmation_code}


@router.get("/study/{slug}")
@limiter.limit("120/minute")
async def get_study(
    request: Request,
    slug: str = Path(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=100),
    lang: str = Query("en", pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5),
    db: AsyncSession = Depends(get_db),
):
    """Fetches study configuration for the frontend, including language resolution."""
    study = await StudyService.get_study_by_slug(db, slug)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    resolved_lang, translation = StudyService.resolve_translation(study, lang)

    # Transform to Frontend Format
    title = (
        translation.title
        if (translation and hasattr(translation, "title"))
        else study.slug
    )
    description = (
        translation.description
        if (translation and hasattr(translation, "description"))
        else ""
    )
    instructions = (
        translation.instructions
        if (translation and hasattr(translation, "instructions"))
        else ""
    )
    subtitle = (
        translation.subtitle
        if (translation and hasattr(translation, "subtitle"))
        else None
    )
    objective = (
        translation.objective
        if (translation and hasattr(translation, "objective"))
        else None
    )

    statements_data = []
    for s in study.statements:
        # Resolve statement translation
        s_trans = next(
            (t for t in s.translations if t.language_code == resolved_lang), None
        )
        if not s_trans:
            s_trans = next((t for t in s.translations if t.language_code == "en"), None)
        if not s_trans and s.translations:
            s_trans = s.translations[0]

        text = s_trans.text if s_trans else s.code
        statements_data.append({"id": s.id, "text": text, "code": s.code})

    return {
        "slug": study.slug,
        "title": title,
        "subtitle": subtitle,
        "description": description,
        "objective": objective,
        "instructions": instructions,
        "presort_config": study.presort_config,
        "grid_config": study.grid_config,
        "statements": statements_data,
        "consent": {
            "title": getattr(translation, "consent_title", None),
            "description": getattr(translation, "consent_description", None),
            "accept": getattr(translation, "consent_accept", None),
            "decline": getattr(translation, "consent_decline", None),
        },
        "available_languages": [t.language_code for t in study.translations],
        "language": resolved_lang,
        "default_language": study.default_language,
        "show_statement_codes": study.show_statement_codes,
        "ui_labels": getattr(translation, "ui_labels", {}),
        "state": study.state.value,
    }
