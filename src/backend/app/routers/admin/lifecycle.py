# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Admin endpoints for data-lifecycle visibility and bulk operations.

Surfaces a per-study data inventory (counts, sizes, oldest/newest
timestamps) plus a bulk anonymisation action for retention-policy
enforcement. Designed to support the GDPR data-minimisation principle
(Art. 5) without requiring a full retention-policy engine in v0.1.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import check_study_permission, get_current_user
from app.limiter import limiter
from app.models import (
    AudioRecording,
    Participant,
    ParticipantStatus,
    Study,
    StudyRole,
    User,
)
from app.utils.audit import log_admin_action
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Admin Lifecycle"])


class ParticipantBuckets(BaseModel):
    started: int
    completed: int
    discarded: int
    anonymised: int
    total: int


class AudioInventory(BaseModel):
    count: int
    total_bytes: int
    total_mb: float


class TimelineSnapshot(BaseModel):
    first_submission_at: datetime | None
    last_submission_at: datetime | None
    last_anonymisation_at: datetime | None
    completed_older_than_1y: int = Field(
        description="Completed participants whose submitted_at is more than 1 year ago"
    )
    completed_older_than_2y: int = Field(
        description="Completed participants whose submitted_at is more than 2 years ago"
    )


class DataInventory(BaseModel):
    """Per-study data inventory snapshot."""

    study_slug: str
    generated_at: datetime
    participants: ParticipantBuckets
    audio: AudioInventory
    timeline: TimelineSnapshot
    locales: dict[str, int] = Field(
        default_factory=dict,
        description="Participant count by language_used",
    )
    data_retention_months: int | None = Field(
        default=None,
        description=(
            "Study-level retention policy in months, used by the frontend "
            "to compute the default cutoff. NULL = use system default (12)."
        ),
    )


class BulkAnonymiseRequest(BaseModel):
    """Bulk anonymise completed participants whose submitted_at is older
    than the given cutoff."""

    submitted_before: datetime = Field(
        description="ISO timestamp; only completed participants with "
        "submitted_at strictly before this are anonymised."
    )


class BulkAnonymiseResult(BaseModel):
    candidates: int
    anonymised: int
    skipped_already_anonymous: int


class AnonymisePreviewResponse(BaseModel):
    """Exact count preview for a prospective bulk anonymisation.

    Cheap (one COUNT query). No mutation, no audit. Filters out
    already-anonymised participants so the count reflects what
    bulk_anonymise_old_participants would actually anonymise — not the
    larger raw `candidates` figure.
    """

    cutoff: datetime
    candidates: int = Field(
        description=(
            "Completed, not-yet-anonymised participants whose "
            "submitted_at is strictly before cutoff."
        )
    )


@router.get("/{slug}/data-inventory", response_model=DataInventory)
async def get_data_inventory(
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> DataInventory:
    """Read-only snapshot of the study's data footprint.

    Designed to be cheap (a handful of aggregated counts); refreshes on
    every page load. Refresh frequency is up to the operator.
    """
    # Participant counts split by status / discarded / anonymised
    counts_q = select(
        func.count(Participant.id).label("total"),
        func.count(Participant.id)
        .filter(Participant.status == ParticipantStatus.started)
        .label("started"),
        func.count(Participant.id)
        .filter(Participant.status == ParticipantStatus.completed)
        .label("completed"),
        func.count(Participant.id)
        .filter(Participant.is_discarded.is_(True))
        .label("discarded"),
        func.count(Participant.id)
        .filter(Participant.anonymised_at.isnot(None))
        .label("anonymised"),
    ).where(Participant.study_id == study.id)
    counts_row = (await db.execute(counts_q)).one()

    # Audio inventory
    audio_q = (
        select(
            func.count(AudioRecording.id),
            func.coalesce(func.sum(AudioRecording.file_size_bytes), 0),
        )
        .join(Participant)
        .where(Participant.study_id == study.id)
    )
    audio_count, audio_bytes = (await db.execute(audio_q)).one()

    # Timeline aggregates
    timeline_q = select(
        func.min(Participant.submitted_at).label("first_submission_at"),
        func.max(Participant.submitted_at).label("last_submission_at"),
        func.max(Participant.anonymised_at).label("last_anonymisation_at"),
    ).where(Participant.study_id == study.id)
    t_row = (await db.execute(timeline_q)).one()

    now = datetime.now(UTC)
    # timedelta (not now.replace(year=...)) so this read-only endpoint does not
    # crash on Feb 29, where replacing the year lands on a non-existent date
    # (audit E4). A ~1-day drift near leap years is immaterial for these
    # "older than ~1y / ~2y" retention counts.
    cutoff_1y = now - timedelta(days=365)
    cutoff_2y = now - timedelta(days=730)

    older_q = select(
        func.count(Participant.id)
        .filter(
            Participant.status == ParticipantStatus.completed,
            Participant.submitted_at < cutoff_1y,
            Participant.anonymised_at.is_(None),
        )
        .label("older_1y"),
        func.count(Participant.id)
        .filter(
            Participant.status == ParticipantStatus.completed,
            Participant.submitted_at < cutoff_2y,
            Participant.anonymised_at.is_(None),
        )
        .label("older_2y"),
    ).where(Participant.study_id == study.id)
    older_row = (await db.execute(older_q)).one()

    # Locale breakdown
    locales_q = (
        select(Participant.language_used, func.count(Participant.id))
        .where(Participant.study_id == study.id)
        .group_by(Participant.language_used)
    )
    locales_rows = (await db.execute(locales_q)).all()

    return DataInventory(
        study_slug=study.slug,
        generated_at=now,
        participants=ParticipantBuckets(
            started=counts_row.started or 0,
            completed=counts_row.completed or 0,
            discarded=counts_row.discarded or 0,
            anonymised=counts_row.anonymised or 0,
            total=counts_row.total or 0,
        ),
        audio=AudioInventory(
            count=audio_count or 0,
            total_bytes=int(audio_bytes or 0),
            total_mb=round((audio_bytes or 0) / (1024 * 1024), 2),
        ),
        timeline=TimelineSnapshot(
            first_submission_at=t_row.first_submission_at,
            last_submission_at=t_row.last_submission_at,
            last_anonymisation_at=t_row.last_anonymisation_at,
            completed_older_than_1y=older_row.older_1y or 0,
            completed_older_than_2y=older_row.older_2y or 0,
        ),
        locales={lang: int(c) for lang, c in locales_rows if lang},
        data_retention_months=study.data_retention_months,
    )


@router.get(
    "/{slug}/anonymise-preview",
    response_model=AnonymisePreviewResponse,
)
async def preview_anonymise_candidates(
    cutoff: datetime,
    study: Study = Depends(check_study_permission(StudyRole.viewer)),
    db: AsyncSession = Depends(get_db),
) -> AnonymisePreviewResponse:
    """Return the exact number of participants that bulk anonymisation
    would touch for the given cutoff.

    Use case: replace the year-bucketed UI estimate with a precise
    figure as the user adjusts the cutoff date. Filters out
    already-anonymised rows so the preview matches what the bulk
    endpoint would actually anonymise (not the larger
    BulkAnonymiseResult.candidates which counts skipped ones too).
    """
    count_q = select(func.count(Participant.id)).where(
        Participant.study_id == study.id,
        Participant.status == ParticipantStatus.completed,
        Participant.submitted_at < cutoff,
        Participant.anonymised_at.is_(None),
    )
    count = (await db.execute(count_q)).scalar() or 0
    return AnonymisePreviewResponse(cutoff=cutoff, candidates=int(count))


@router.post(
    "/{slug}/anonymise-bulk",
    response_model=BulkAnonymiseResult,
)
@limiter.limit("5/minute")
async def bulk_anonymise_old_participants(
    request: Request,
    body: BulkAnonymiseRequest,
    study: Study = Depends(check_study_permission(StudyRole.editor)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BulkAnonymiseResult:
    """Anonymise completed participants whose submitted_at is older
    than `submitted_before`.

    Use case: end-of-project retention enforcement. Researcher sets a
    cutoff (e.g., 18 months post-publication) and the platform removes
    PII from older participants while preserving their Q-sort rankings
    as anonymous research data.

    Already-anonymised participants are skipped (counted separately
    in the response).

    Audit-trail logged with the cutoff and the count.
    """
    from app.services.study_data_service import StudyDataService

    candidates_q = (
        select(Participant)
        .options(selectinload(Participant.audio_recordings))
        .where(
            Participant.study_id == study.id,
            Participant.status == ParticipantStatus.completed,
            Participant.submitted_at < body.submitted_before,
        )
    )
    candidates = (await db.execute(candidates_q)).scalars().all()

    skipped = 0
    anonymised = 0
    for p in candidates:
        if p.anonymised_at is not None:
            skipped += 1
            continue
        participant_id = p.id
        await StudyDataService.anonymise_participant(db, p)
        anonymised += 1
        # Per-row audit: anonymise_participant commits each row independently, so
        # a mid-loop failure must not lose the trail of erasures already done.
        # Mirrors the admin-mediated erase_personal_data path (F-05-008; audit E2).
        log_admin_action(
            actor_user_id=current_user.id,
            action="erase_personal_data",
            resource="participant",
            resource_id=participant_id,
            study_slug=study.slug,
            mode="bulk_anonymise",
        )

    log_admin_action(
        actor_user_id=current_user.id,
        action="bulk_anonymise",
        resource="study",
        resource_id=study.id,
        slug=study.slug,
        cutoff=body.submitted_before.isoformat(),
        candidates=len(candidates),
        anonymised=anonymised,
        skipped_already_anonymous=skipped,
    )

    return BulkAnonymiseResult(
        candidates=len(candidates),
        anonymised=anonymised,
        skipped_already_anonymous=skipped,
    )
