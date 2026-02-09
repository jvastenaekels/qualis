"""API router for study data exports."""

import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...database import get_db
from ...dependencies import check_study_permission
from ...models import (
    Participant,
    Statement,
    Study,
    StudyRole,
)
from ...services.export_service import ExportService

router = APIRouter(tags=["Admin Exports"])


@router.get("/{slug}/export/csv")
async def export_csv(
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Export study results as CSV."""
    slug = study.slug

    # Fetch participants with all relations needed for export
    query = (
        select(Participant)
        .where(Participant.study_id == study.id)
        .options(
            selectinload(Participant.qsort_entries),
            selectinload(Participant.audio_recordings),
        )
    )
    # Ensure study.statements are loaded
    # Re-fetch study with statements
    study_query = (
        select(Study)
        .where(Study.id == study.id)
        .options(selectinload(Study.statements))
    )
    study_res = await db.execute(study_query)
    study = study_res.scalar_one()

    participant_res = await db.execute(query)
    participants = list(participant_res.scalars().all())

    csv_content = ExportService.generate_csv(study, participants)

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={slug}_results.csv"},
    )


@router.get("/{slug}/export/pqmethod")
async def export_pqmethod(
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Export study results in PQMethod format (ZIP)."""
    slug = study.slug

    # Fetch relations
    study_query = (
        select(Study)
        .where(Study.id == study.id)
        .options(selectinload(Study.statements).selectinload(Statement.translations))
    )
    study_res = await db.execute(study_query)
    study = study_res.scalar_one()

    query = (
        select(Participant)
        .where(Participant.study_id == study.id)
        .options(
            selectinload(Participant.qsort_entries),
            selectinload(Participant.audio_recordings),
        )
    )
    participant_res = await db.execute(query)
    participants = list(participant_res.scalars().all())

    zip_bytes = ExportService.generate_pqmethod_zip(study, participants)

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={slug}_pqmethod.zip"},
    )


@router.get("/{slug}/export/r-kit")
async def export_r_kit(
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Export study results as R-Kit (ZIP with CSV + R Script)."""
    slug = study.slug

    # Fetch
    study_query = (
        select(Study)
        .where(Study.id == study.id)
        .options(selectinload(Study.statements).selectinload(Statement.translations))
    )
    study_res = await db.execute(study_query)
    study = study_res.scalar_one()

    query = (
        select(Participant)
        .where(Participant.study_id == study.id, Participant.is_discarded.is_(False))
        .options(
            selectinload(Participant.qsort_entries),
            selectinload(Participant.audio_recordings),
        )
    )
    participant_res = await db.execute(query)
    participants = list(participant_res.scalars().all())

    zip_bytes = ExportService.generate_r_kit(study, participants)

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={slug}_r_kit.zip"},
    )


@router.get("/{slug}/dump")
async def get_study_dump(
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Get complete study data and participant placements for client-side export generation."""
    from ...services.study_service import StudyService

    return await StudyService.get_study_full_dump(db, study.id)


@router.get("/{slug}/participants/{participant_id}/export/csv")
async def export_participant_csv(
    participant_id: int,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Export single participant results as CSV."""
    slug = study.slug

    # Fetch participant with qsort entries and audio recordings
    query = (
        select(Participant)
        .where(
            Participant.id == participant_id,
            Participant.study_id == study.id,
        )
        .options(
            selectinload(Participant.qsort_entries),
            selectinload(Participant.audio_recordings),
        )
    )
    participant_res = await db.execute(query)
    participant = participant_res.scalar_one_or_none()

    if not participant:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Participant not found")

    # Ensure study.statements are loaded
    study_query = (
        select(Study)
        .where(Study.id == study.id)
        .options(selectinload(Study.statements))
    )
    study_res = await db.execute(study_query)
    study = study_res.scalar_one()

    csv_content = ExportService.generate_csv(study, [participant])

    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={slug}_participant_{participant_id}.csv"
        },
    )


@router.get("/{slug}/participants/{participant_id}/export/json")
async def export_participant_json(
    participant_id: int,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Export single participant results as JSON."""
    from ...services.study_service import StudyService

    # Use the existing full dump logic but we'll filter it for the single participant
    # This ensures consistency with the data format researchers expect from the full dump.
    full_dump = await StudyService.get_study_full_dump(db, study.id)

    # Filter participants
    participant = next(
        (p for p in full_dump["participants"] if p["db_id"] == participant_id), None
    )

    if not participant:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Participant not found")

    return {
        "study": full_dump["study"],
        "participant": participant,
        "statement_id_to_index": full_dump["statement_id_to_index"],
    }


@router.get("/{slug}/export/package")
async def get_research_package(
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
):
    """Get complete research package (ZIP) including CSV, JSON, codebook, etc."""
    # Fetch study with all relations needed for ExportService
    # ExportService needs participants and statements
    # We'll reload the study with all options to ensure everything is in memory
    from sqlalchemy.orm import selectinload
    from ...models import Participant, Statement

    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(
            selectinload(Study.statements).selectinload(Statement.translations),
            selectinload(Study.participants).selectinload(Participant.qsort_entries),
            selectinload(Study.participants).selectinload(Participant.audio_recordings),
            selectinload(Study.translations),
        )
    )
    result = await db.execute(stmt)
    full_study = result.scalar_one()

    # Get the official JSON dump for inclusion in the package
    from ...services.study_service import StudyService

    full_dump = await StudyService.get_study_full_dump(db, study.id)

    zip_content = ExportService.generate_research_package(
        full_study, full_study.participants, full_dump=full_dump
    )

    return StreamingResponse(
        io.BytesIO(zip_content),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={study.slug}_research_package.zip"
        },
    )
