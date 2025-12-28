"""Admin routes for study management."""

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Study, StudyCollaborator, StudyRole, StudyState, User
from app.schemas import StudyCreate, StudyRead, StudyUpdate

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

    # TODO: Handle translations and statements creation here

    await db.commit()
    await db.refresh(db_study)
    return db_study


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
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Get study details."""
    query = (
        select(Study)
        .join(StudyCollaborator)
        .where(Study.slug == slug)
        .where(StudyCollaborator.user_id == current_user.id)
    )
    result = await db.execute(query)
    study = result.scalar_one_or_none()

    if not study:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found or access denied",
        )
    await db.refresh(
        study, attribute_names=["translations", "statements", "collaborators"]
    )
    return cast(Study, study)


@router.patch("/{slug}", response_model=StudyRead)
async def update_study(
    slug: str,
    study_update: StudyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Update study configuration."""
    # Check permission (Editor or Owner)
    # We need to fetch the collaborator record to check role AND the study to check state.
    query = (
        select(Study, StudyCollaborator)
        .join(StudyCollaborator)
        .where(Study.slug == slug)
        .where(StudyCollaborator.user_id == current_user.id)
    )
    result = await db.execute(query)
    row = result.one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found or access denied",
        )

    db_study, collaborator = row

    if collaborator.role == StudyRole.viewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    # Structural changes only allowed in DRAFT
    if db_study.state != StudyState.draft:
        # Check if we are trying to change structural fields
        # For now, let's just block all updates if not draft, or define safe updates.
        # Prompt said: "Active: configuration locked".
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify configuration of an active or closed study.",
        )

    update_data = study_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "grid_config" and value is not None:
            setattr(db_study, field, [col.model_dump() for col in value])
        else:
            setattr(db_study, field, value)

    await db.commit()
    await db.refresh(db_study)
    return cast(Study, db_study)


@router.post("/{slug}/state", response_model=StudyRead)
async def change_study_state(
    slug: str,
    new_state: StudyState,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Study:
    """Change study state (Draft <-> Active <-> Closed)."""
    # Check permission (Owner only? or Editor?)
    query = (
        select(Study, StudyCollaborator)
        .join(StudyCollaborator)
        .where(Study.slug == slug)
        .where(StudyCollaborator.user_id == current_user.id)
    )
    result = await db.execute(query)
    row = result.one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found or access denied",
        )

    db_study, collaborator = row

    # Only owner can publish/close? Or editors too?
    # Let's say Owner and Editor can manage state for now, or maybe just Owner for publishing.
    # Plan said: "Owner: Full access... Editor: Can modify config".
    # Usually State change is significant. Let's restrict to Owner for now to be safe, or allow Editor.
    # Let's allow Editor for now to facilitate workflow.
    if collaborator.role == StudyRole.viewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    db_study.state = new_state
    await db.commit()
    await db.refresh(db_study)
    return cast(Study, db_study)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a study (Owner only)."""
    # Fetch study with access check
    query = (
        select(Study, StudyCollaborator)
        .join(StudyCollaborator)
        .where(Study.slug == slug)
        .where(StudyCollaborator.user_id == current_user.id)
    )
    result = await db.execute(query)
    row = result.one_or_none()

    if not row:
        # To avoid leaking existence, maybe 404?
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found or access denied",
        )

    db_study, collaborator = row

    # Only Owner can delete
    if collaborator.role != StudyRole.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can delete a study",
        )

    await db.delete(db_study)
    await db.commit()
    return None
