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
        .options(selectinload(Participant.qsort_entries))
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
        .options(selectinload(Participant.qsort_entries))
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
        .options(selectinload(Participant.qsort_entries))
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
