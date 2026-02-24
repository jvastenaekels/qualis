"""Admin routes for study import, export, and statistics."""

import json
import logging
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import (
    check_study_permission,
    get_current_user,
    get_current_workspace,
    require_workspace_role,
)
from app.limiter import limiter
from app.models import (
    AudioRecording,
    Participant,
    RecruitmentLink,
    Statement,
    StatementTranslation,
    Study,
    StudyRole,
    StudyState,
    StudyTranslation,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
from app.schemas import StudyStatsRead

router = APIRouter()
logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Stats
# ------------------------------------------------------------------


@router.get("/{slug}/stats", response_model=StudyStatsRead)
async def get_study_stats(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated study statistics."""
    from app.services.study_data_service import StudyDataService

    return await StudyDataService.get_study_stats(db, study.id)


# ------------------------------------------------------------------
# Export
# ------------------------------------------------------------------


@router.get("/{slug}/export/config")
async def export_study_config(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export study configuration without participant data.
    Returns clean JSON suitable for import.
    """
    # Ensure relationships are loaded
    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(
            selectinload(Study.translations),
            selectinload(Study.statements).selectinload(Statement.translations),
            selectinload(Study.recruitment_links),
        )
    )
    res = await db.execute(stmt)
    study = res.scalar_one()

    # Build export structure
    config = {
        "version": "1.0",  # Schema version for future compatibility
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "exported_by": current_user.email,
        "study": {
            "slug": study.slug,
            "default_language": study.default_language,
            "show_statement_codes": study.show_statement_codes,
            "randomize_statement_order": study.randomize_statement_order,
            "symmetry_lock": study.symmetry_lock,
            "grid_config": study.grid_config,
            "presort_config": study.presort_config,
            "postsort_config": study.postsort_config,
            "branding": study.branding,
            "access_password": study.access_password,
            "start_date": study.start_date.isoformat().replace("+00:00", "Z")
            if study.start_date
            else None,
            "end_date": study.end_date.isoformat().replace("+00:00", "Z")
            if study.end_date
            else None,
            "translations": [
                {
                    "language_code": t.language_code,
                    "title": t.title,
                    "subtitle": t.subtitle,
                    "description": t.description,
                    "objective": t.objective,
                    "instructions": t.instructions,
                    "condition_of_instruction": t.condition_of_instruction,
                    "pre_instruction": t.pre_instruction,
                    "consent_title": t.consent_title,
                    "consent_description": t.consent_description,
                    "ui_labels": t.ui_labels,
                    "process_steps": t.process_steps,
                    "methodology_tips": t.methodology_tips,
                    "step_help": t.step_help,
                }
                for t in study.translations
            ],
            "statements": [
                {
                    "code": s.code,
                    "translations": [
                        {"language_code": st.language_code, "text": st.text}
                        for st in s.translations
                    ],
                }
                for s in sorted(study.statements, key=lambda s: s.display_order)
            ],
            "recruitment_links": [
                {
                    "type": link.type.value,
                    "name": link.name,
                    "capacity": link.capacity,
                    "is_active": link.is_active,
                    # We do not export tokens as they are secrets/unique
                    # We do not export usage stats
                }
                for link in study.recruitment_links
            ],
        },
    }

    filename = (
        f"{study.slug}_config_{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    )

    return JSONResponse(
        content=config,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ------------------------------------------------------------------
# Import validation
# ------------------------------------------------------------------


class ValidationSummary(BaseModel):
    title: str
    languages: list[str]
    statement_count: int
    grid_range: str
    has_presort: bool
    has_postsort: bool


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str]
    warnings: list[str]
    summary: ValidationSummary | None = None


def _get_grid_range(grid_config: list) -> str:
    """Helper to get grid score range as string"""
    if not grid_config:
        return "Unknown"
    try:
        scores = [col["score"] for col in grid_config if isinstance(col, dict)]
        if not scores:
            return "Unknown"
        return f"{min(scores)} to {max(scores)}"
    except (KeyError, ValueError, TypeError):
        return "Invalid"


@router.post("/validate-import", response_model=ValidationResult)
@limiter.limit("30/minute")
async def validate_study_import(
    request: Request,
    config: dict,
    current_user: User = Depends(get_current_user),
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate imported configuration without creating study.
    Returns validation results and warnings.
    """
    warnings = []
    errors = []

    def add_error(key: str, **kwargs):
        errors.append(
            json.dumps({"key": f"admin.import.validation.errors.{key}", **kwargs})
        )

    def add_warning(key: str, **kwargs):
        warnings.append(
            json.dumps({"key": f"admin.import.validation.warnings.{key}", **kwargs})
        )

    # Check version
    version = config.get("version")
    if not version:
        add_error("missing_version")
    elif version != "1.0":
        add_error("unsupported_version", version=version)

    study_data = config.get("study") or {}
    if not isinstance(study_data, dict):
        add_error("invalid_structure")
        study_data = {}

    # Validate required fields
    required = ["translations", "statements", "grid_config"]
    for field in required:
        if field not in study_data:
            add_error("missing_field", field=field)

    # Check translations
    translations = study_data.get("translations") or []
    if not isinstance(translations, list):
        add_error("invalid_translations")
        translations = []

    if not translations:
        add_error("no_translations")

    consent_missing = False
    for i, trans in enumerate(translations):
        required_trans = [
            "language_code",
            "title",
        ]
        for field in required_trans:
            if field not in trans or not trans[field]:
                add_error("missing_translation_field", index=i + 1, field=field)

        # Check for missing consent fields (warning only for drafts)
        if not trans.get("consent_title") or not trans.get("consent_description"):
            consent_missing = True

        # Validate language code
        lang_code = trans.get("language_code", "")
        if lang_code and not re.match(r"^[a-z]{2}(-[A-Z]{2})?$", lang_code):
            add_error("invalid_lang_code", lang=lang_code)

    if consent_missing:
        add_warning("missing_consent_draft")

    # Check statements
    statements = study_data.get("statements") or []
    if not isinstance(statements, list):
        add_error("invalid_statements")
        statements = []

    if not statements:
        add_error("no_statements")

    # Check for duplicate codes
    codes = [s.get("code") for s in statements if isinstance(s, dict) and s.get("code")]
    duplicates = [code for code in codes if codes.count(code) > 1]
    if duplicates:
        add_error(
            "duplicate_codes", codes=", ".join(set(str(c) for c in duplicates if c))
        )

    # Check statement translations
    for i, stmt in enumerate(statements):
        if "translations" not in stmt or not stmt["translations"]:
            add_error("missing_stmt_translations", index=i + 1)

    # Check statements vs grid capacity
    grid_config = study_data.get("grid_config", [])
    if grid_config:
        if not isinstance(grid_config, list):
            add_error("invalid_grid_config")
        else:
            try:
                grid_capacity = sum(
                    int(col.get("capacity", 0))
                    for col in grid_config
                    if isinstance(col, dict)
                )
                statement_count = len(statements)
                if statement_count != grid_capacity:
                    add_warning(
                        "grid_capacity_mismatch",
                        count=statement_count,
                        capacity=grid_capacity,
                    )
            except (KeyError, TypeError, ValueError) as e:
                add_error("invalid_grid_structure", error=str(e))

    # Check for external resources
    branding = study_data.get("branding") or {}
    if isinstance(branding, dict):
        logo_url = branding.get("logo_url")
        if logo_url and logo_url.startswith("http"):
            add_warning("external_logo")

        partners = branding.get("partners") or []
        for partner in partners:
            partner_logo = partner.get("logo_url")
            if (
                isinstance(partner, dict)
                and partner_logo
                and partner_logo.startswith("http")
            ):
                warnings.append(
                    f"Partner '{partner.get('name', 'Unknown')}' logo references external resource"
                )

    # Check recruitment links
    recruitment_links = study_data.get("recruitment_links", [])
    if recruitment_links and not isinstance(recruitment_links, list):
        add_error("invalid_recruitment_links")
    elif recruitment_links:
        for i, link in enumerate(recruitment_links):
            if not isinstance(link, dict) or not link.get("name"):
                add_error("invalid_recruitment_link_structure", index=i + 1)

    # Summary
    summary = None
    if not errors:
        try:
            summary_trans = translations[0] if translations else {}
            summary = ValidationSummary(
                title=summary_trans.get("title", "Unknown"),
                languages=[t.get("language_code", "??") for t in translations],
                statement_count=len(statements),
                grid_range=_get_grid_range(grid_config),
                has_presort=bool(study_data.get("presort_config")),
                has_postsort=bool(study_data.get("postsort_config")),
            )
        except Exception as e:
            errors.append(f"Error building summary: {str(e)}")

    return ValidationResult(
        valid=len(errors) == 0, errors=errors, warnings=warnings, summary=summary
    )


# ------------------------------------------------------------------
# Import
# ------------------------------------------------------------------


class StudyImportRequest(BaseModel):
    config: dict
    new_slug: str

    @field_validator("new_slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9-]{3,100}$", v):
            raise ValueError(
                "Slug must be 3-100 characters, lowercase letters, numbers, and hyphens only"
            )
        return v


class StudyImportResponse(BaseModel):
    slug: str
    message: str


@router.post("/import", response_model=StudyImportResponse)
@limiter.limit("30/minute")
async def import_study_config(
    request: Request,
    import_data: StudyImportRequest,
    current_user: User = Depends(get_current_user),
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(
        require_workspace_role(WorkspaceRole.researcher)
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Import study configuration from exported JSON.
    Creates a new study in draft state.
    """
    workspace, member = workspace_ctx

    config = import_data.config
    version = config.get("version")
    if version != "1.0":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported configuration version: {version}. Expected: 1.0",
        )

    # Check slug uniqueness
    query = select(Study).where(Study.slug == import_data.new_slug)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Study with slug '{import_data.new_slug}' already exists",
        )

    study_data = config.get("study", {}).copy()

    # Create Study in DRAFT
    try:
        db_study = Study(
            slug=import_data.new_slug,
            workspace_id=workspace.id,
            state=StudyState.draft,
            grid_config=study_data.get("grid_config"),
            presort_config=study_data.get("presort_config", {}),
            postsort_config=study_data.get("postsort_config", {}),
            default_language=study_data.get("default_language", "en"),
            show_statement_codes=study_data.get("show_statement_codes", False),
            randomize_statement_order=study_data.get(
                "randomize_statement_order", False
            ),
            symmetry_lock=study_data.get("symmetry_lock", True),
            branding=study_data.get("branding"),
            access_password=study_data.get("access_password"),
            start_date=datetime.fromisoformat(study_data.get("start_date"))
            if study_data.get("start_date")
            else None,
            end_date=datetime.fromisoformat(study_data.get("end_date"))
            if study_data.get("end_date")
            else None,
        )
        db.add(db_study)
        await db.flush()

        # Translations
        for t_data in study_data.get("translations", []):
            # Ensure required non-nullable fields have defaults
            if "description" not in t_data or t_data["description"] is None:
                t_data["description"] = ""
            db.add(StudyTranslation(study_id=db_study.id, **t_data))

        # Statements
        for idx, s_data in enumerate(study_data.get("statements", [])):
            stmt = Statement(
                study_id=db_study.id, code=s_data.get("code"), display_order=idx
            )
            db.add(stmt)
            await db.flush()
            for st_data in s_data.get("translations", []):
                db.add(
                    StatementTranslation(
                        statement_id=stmt.id,
                        language_code=st_data.get("language_code"),
                        text=st_data.get("text"),
                    )
                )

        # Recruitment Links
        # We need to generate new unique tokens for each link
        for link_data in study_data.get("recruitment_links", []):
            # Generate a new token
            token = secrets.token_urlsafe(16)

            db.add(
                RecruitmentLink(
                    study_id=db_study.id,
                    type=link_data.get("type", "public"),
                    name=link_data.get("name"),
                    capacity=link_data.get("capacity"),
                    is_active=link_data.get("is_active", True),
                    token=token,
                )
            )

        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Error during study import: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import study: {str(e)}",
        )

    return StudyImportResponse(
        slug=db_study.slug, message="Study imported successfully"
    )


# ------------------------------------------------------------------
# Storage usage
# ------------------------------------------------------------------


@router.get("/{slug}/storage-usage")
async def get_study_storage_usage(
    slug: str,
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
):
    """
    Get audio storage usage statistics for a study.

    Returns:
        Dictionary with total_bytes, total_mb, file_count, quota_mb, quota_bytes, usage_percent
    """
    # Total storage used
    result = await db.execute(
        select(
            func.coalesce(func.sum(AudioRecording.file_size_bytes), 0).label(
                "total_bytes"
            ),
            func.count(AudioRecording.id).label("file_count"),
        )
        .join(Participant)
        .where(Participant.study_id == study.id)
    )
    stats = result.first()

    # Get quota from config
    audio_config = study.postsort_config.get("audio", {})
    quota_mb = audio_config.get("max_storage_mb", 100)

    # Handle case where no recordings exist yet
    total_bytes = stats.total_bytes if stats else 0
    file_count = stats.file_count if stats else 0

    return {
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / 1024 / 1024, 2),
        "file_count": file_count,
        "quota_mb": quota_mb,
        "quota_bytes": quota_mb * 1024 * 1024,
        "usage_percent": round((total_bytes / (quota_mb * 1024 * 1024)) * 100, 2)
        if quota_mb > 0
        else 0,
    }
