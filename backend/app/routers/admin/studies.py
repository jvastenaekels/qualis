"""Admin routes for study management."""

from typing import cast
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    check_study_permission,
    get_current_user,
    get_current_workspace,
)
from app.models import (
    AudioRecording,
    Participant,
    Study,
    StudyRole,
    StudyState,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
from sqlalchemy import func
from app.schemas import (
    ParticipantDiscardUpdate,
    ParticipantRead,
    ParticipantDetailRead,
    StudyCreate,
    StudyRead,
    StudyStatsRead,
    StudyUpdate,
)
from pydantic import BaseModel, field_validator
import re
from datetime import datetime, timezone
import json
from fastapi.responses import JSONResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("", response_model=StudyRead, status_code=status.HTTP_201_CREATED)
async def create_study(
    study: StudyCreate,
    current_user: User = Depends(get_current_user),
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Create a new study in the active workspace."""
    workspace, member = workspace_ctx

    # Check permission (Researcher or Admin)
    # Check Role Hierarchy
    # We could import WORKSPACE_ROLE_HIERARCHY but we can also just check role value for now
    if member.role not in [
        WorkspaceRole.owner,
        WorkspaceRole.researcher,
        WorkspaceRole.owner,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You need to be an Admin or Researcher in this Workspace to create a study.",
        )

    # 1. Check slug uniqueness
    query = select(Study).where(Study.slug == study.slug)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Study with this slug already exists",
        )

    try:
        # 2. Create Study
        db_study = Study(
            slug=study.slug,
            workspace_id=workspace.id,
            state=StudyState.draft,  # Always draft initially
            grid_config=[col.model_dump() for col in study.grid_config],
            presort_config=study.presort_config,
            postsort_config=study.postsort_config,
            default_language=study.default_language
            or (study.translations[0].language_code if study.translations else "en"),
            show_statement_codes=study.show_statement_codes,
            branding=study.branding.model_dump() if study.branding else None,
            start_date=study.start_date,
            end_date=study.end_date,
        )
        db.add(db_study)
        await db.flush()  # to get ID

        from app.models import Statement, StatementTranslation, StudyTranslation
        from app.services.study_service import (
            DEFAULT_PROCESS_STEPS,
            DEFAULT_TRANSLATION_CONTENT,
        )

        logger.error(
            f"DEBUG: creating study with translations: {len(study.translations)}"
        )
        for t_in in study.translations:
            t_data = t_in.model_dump()
            lang = t_data.get("language_code", "en")
            defaults = DEFAULT_TRANSLATION_CONTENT.get(
                lang, DEFAULT_TRANSLATION_CONTENT["en"]
            )

            # Inject default process steps if not provided
            if not t_data.get("process_steps"):
                t_data["process_steps"] = DEFAULT_PROCESS_STEPS.get(
                    lang, DEFAULT_PROCESS_STEPS["en"]
                )

            # Inject other defaults if empty
            for field, value in defaults.items():
                if not t_data.get(field):
                    t_data[field] = value

            db.add(StudyTranslation(study_id=db_study.id, **t_data))

        # 3. Add Statements and their translations
        for s_in in study.statements:
            stmt = Statement(study_id=db_study.id, code=s_in.code)
            db.add(stmt)
            await db.flush()  # get stmt ID
            for st_in in s_in.translations:
                db.add(
                    StatementTranslation(
                        statement_id=stmt.id,
                        language_code=st_in.language_code,
                        text=st_in.text,
                    )
                )

        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        logger.error(
            f"Integrity check failed during study creation: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Database integrity check failed: {str(e)}",
        )
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during study creation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while creating the study",
        )

    # Re-fetch with relationships for Response Serialization
    from app.services.study_service import StudyService

    updated_study = await StudyService.get_study_by_slug(db, db_study.slug)
    if updated_study is None:
        raise HTTPException(status_code=404, detail="Study not found after creation")
    return updated_study


@router.get("", response_model=list[StudyRead])
async def list_studies(
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Study]:
    """List studies in the active workspace."""
    workspace, _ = workspace_ctx

    # Simple filter by workspace. Isolation secured.
    query = (
        select(Study)
        .where(Study.workspace_id == workspace.id)
        .options(selectinload(Study.workspace))
        .order_by(Study.created_at.desc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{slug}", response_model=StudyRead)
async def get_study(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Get study details."""
    from app.models import Statement

    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(
            selectinload(Study.translations),
            selectinload(Study.statements).selectinload(Statement.translations),
            selectinload(Study.participants),
        )
    )
    res = await db.execute(stmt)
    study_loaded = res.scalar_one()
    return study_loaded


@router.patch("/{slug}", response_model=StudyRead)
async def update_study(
    study_update: StudyUpdate,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Update study configuration."""
    # Ensure relationships are loaded for logic below
    # We use a comprehensive selectinload query to avoid MissingGreenlet errors during synchronization
    from app.models import Statement, StudyTranslation

    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(
            selectinload(Study.translations),
            selectinload(Study.statements).selectinload(Statement.translations),
            selectinload(Study.participants),
        )
    )
    res = await db.execute(stmt)
    study = res.scalar_one_or_none()  # type: ignore[assignment]

    if study is None:
        raise HTTPException(status_code=404, detail="Study not found")

    # Pre-fetch all statement translations to ensure they are in identity map
    for s in study.statements:
        _ = s.translations

    # Relax structural checks in update_study if study is in DRAFT
    # The frontend will hit this endpoint for save.
    # We only block grid modification if there are ALREADY participants.
    if study_update.grid_config is not None:
        new_grid = [col.model_dump() for col in study_update.grid_config]
        current_grid = study.grid_config

        if new_grid != current_grid:
            stmt_part = select(func.count(Participant.id)).where(
                Participant.study_id == study.id, Participant.is_test_run.is_(False)
            )
            res_part = await db.execute(stmt_part)
            has_participants = (res_part.scalar() or 0) > 0

            if has_participants:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot modify grid configuration because participants have already started the study.",
                )

    # Block ALL updates if not in DRAFT state.
    # State transitions must happen via the dedicated /state endpoint.
    if study.state != StudyState.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update study in {study.state.value} state. Switch it back to draft first.",
        )

    # Optimistic Locking Check
    if study_update.last_updated_at and study.updated_at:
        # Compare timestamps. Note: DB timestamp might have higher precision.
        # We assume if DB is strictly newer, we have a conflict.
        # We subtract a small buffer (e.g. 1 second) might be unsafe, strict is better.
        if study.updated_at > study_update.last_updated_at:
            # RELAXATION: If study is in DRAFT, we allow overwrites to prevent 409 loops
            # during frequent auto-saves. Last write wins for drafts.
            if study.state == StudyState.draft:
                pass  # validation/concurrency is less strict in draft mode
            else:
                from app.services.study_service import StudyService

                # Fetch full fresh state to return to client
                fresh_study = await StudyService.get_study_by_slug(db, study.slug)
                if fresh_study:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "message": "Study has been modified by another user.",
                            "server_state": jsonable_encoder(
                                StudyRead.model_validate(fresh_study)
                            ),
                        },
                    )

    try:
        # 1. Update basic fields
        update_data = study_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field in ["translations", "statements", "grid_config"]:
                continue
            setattr(study, field, value)

        # 2. Update grid_config (DRAFT only)
        if study_update.grid_config is not None:
            study.grid_config = [col.model_dump() for col in study_update.grid_config]

        # 3. Update translations
        if study_update.translations is not None:
            from app.models import StudyTranslation

            # Replace all translations for simplicity or update existing?
            # For now, we'll implement a "sync" logic: update existing, add new, remove old.
            current_trans = {t.language_code: t for t in study.translations}
            new_trans_list = []
            for t_in in study_update.translations:
                if t_in.language_code in current_trans:
                    t_obj = current_trans[t_in.language_code]
                    for k, v in t_in.model_dump().items():
                        setattr(t_obj, k, v)
                    new_trans_list.append(t_obj)
                else:
                    new_trans_list.append(StudyTranslation(**t_in.model_dump()))
            study.translations = new_trans_list

        # 4. Update statements
        if study_update.statements is not None:
            from app.models import (
                Statement,
                StatementTranslation,
            )

            current_statements = {s.code: s for s in study.statements}
            updated_codes = {s.code for s in study_update.statements}

            # Determine if we can do destructive changes (remove statements)
            # Structural changes are allowed in DRAFT or if NO participants exist
            stmt_count = select(func.count(Participant.id)).where(
                Participant.study_id == study.id, Participant.is_test_run.is_(False)
            )
            res = await db.execute(stmt_count)
            has_participants = (cast(int, res.scalar()) or 0) > 0

            can_sync_structure = not has_participants

            if not can_sync_structure:
                current_codes = {s.code for s in study.statements}
                if updated_codes != current_codes:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot modify statement structure because participants have already started the study.",
                    )

            # A. Remove statements not in the update (only if allowed)
            if can_sync_structure:
                for code, s_obj in list(current_statements.items()):
                    if code not in updated_codes:
                        study.statements.remove(s_obj)
                        await db.delete(s_obj)
                        del current_statements[code]

            # B. Sync existing and add new
            for s_up in study_update.statements:
                if s_up.code in current_statements:
                    # Update existing
                    target_s = current_statements[s_up.code]
                    curr_s_trans = {t.language_code: t for t in target_s.translations}
                    new_s_trans_list = []
                    for st_in in s_up.translations:
                        if st_in.language_code in curr_s_trans:
                            st_obj = curr_s_trans[st_in.language_code]
                            st_obj.text = st_in.text
                            new_s_trans_list.append(st_obj)
                        else:
                            new_s_trans_list.append(
                                StatementTranslation(
                                    statement_id=target_s.id, **st_in.model_dump()
                                )
                            )
                    target_s.translations = new_s_trans_list
                elif can_sync_structure:
                    # Add new
                    new_s = Statement(study_id=study.id, code=s_up.code)
                    db.add(new_s)
                    # Link to study relationships so re-fetch/serialization see it
                    study.statements.append(new_s)

                    await db.flush()  # Get ID

                    # Create translations and relate them
                    for st_in in s_up.translations:
                        new_st = StatementTranslation(
                            statement_id=new_s.id,
                            language_code=st_in.language_code,
                            text=st_in.text,
                        )
                        db.add(new_st)

        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        logger.error(f"Integrity check failed during study update: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Database integrity check failed (possibly duplicate statement codes)",
        )
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during study update: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while updating the study",
        )
    from app.services.study_service import StudyService

    updated_study = await StudyService.get_study_by_slug(db, study.slug)
    if updated_study is None:
        raise HTTPException(status_code=404, detail="Study not found after update")
    return updated_study


@router.post("/{slug}/validate", response_model=list[str])
async def validate_study(
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> list[str]:
    """Check if study is ready for activation."""
    from app.services.study_service import StudyService

    # Ensure relations are loaded
    await db.refresh(study, attribute_names=["translations", "statements"])
    for s in study.statements:
        await db.refresh(s, attribute_names=["translations"])

    return StudyService.validate_for_activation(study)


@router.post("/{slug}/state", response_model=StudyRead)
async def change_study_state(
    new_state: StudyState,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Change study state (Draft <-> Active <-> Closed <-> Archived)."""
    # Rules for Activation
    if new_state == StudyState.active:
        from app.services.study_service import StudyService

        # Ensure relations are loaded for validation
        await db.refresh(study, attribute_names=["translations", "statements"])
        for s in study.statements:
            await db.refresh(s, attribute_names=["translations"])

        errors = StudyService.validate_for_activation(study)
        if errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Study is not ready for activation",
                    "errors": errors,
                },
            )

    try:
        study.state = new_state
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during study state change: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while changing study state",
        )
    # Re-fetch with relationships for Response Serialization
    from app.services.study_service import StudyService

    updated_study = await StudyService.get_study_by_slug(db, study.slug)
    if updated_study is None:
        raise HTTPException(
            status_code=404, detail="Study not found after state change"
        )
    return updated_study


@router.post("/{slug}/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_study_participants(
    study: Study = Depends(check_study_permission(StudyRole.owner)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all participants for the study (Owner only)."""
    from app.services.study_service import StudyService

    await StudyService.reset_study_participants(db, study.id)
    return None


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study(
    study: Study = Depends(check_study_permission(StudyRole.owner)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a study (Superuser only, and must be Archived)."""
    # 1. Check Superuser
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system administrators can delete studies.",
        )

    # 2. Check Archived
    if study.state != StudyState.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Study must be ARCHIVED before it can be deleted.",
        )
    await db.delete(study)
    await db.commit()
    return None


@router.get("/{slug}/stats", response_model=StudyStatsRead)
async def get_study_stats(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated study statistics."""
    from app.services.study_service import StudyService

    return await StudyService.get_study_stats(db, study.id)


@router.get("/participants/{participant_id}", response_model=ParticipantDetailRead)
async def get_participant(
    participant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed participant info including responses."""
    from app.models import Participant
    from app.services.storage_service import storage_service
    from datetime import datetime, timedelta, UTC

    stmt = (
        select(Participant)
        .join(Participant.study)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
        .where(
            Participant.id == participant_id,
            WorkspaceMember.user_id == current_user.id,
            # Role check: Owner/Researcher can view details. Viewers might be restricted?
            # Assuming Viewer can also view if they have study access.
            WorkspaceMember.role.in_([WorkspaceRole.owner, WorkspaceRole.researcher]),
        )
        .options(
            selectinload(Participant.qsort_entries),
            selectinload(Participant.audio_recordings),
        )
    )
    result = await db.execute(stmt)
    participant = result.scalar_one_or_none()

    if not participant:
        raise HTTPException(
            status_code=404, detail="Participant not found or access denied"
        )

    # Generate fresh presigned URLs for audio recordings (24h expiration)
    for audio_rec in participant.audio_recordings:
        try:
            url = storage_service.generate_presigned_url(
                audio_rec.s3_key, expiration=86400
            )
            # Set runtime attributes (not in model, only in schema)
            setattr(audio_rec, "presigned_url", url)
            setattr(
                audio_rec, "url_expires_at", datetime.now(UTC) + timedelta(hours=24)
            )
        except Exception as e:
            # Log error but don't fail the request
            logger.warning(
                "Failed to generate presigned URL for %s: %s", audio_rec.s3_key, e
            )

    return participant


@router.patch("/participants/{participant_id}/discard", response_model=ParticipantRead)
async def discard_participant(
    participant_id: int,
    discard_data: ParticipantDiscardUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Flag or unflag a participant for exclusion from stats/exports."""
    from app.models import Participant

    # Security: Ensure participant belongs to a study in a workspace user can access
    stmt = (
        select(Participant)
        .join(Participant.study)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
        .where(
            Participant.id == participant_id,
            WorkspaceMember.user_id == current_user.id,
            WorkspaceMember.role.in_([WorkspaceRole.owner, WorkspaceRole.researcher]),
        )
    )
    result = await db.execute(stmt)
    participant = result.scalar_one_or_none()

    if not participant:
        raise HTTPException(
            status_code=404, detail="Participant not found or access denied"
        )

    try:
        participant.is_discarded = discard_data.is_discarded
        participant.discard_reason = discard_data.discard_reason

        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Unexpected error during participant discard: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while updating participant status",
        )
    await db.refresh(participant)
    return participant


@router.get("/{slug}/participants", response_model=list[ParticipantRead])
async def list_study_participants(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
):
    """List all participants for a specific study."""
    from app.models import Participant

    stmt = (
        select(Participant)
        .where(Participant.study_id == study.id)
        .order_by(Participant.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


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
    from app.models import Statement

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
                for s in study.statements
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


@router.post("/validate-import", response_model=ValidationResult)
async def validate_study_import(
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
async def import_study_config(
    request: StudyImportRequest,
    current_user: User = Depends(get_current_user),
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
):
    """
    Import study configuration from exported JSON.
    Creates a new study in draft state.
    """
    workspace, member = workspace_ctx

    # Check permission
    if member.role not in [WorkspaceRole.owner, WorkspaceRole.researcher]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You need to be an Admin or Researcher in this Workspace to import a study.",
        )

    config = request.config
    version = config.get("version")
    if version != "1.0":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported configuration version: {version}. Expected: 1.0",
        )

    # Check slug uniqueness
    query = select(Study).where(Study.slug == request.new_slug)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Study with slug '{request.new_slug}' already exists",
        )

    study_data = config.get("study", {}).copy()

    # Create Study in DRAFT
    try:
        from app.models import StudyTranslation, Statement, StatementTranslation

        db_study = Study(
            slug=request.new_slug,
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
        for s_data in study_data.get("statements", []):
            stmt = Statement(study_id=db_study.id, code=s_data.get("code"))
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
        import secrets

        for link_data in study_data.get("recruitment_links", []):
            # Generate a new token
            token = secrets.token_urlsafe(16)

            # Ensure uniqueness (simple check)
            from app.models import RecruitmentLink

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


@router.delete("/{slug}/test-runs", status_code=status.HTTP_204_NO_CONTENT)
async def clear_test_runs(
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Delete all participants flagged as is_test_run for this study."""
    from sqlalchemy import delete
    from app.models import Participant

    await db.execute(
        delete(Participant).where(
            Participant.study_id == study.id, Participant.is_test_run.is_(True)
        )
    )
    await db.commit()
    return None


@router.delete("/{slug}/participants", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_participants(
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Delete ALL participants for this study. Only allowed in DRAFT state."""
    if study.state != StudyState.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete all participants unless study is in DRAFT state.",
        )
    from sqlalchemy import delete

    from app.models import Participant

    await db.execute(delete(Participant).where(Participant.study_id == study.id))
    await db.commit()
    return None


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
