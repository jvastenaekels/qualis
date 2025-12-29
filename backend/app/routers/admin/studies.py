"""Admin routes for study management."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import check_study_permission, get_current_user
from app.models import (
    Study,
    StudyCollaborator,
    StudyRole,
    StudyState,
    User,
)
from app.schemas import (
    StudyCollaboratorAdd,
    StudyCollaboratorRead,
    StudyCreate,
    StudyRead,
    StudyUpdate,
)

router = APIRouter()


@router.post("/", response_model=StudyRead, status_code=status.HTTP_201_CREATED)
async def create_study(
    study: StudyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Create a new study."""
    # Check if slug exists
    query = select(Study).where(Study.slug == study.slug)
    result = await db.execute(query)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Study with this slug already exists",
        )

    # Create Study
    db_study = Study(
        slug=study.slug,
        state=StudyState.draft,  # Always draft initially
        grid_config=[col.model_dump() for col in study.grid_config],
        presort_config=study.presort_config,
        postsort_config=study.postsort_config,
        default_language=study.default_language or "en",
        show_statement_codes=study.show_statement_codes,
        owner_id=current_user.id,
    )
    db.add(db_study)
    await db.flush()  # to get ID

    # Add owner as collaborator
    owner_collab = StudyCollaborator(
        study_id=db_study.id, user_id=current_user.id, role=StudyRole.owner
    )
    db.add(owner_collab)

    # TODO: Handle translations and statements creation here if included in StudyCreate
    from ...models import Statement, StatementTranslation, StudyTranslation

    for t_in in study.translations:
        db.add(StudyTranslation(study_id=db_study.id, **t_in.model_dump()))

    # 2. Add Statements and their translations
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
    from ...services.study_service import StudyService

    updated_study = await StudyService.get_study_by_slug(db, db_study.slug)
    if updated_study is None:
        raise HTTPException(status_code=404, detail="Study not found after creation")
    return updated_study


@router.get("/", response_model=list[StudyRead])
async def list_studies(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Study]:
    """List studies accessible to the current user."""
    # Join with collaborators to filter
    query = (
        select(Study)
        .join(StudyCollaborator)
        .where(StudyCollaborator.user_id == current_user.id)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{slug}", response_model=StudyRead)
async def get_study(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Get study details."""
    await db.refresh(
        study, attribute_names=["translations", "statements", "collaborators"]
    )
    return study


@router.patch("/{slug}", response_model=StudyRead)
async def update_study(
    study_update: StudyUpdate,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Update study configuration."""
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
        from ...models import StudyTranslation

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
        from ...models import StatementTranslation

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
                            StatementTranslation(**st_in.model_dump())
                        )
                target_s.translations = new_s_trans_list
            elif study.state == StudyState.draft:
                # In DRAFT, we could technically allow adding by code, but StudyUpdate is for partials.
                # Usually creation handles the bulk.
                pass

    await db.commit()
    # Re-fetch with relationships for Response Serialization
    from ...services.study_service import StudyService

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
    from ...services.study_service import StudyService

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
    """Delete a study (Owner only)."""
    await db.delete(study)
    await db.commit()
    return None


# --- Collaborator Management ---


@router.get("/{slug}/collaborators", response_model=list[StudyCollaboratorRead])
async def list_collaborators(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
):
    """List collaborators for a study."""
    query = (
        select(StudyCollaborator, User.email)
        .join(User, StudyCollaborator.user_id == User.id)
        .where(StudyCollaborator.study_id == study.id)
    )
    result = await db.execute(query)
    collaborators = []
    for collab, email in result.all():
        collab_read = StudyCollaboratorRead.model_validate(collab)
        collab_read.user_email = email
        collaborators.append(collab_read)
    return collaborators


@router.post("/{slug}/collaborators", response_model=StudyCollaboratorRead)
async def add_collaborator(
    collab_in: StudyCollaboratorAdd,
    study: Study = Depends(check_study_permission(StudyRole.owner)),
    db: AsyncSession = Depends(get_db),
):
    """Add or update a collaborator."""
    # 1. Find User
    user_query = select(User).where(User.email == collab_in.email)
    user_res = await db.execute(user_query)
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Check if already collaborator
    collab_query = select(StudyCollaborator).where(
        StudyCollaborator.study_id == study.id, StudyCollaborator.user_id == user.id
    )
    collab_res = await db.execute(collab_query)
    db_collab = collab_res.scalar_one_or_none()

    if db_collab:
        # Update role
        db_collab.role = collab_in.role
    else:
        # Create new
        db_collab = StudyCollaborator(
            study_id=study.id, user_id=user.id, role=collab_in.role
        )
        db.add(db_collab)

    await db.commit()
    await db.refresh(db_collab)

    res = StudyCollaboratorRead.model_validate(db_collab)
    res.user_email = user.email
    return res


@router.delete("/{slug}/collaborators/{email}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collaborator(
    email: str,
    study: Study = Depends(check_study_permission(StudyRole.owner)),
    db: AsyncSession = Depends(get_db),
):
    """Remove a collaborator."""
    # 1. Find User
    user_query = select(User).where(User.email == email)
    user_res = await db.execute(user_query)
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent removing oneself if owner?
    # Usually owner shouldn't be able to remove themselves via this endpoint to avoid orphan studies.
    if user.id == study.owner_id:
        raise HTTPException(status_code=400, detail="Cannot remove the study owner")

    await db.execute(
        delete(StudyCollaborator).where(
            StudyCollaborator.study_id == study.id, StudyCollaborator.user_id == user.id
        )
    )
    await db.commit()
    return None
