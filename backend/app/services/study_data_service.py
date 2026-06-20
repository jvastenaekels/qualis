"""Service for study data export, statistics, and participant management."""

import logging
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..exceptions import NotFoundError
from ..models import (
    AudioRecording,
    Participant,
    ParticipantStatus,
    Statement,
    Study,
)
from ..types.wire import (
    AudioRecordingEntry,
    DeviceBreakdown,
    ParticipantDumpRecord,
    SortDataDump,
    SortDataStudy,
    SortParticipantRecord,
    StatementDumpRecord,
    StatementTranslation,
    StudyDump,
    StudyDumpStudy,
    StudyStats,
    StudyTranslationEntry,
)

logger = logging.getLogger(__name__)


class StudyDataService:
    """Handles study data export, statistics, and bulk participant operations."""

    @staticmethod
    async def delete_audio_files_for_study(
        db: AsyncSession,
        study_id: int,
    ) -> None:
        """Delete S3 audio files for participants of a study.

        Must be called BEFORE deleting participants (DB cascade would
        remove AudioRecording rows, orphaning S3 objects).
        """
        from ..services.storage_service import storage_service

        query = (
            select(AudioRecording.s3_key)
            .join(Participant)
            .where(Participant.study_id == study_id)
        )

        result = await db.execute(query)
        s3_keys = result.scalars().all()

        for key in s3_keys:
            await storage_service.delete_audio(key)

    @staticmethod
    async def reset_study_participants(db: AsyncSession, study_id: int) -> None:
        """Delete all participants for a specific study."""
        await StudyDataService.delete_audio_files_for_study(db, study_id)
        stmt = delete(Participant).where(Participant.study_id == study_id)
        await db.execute(stmt)
        await db.commit()

    @staticmethod
    async def anonymise_participant(
        db: AsyncSession,
        participant: Participant,
    ) -> Participant:
        """Apply GDPR Art. 17 erasure to a single participant.

        Strategy: anonymise (preserve scientifically-anonymous Q-sort
        rankings) rather than hard-delete. The Q-sort entries themselves
        are not personal data — they are statement rank scores. Removing
        all linkable PII while keeping the rankings honours the
        researcher's investment in collecting the data and the
        participant's prior consent to contribute to the study, while
        fully satisfying the right to erasure of identifiable personal
        data.

        Concretely:
        - PII columns nulled: ip_address, user_agent, confirmation_code,
          resume_code, consent_hash, draft_responses
        - Free-text answers cleared: presort_answers, postsort_answers
          (these can contain participant-supplied free text including PII)
        - All audio recordings (biometric data) deleted from S3 and DB
        - session_token rotated to a new UUID (the original token can
          never re-access this participant's data)
        - anonymised_at timestamp set so the row is identifiable as
          erasured for audit purposes
        - Q-sort entries are preserved (anonymous research data)

        Idempotent: re-anonymising an already-anonymised participant is
        a no-op (anonymised_at is not overwritten).
        """
        from ..services.storage_service import storage_service

        if participant.anonymised_at is not None:
            logger.info(
                "anonymise_participant: participant_id=%s already anonymised at %s, "
                "treating as no-op",
                participant.id,
                participant.anonymised_at,
            )
            return participant

        # Load audio recordings to get S3 keys before they're cascade-deleted.
        await db.refresh(participant, attribute_names=["audio_recordings"])
        s3_keys = [rec.s3_key for rec in participant.audio_recordings]

        # Delete S3 objects first (DB cascade will then drop AudioRecording rows).
        for key in s3_keys:
            try:
                await storage_service.delete_audio(key)
            except Exception as exc:
                # Continue: an S3-side failure must not block legal erasure.
                # Operators can clean orphaned S3 objects via a periodic sweep.
                logger.warning(
                    "anonymise_participant: failed to delete S3 key %s "
                    "(continuing with DB anonymisation): %s",
                    key,
                    exc,
                )
        # Drop the AudioRecording rows explicitly (in case S3 deletes failed
        # we still want the DB rows gone — they reference biometric data).
        await db.execute(
            delete(AudioRecording).where(
                AudioRecording.participant_id == participant.id
            )
        )

        # Null PII + rotate token + stamp.
        participant.ip_address = None
        participant.user_agent = None
        participant.confirmation_code = None
        participant.resume_code = None
        participant.consent_hash = None
        participant.draft_responses = None
        participant.presort_answers = {}
        participant.postsort_answers = {}
        participant.session_token = uuid4()
        participant.anonymised_at = datetime.now(UTC)

        await db.commit()
        await db.refresh(participant)
        logger.info(
            "anonymise_participant: participant_id=%s anonymised "
            "(study_id=%s, %d audio recordings removed)",
            participant.id,
            participant.study_id,
            len(s3_keys),
        )
        return participant

    @staticmethod
    async def get_study_stats(db: AsyncSession, study_id: int) -> StudyStats:
        """Calculates aggregated statistics for a study."""
        # 1. Get all participants for this study (excluding discarded)
        stmt = select(Participant).where(
            Participant.study_id == study_id,
            Participant.is_discarded.is_(False),
        )
        result = await db.execute(stmt)
        participants = result.scalars().all()

        started_count = len(participants)
        completed_participants = [
            p for p in participants if p.status == ParticipantStatus.completed
        ]
        completed_count = len(completed_participants)

        # 2. Completion Rate
        completion_rate = completed_count / started_count if started_count > 0 else 0.0

        # 3. Median Duration (Seconds)
        durations = []
        for p in completed_participants:
            if p.submitted_at and p.consented_at:
                duration = (p.submitted_at - p.consented_at).total_seconds()
                if duration > 0:
                    durations.append(duration)

        median_duration = None
        if durations:
            import statistics

            median_duration = statistics.median(durations)

        # 4. Device Breakdown (Simple Heuristic)
        device_breakdown: DeviceBreakdown = {"mobile": 0, "desktop": 0}
        for p in participants:
            ua = (p.user_agent or "").lower()
            if any(x in ua for x in ["mobile", "android", "iphone", "ipad"]):
                device_breakdown["mobile"] += 1
            else:
                device_breakdown["desktop"] += 1

        return StudyStats(
            started_count=started_count,
            completed_count=completed_count,
            completion_rate=completion_rate,
            median_duration_seconds=median_duration,
            device_breakdown=device_breakdown,
        )

    @staticmethod
    async def get_study_full_dump(db: AsyncSession, study_id: int) -> StudyDump:
        """Extracts complete study data and all participant sorts for export.

        Returns every participant regardless of ``is_discarded`` status; the
        callers (``/dump``, per-participant export, research package) apply
        their own discard/anonymisation filtering as appropriate for each
        export type.
        """
        # 1. Get Study with statements (ordered by ID for consistency)
        stmt = (
            select(Study)
            .where(Study.id == study_id)
            .options(
                selectinload(Study.statements).selectinload(Statement.translations),
                selectinload(Study.translations),
            )
        )
        result = await db.execute(stmt)
        study = result.scalar_one_or_none()
        if not study:
            raise NotFoundError("Study")

        # 2. Get all participants (including discarded — callers filter per
        #    export type) with their Q-sort entries and audio
        p_stmt = (
            select(Participant)
            .where(
                Participant.study_id == study_id,
            )
            .options(
                selectinload(Participant.qsort_entries),
                selectinload(Participant.audio_recordings),
            )
        )
        p_result = await db.execute(p_stmt)
        participants = p_result.scalars().all()

        # 3. Build Export Structure
        # PQMethod and others need a fixed reference for statement order.
        # We sort by original statement ID.
        sorted_statements = sorted(study.statements, key=lambda s: s.display_order)
        statement_id_to_index = {s.id: i for i, s in enumerate(sorted_statements)}

        participant_data: list[ParticipantDumpRecord] = []
        for p in participants:
            # Edge case: Handle missing or None qsort_entries
            placements: dict[int, int] = {}
            if p.qsort_entries:
                placements = {
                    entry.statement_id: entry.grid_score for entry in p.qsort_entries
                }

            # Create a score list in the exact order of sorted_statements
            scores: list[int | None] = [
                placements.get(s.id, None) for s in sorted_statements
            ]

            # Edge case: Ensure presort and postsort are not None
            presort: dict[str, object] = (
                dict(p.presort_answers) if p.presort_answers is not None else {}
            )
            postsort: dict[str, object] = (
                dict(p.postsort_answers) if p.postsort_answers is not None else {}
            )

            # Build audio recordings map with presigned URLs
            audio_recordings: dict[str, AudioRecordingEntry] = {}
            from ..services.storage_service import storage_service

            for audio_rec in p.audio_recordings:
                try:
                    # Generate fresh presigned URL (24h expiration for exports)
                    presigned_url: str | None = storage_service.generate_presigned_url(
                        audio_rec.s3_key, expiration=86400
                    )
                    audio_recordings[audio_rec.question_key] = AudioRecordingEntry(
                        id=audio_rec.id,
                        duration_seconds=audio_rec.duration_seconds,
                        file_size_bytes=audio_rec.file_size_bytes,
                        mime_type=audio_rec.mime_type,
                        created_at=audio_rec.created_at.isoformat(),
                        presigned_url=presigned_url,
                    )
                except Exception as e:
                    # Log but don't fail export
                    logger.warning(
                        "Failed to generate presigned URL for %s: %s",
                        audio_rec.s3_key,
                        e,
                    )

            participant_data.append(
                ParticipantDumpRecord(
                    id=str(p.session_token)[:8].upper(),
                    db_id=p.id,
                    duration_seconds=(p.submitted_at - p.consented_at).total_seconds()
                    if p.submitted_at and p.consented_at
                    else None,
                    scores=scores,
                    placements=placements,
                    presort=presort,
                    postsort=postsort,
                    audio_recordings=audio_recordings,
                    language=p.language_used,
                    is_discarded=p.is_discarded,
                    discard_reason=p.discard_reason,
                    status=p.status.value,
                    recruitment_token=getattr(p, "recruitment_token", None),
                    ip_address=p.ip_address,
                    user_agent=p.user_agent,
                    submitted_at=p.submitted_at.isoformat() if p.submitted_at else None,
                    created_at=p.created_at.isoformat() if p.created_at else None,
                    last_step_reached=p.last_step_reached,
                    last_step_reached_at=p.last_step_reached_at.isoformat()
                    if p.last_step_reached_at
                    else None,
                )
            )

        statements_out: list[StatementDumpRecord] = [
            StatementDumpRecord(
                id=s.id,
                code=s.code,
                translations=[
                    StatementTranslation(lang=t.language_code, text=t.text)
                    for t in s.translations
                ],
            )
            for s in sorted_statements
        ]
        study_translations: list[StudyTranslationEntry] = [
            StudyTranslationEntry(lang=t.language_code, title=t.title)
            for t in study.translations
        ]
        return StudyDump(
            study=StudyDumpStudy(
                slug=study.slug,
                state=study.state.value,
                grid_config=study.grid_config,
                presort_config=study.presort_config,
                postsort_config=study.postsort_config,
                statements=statements_out,
                translations=study_translations,
            ),
            participants=participant_data,
            statement_id_to_index=statement_id_to_index,
        )

    @staticmethod
    async def get_study_sort_data(db: AsyncSession, study_id: int) -> SortDataDump:
        """Lightweight version of get_study_full_dump for analysis.

        Skips audio recordings, presigned URLs, presort/postsort answers,
        and other metadata not needed for factor analysis. Only loads
        completed, non-discarded, non-test participants with Q-sort scores.
        """
        # 1. Study with statements
        stmt = (
            select(Study)
            .where(Study.id == study_id)
            .options(
                selectinload(Study.statements).selectinload(Statement.translations),
            )
        )
        result = await db.execute(stmt)
        study = result.scalar_one_or_none()
        if not study:
            raise NotFoundError("Study")

        # 2. Only completed, non-discarded participants (with Q-sort entries only)
        p_stmt = (
            select(Participant)
            .where(
                Participant.study_id == study_id,
                Participant.is_discarded.is_(False),
                Participant.status == ParticipantStatus.completed,
            )
            .options(selectinload(Participant.qsort_entries))
        )
        p_result = await db.execute(p_stmt)
        participants = p_result.scalars().all()

        # 3. Build lightweight structure
        sorted_statements = sorted(study.statements, key=lambda s: s.display_order)

        sort_participant_data: list[SortParticipantRecord] = []
        for p in participants:
            placements: dict[int, int] = {}
            if p.qsort_entries:
                placements = {
                    entry.statement_id: entry.grid_score for entry in p.qsort_entries
                }
            scores: list[int | None] = [
                placements.get(s.id, None) for s in sorted_statements
            ]

            sort_participant_data.append(
                SortParticipantRecord(
                    id=str(p.session_token)[:8].upper(),
                    db_id=p.id,
                    scores=scores,
                    is_discarded=False,
                    status="completed",
                )
            )

        sort_statements: list[StatementDumpRecord] = [
            StatementDumpRecord(
                id=s.id,
                code=s.code,
                translations=[
                    StatementTranslation(lang=t.language_code, text=t.text)
                    for t in s.translations
                ],
            )
            for s in sorted_statements
        ]
        return SortDataDump(
            study=SortDataStudy(
                statements=sort_statements,
                grid_config=study.grid_config,
                distribution_mode=study.distribution_mode.value,
            ),
            participants=sort_participant_data,
        )
