"""Admin routes for study management."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import check_study_permission, get_current_user
from app.models import (
    Study,
    StudyCollaborator,
    StudyRole,
    StudyState,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
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


@router.post("/", response_model=StudyRead, status_code=status.HTTP_201_CREATED)
async def create_study(
    study: StudyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Create a new study in the user's active workspace."""
    # 1. Check slug uniqueness
    query = select(Study).where(Study.slug == study.slug)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Study with this slug already exists",
        )

    # 2. Find a valid workspace for the user (Admin or Researcher)
    # In a real app, workspace_id might be passed in headers or body.
    # Here we pick the first workspace where user has create permissions.
    ws_query = (
        select(Workspace)
        .join(WorkspaceMember)
        .where(WorkspaceMember.user_id == current_user.id)
        .where(
            WorkspaceMember.role.in_([WorkspaceRole.admin, WorkspaceRole.researcher])
        )
        .limit(1)
    )
    ws_res = await db.execute(ws_query)
    workspace = ws_res.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You need to be an Admin or Researcher in a Workspace to create a study.",
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
    )
    db.add(db_study)
    await db.flush()  # to get ID

    # 4. Add creator as Study Owner
    db.add(
        StudyCollaborator(
            study_id=db_study.id, user_id=current_user.id, role=StudyRole.owner
        )
    )

    from app.models import Statement, StatementTranslation, StudyTranslation

    for t_in in study.translations:
        db.add(StudyTranslation(study_id=db_study.id, **t_in.model_dump()))

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


@router.get("/", response_model=list[StudyRead])
async def list_studies(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Study]:
    """List studies accessible to the current user (via Workspace membership)."""
    query = (
        select(Study)
        .outerjoin(StudyCollaborator, StudyCollaborator.study_id == Study.id)
        .outerjoin(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
        .where(
            (StudyCollaborator.user_id == current_user.id)
            | (
                (WorkspaceMember.user_id == current_user.id)
                & (WorkspaceMember.role == WorkspaceRole.admin)
            )
        )
        .distinct()
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
    await db.refresh(study, attribute_names=["translations", "statements"])

    # Structural changes only allowed in DRAFT
    is_structural_edit = any(
        f in study_update.model_dump(exclude_unset=True) for f in ["grid_config"]
    )

    if is_structural_edit and study.state != StudyState.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify grid structure of an active, paused, or closed study.",
        )

    if study.state == StudyState.closed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update a closed study.",
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
        from app.models import StatementTranslation

        # We only allow updating translations for existing statements by code
        # No adding/removing statements here if not in DRAFT (but let's keep it safe for all)
        current_statements = {s.code: s for s in study.statements}
        for s_up in study_update.statements:
            if s_up.code in current_statements:
                target_s = current_statements[s_up.code]
                # Update translations for this statement
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
            elif study.state == StudyState.draft:
                # In DRAFT, we could technically allow adding by code, but StudyUpdate is for partials.
                # Usually creation handles the bulk.
                pass

    await db.commit()
    # Re-fetch with relationships for Response Serialization
    from app.services.study_service import StudyService

    updated_study = await StudyService.get_study_by_slug(db, study.slug)
    if updated_study is None:
        raise HTTPException(status_code=404, detail="Study not found after update")
    return updated_study


@router.post("/{slug}/state", response_model=StudyRead)
async def change_study_state(
    new_state: StudyState,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Change study state (Draft <-> Active <-> Closed)."""
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
    db: AsyncSession = Depends(get_db),
):
    """Delete a study (Workspace Admin only)."""
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
        .outerjoin(StudyCollaborator, StudyCollaborator.study_id == Study.id)
        .outerjoin(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
        .where(
            Participant.id == participant_id,
            (
                (StudyCollaborator.user_id == current_user.id)
                & (StudyCollaborator.role.in_([StudyRole.owner, StudyRole.editor]))
            )
            | (
                (WorkspaceMember.user_id == current_user.id)
                & (WorkspaceMember.role == WorkspaceRole.admin)
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
        .outerjoin(StudyCollaborator, StudyCollaborator.study_id == Study.id)
        .outerjoin(WorkspaceMember, WorkspaceMember.workspace_id == Study.workspace_id)
        .where(
            Participant.id == participant_id,
            (
                (StudyCollaborator.user_id == current_user.id)
                & (StudyCollaborator.role.in_([StudyRole.owner, StudyRole.editor]))
            )
            | (
                (WorkspaceMember.user_id == current_user.id)
                & (WorkspaceMember.role == WorkspaceRole.admin)
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
