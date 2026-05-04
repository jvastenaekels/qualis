"""API router for study data exports."""

import io
import json
import logging
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...database import get_db
from ...limiter import limiter
from ...dependencies import check_study_permission
from ...models import (
    AudioRecording,
    Participant,
    ParticipantStatus,
    Statement,
    Study,
    StudyRole,
)
from ...schemas.responses import ParticipantExportResponse, StudyDumpResponse
from ...services.export_service import ExportService
from ...services.storage_service import get_storage_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin Exports"])


@router.get("/{slug}/export/csv")
@limiter.limit("10/minute")
async def export_csv(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Export study results as CSV."""
    slug = study.slug

    # Fetch participants with all relations needed for export
    query = (
        select(Participant)
        .where(Participant.study_id == study.id, Participant.is_discarded.is_(False))
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
@limiter.limit("10/minute")
async def export_pqmethod(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
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
        .where(
            Participant.study_id == study.id,
            Participant.is_discarded.is_(False),
            Participant.status == ParticipantStatus.completed,
        )
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
@limiter.limit("10/minute")
async def export_r_kit(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
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
        .where(
            Participant.study_id == study.id,
            Participant.is_discarded.is_(False),
            Participant.status == ParticipantStatus.completed,
        )
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


@router.get("/{slug}/dump", response_model=StudyDumpResponse)
@limiter.limit("10/minute")
async def get_study_dump(
    request: Request,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> StudyDumpResponse:
    """Get complete study data and participant placements for client-side export generation."""
    from ...services.study_service import StudyService

    dump = await StudyService.get_study_full_dump(db, study.id)
    return StudyDumpResponse.model_validate(dump)


@router.get("/{slug}/participants/{participant_id}/export/csv")
@limiter.limit("10/minute")
async def export_participant_csv(
    request: Request,
    participant_id: int,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Export single participant results as CSV.

    Per-participant exports are an individual-lookup channel used for
    follow-up / support contexts. After GDPR Art. 17 anonymisation
    (``Participant.anonymised_at IS NOT NULL``) the row no longer
    represents an identifiable participant — the bulk CSV / R-Kit /
    PQMethod exports preserve the anonymous Q-sort entries as research
    data (with PII zeroed), but the per-participant endpoints 404 to
    avoid presenting an anonymised row as a follow-up target.
    See F-05-006.
    """
    slug = study.slug

    # Fetch participant with qsort entries and audio recordings.
    # F-05-006: anonymised participants are excluded from per-participant
    # exports (defence in depth for follow-up consumers).
    query = (
        select(Participant)
        .where(
            Participant.id == participant_id,
            Participant.study_id == study.id,
            Participant.anonymised_at.is_(None),
        )
        .options(
            selectinload(Participant.qsort_entries),
            selectinload(Participant.audio_recordings),
        )
    )
    participant_res = await db.execute(query)
    participant = participant_res.scalar_one_or_none()

    if not participant:
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


@router.get(
    "/{slug}/participants/{participant_id}/export/json",
    response_model=ParticipantExportResponse,
)
@limiter.limit("10/minute")
async def export_participant_json(
    request: Request,
    participant_id: int,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> ParticipantExportResponse:
    """Export single participant results as JSON.

    F-05-006: anonymised participants (``anonymised_at IS NOT NULL``)
    are excluded from per-participant follow-up exports. The bulk
    ``/dump`` endpoint still surfaces them as anonymous research
    entries with PII zeroed.
    """
    from ...services.study_service import StudyService

    # Confirm the participant exists, belongs to this study, and is not
    # anonymised — same scope rule as the per-participant CSV endpoint.
    scope_res = await db.execute(
        select(Participant.id).where(
            Participant.id == participant_id,
            Participant.study_id == study.id,
            Participant.anonymised_at.is_(None),
        )
    )
    if scope_res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Use the existing full dump logic but we'll filter it for the single participant
    # This ensures consistency with the data format researchers expect from the full dump.
    full_dump = await StudyService.get_study_full_dump(db, study.id)

    # Filter participants
    participant = next(
        (p for p in full_dump["participants"] if p["db_id"] == participant_id), None
    )

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    return ParticipantExportResponse.model_validate(
        {
            "study": full_dump["study"],
            "participant": participant,
            "statement_id_to_index": full_dump["statement_id_to_index"],
        }
    )


@router.get("/{slug}/participants/{participant_id}/export/audio")
@limiter.limit("10/minute")
async def export_participant_audio(
    request: Request,
    participant_id: int,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Export all audio recordings for a participant as a ZIP with metadata.

    F-05-006: anonymised participants are excluded. (Anonymisation
    deletes their audio rows + S3 objects already, so the post-filter
    behaviour is the same — but the explicit filter keeps the API
    contract uniform with the CSV/JSON endpoints.)
    """
    # Fetch participant with audio recordings
    query = (
        select(Participant)
        .where(
            Participant.id == participant_id,
            Participant.study_id == study.id,
            Participant.anonymised_at.is_(None),
        )
        .options(selectinload(Participant.audio_recordings))
    )
    participant_res = await db.execute(query)
    participant = participant_res.scalar_one_or_none()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    recordings: list[AudioRecording] = list(participant.audio_recordings)
    if not recordings:
        raise HTTPException(
            status_code=404, detail="No audio recordings for this participant"
        )

    storage = get_storage_service()

    # Build ZIP in memory
    zip_buffer = io.BytesIO()
    metadata_entries = []

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for recording in recordings:
            ext = _mime_to_extension(recording.mime_type)
            filename = f"{recording.question_key}{ext}"

            try:
                audio_bytes = await storage.download_object(recording.s3_key)
                zf.writestr(filename, audio_bytes)
            except HTTPException:
                logger.warning(
                    "Skipping missing S3 object %s for participant %d",
                    recording.s3_key,
                    participant_id,
                )
                continue

            metadata_entries.append(
                {
                    "question_key": recording.question_key,
                    "filename": filename,
                    "duration_seconds": recording.duration_seconds,
                    "file_size_bytes": recording.file_size_bytes,
                    "mime_type": recording.mime_type,
                    "created_at": recording.created_at.isoformat()
                    if recording.created_at
                    else None,
                }
            )

        zf.writestr("metadata.json", json.dumps(metadata_entries, indent=2))

    zip_buffer.seek(0)
    slug = study.slug

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={slug}_participant_{participant_id}_audio.zip"
        },
    )


def _mime_to_extension(mime_type: str) -> str:
    """Map MIME type to file extension."""
    mapping = {
        "audio/webm": ".webm",
        "video/webm": ".webm",
        "audio/mp4": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/ogg": ".ogg",
    }
    return mapping.get(mime_type, ".webm")


@router.get("/{slug}/export/package")
@limiter.limit("10/minute")
async def get_research_package(
    request: Request,
    include_discussion: bool = False,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
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

    # Fetch memo and render markdown for inclusion in the package
    from ...models import MemoParentType, User
    from ...services.memo_service import MemoService

    memo = await MemoService.get_memo(
        db, parent_type=MemoParentType.study, parent_id=study.id
    )

    user_ids = {e.last_edited_by for e in memo.entries if e.last_edited_by is not None}
    # Also collect comment authors when discussion is requested
    if include_discussion:
        for e in memo.entries:
            for c in e.comments:
                if c.user_id is not None:
                    user_ids.add(c.user_id)

    user_emails: dict[int, str] = {}
    if user_ids:
        rows = (
            await db.execute(select(User.id, User.email).where(User.id.in_(user_ids)))
        ).all()
        user_emails = {row.id: row.email for row in rows}

    memo_md = ExportService.render_memo_md(memo, user_emails)
    memo_discussion_md = (
        ExportService.render_memo_discussion_md(memo, user_emails)
        if include_discussion
        else ""
    )

    zip_content = ExportService.generate_research_package(
        full_study,
        full_study.participants,
        full_dump=full_dump,
        memo_md=memo_md if memo_md else None,
        memo_discussion_md=memo_discussion_md if memo_discussion_md else None,
    )

    return StreamingResponse(
        io.BytesIO(zip_content),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={study.slug}_research_package.zip"
        },
    )
