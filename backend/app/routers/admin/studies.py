"""Admin routes for study management."""

from typing import cast
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    check_study_permission,
    get_current_user,
    get_current_workspace,
)
from app.models import (
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

router = APIRouter()


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
        WorkspaceRole.admin,
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

    # 3. Create Study
    db_study = Study(
        slug=study.slug,
        workspace_id=workspace.id,
        state=StudyState.draft,  # Always draft initially
        grid_config=[col.model_dump() for col in study.grid_config],
        presort_config=study.presort_config,
        postsort_config=study.postsort_config,
        default_language=study.default_language or "en",
        show_statement_codes=study.show_statement_codes,
        branding=study.branding.model_dump() if study.branding else None,
        start_date=study.start_date,
        end_date=study.end_date,
    )
    db.add(db_study)
    await db.flush()  # to get ID

    # 4. Add creator as Study Owner -> No longer needed, Workspace roles apply
    # Check if we should enforce that creator is at least Admin/Owner?
    # Already checked in permission block above.

    from app.models import Statement, StatementTranslation, StudyTranslation
    from app.services.study_service import DEFAULT_PROCESS_STEPS

    for t_in in study.translations:
        t_data = t_in.model_dump()
        # Inject default process steps if not provided
        if not t_data.get("process_steps"):
            t_data["process_steps"] = DEFAULT_PROCESS_STEPS.get(
                t_data.get("language_code", "en"), DEFAULT_PROCESS_STEPS["en"]
            )
        db.add(StudyTranslation(study_id=db_study.id, **t_data))

    # 4. Add Statements and their translations
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
    # Re-fetch with relationships for Response Serialization
    from app.services.study_service import StudyService

    updated_study = await StudyService.get_study_by_slug(db, db_study.slug)
    if updated_study is None:
        raise HTTPException(status_code=404, detail="Study not found after creation")
    return updated_study


@router.get("", response_model=list[StudyRead])
async def list_studies(
    workspace_ctx: tuple[Workspace, WorkspaceMember] = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[Study]:
    """List studies in the active workspace."""
    workspace, _ = workspace_ctx

    # Simple filter by workspace. Isolation secured.
    query = (
        select(Study)
        .where(Study.workspace_id == workspace.id)
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
    await db.refresh(study, attribute_names=["translations", "statements"])
    return study


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
    # The frontend will hit this endpoint for auto-save.
    # We only block grid modification if there are ALREADY participants.
    if study_update.grid_config is not None:
        new_grid = [col.model_dump() for col in study_update.grid_config]
        current_grid = study.grid_config

        if new_grid != current_grid:
            stmt_part = select(func.count(Participant.id)).where(
                Participant.study_id == study.id
            )
            res_part = await db.execute(stmt_part)
            has_participants = (res_part.scalar() or 0) > 0

            if has_participants and study.state != StudyState.draft:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot modify grid structure if study is active and has participants.",
                )

    # Block updates if archived
    if study.state == StudyState.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update an archived study.",
        )

    if study.state == StudyState.closed:
        # We might allow updating purely metadata or config that doesn't affect data validity.
        # But for now, keeping strict.
        # Exception: We might want to allow archiving (which is a state change, handled in separate endpoint).
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update a closed study.",
        )

    # Optimistic Locking Check
    if study_update.last_updated_at and study.updated_at:
        # Compare timestamps. Note: DB timestamp might have higher precision.
        # We assume if DB is strictly newer, we have a conflict.
        # We subtract a small buffer (e.g. 1 second) might be unsafe, strict is better.
        if study.updated_at > study_update.last_updated_at:
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
            Participant.study_id == study.id
        )
        res = await db.execute(stmt_count)
        has_participants = (cast(int, res.scalar()) or 0) > 0

        can_sync_structure = study.state == StudyState.draft or not has_participants

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

    study.state = new_state
    await db.commit()
    # Re-fetch with relationships for Response Serialization
    from app.services.study_service import StudyService

    updated_study = await StudyService.get_study_by_slug(db, study.slug)
    if updated_study is None:
        raise HTTPException(
            status_code=404, detail="Study not found after state change"
        )
    return updated_study


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

    stmt = (
        select(Participant)
        .join(Participant.study)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
        .where(
            Participant.id == participant_id,
            WorkspaceMember.user_id == current_user.id,
            # Role check: Owner/Admin/Researcher can view details. Viewers might be restricted?
            # Assuming Viewer can also view if they have study access.
            WorkspaceMember.role.in_(
                [WorkspaceRole.owner, WorkspaceRole.admin, WorkspaceRole.researcher]
            ),
        )
        .options(selectinload(Participant.qsort_entries))
    )
    result = await db.execute(stmt)
    participant = result.scalar_one_or_none()

    if not participant:
        raise HTTPException(
            status_code=404, detail="Participant not found or access denied"
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
            WorkspaceMember.role.in_(
                [WorkspaceRole.owner, WorkspaceRole.admin, WorkspaceRole.researcher]
            ),
        )
    )
    result = await db.execute(stmt)
    participant = result.scalar_one_or_none()

    if not participant:
        raise HTTPException(
            status_code=404, detail="Participant not found or access denied"
        )

    participant.is_discarded = discard_data.is_discarded
    participant.discard_reason = discard_data.discard_reason

    await db.commit()
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
