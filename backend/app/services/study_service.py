# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Service layer for Study-related operations."""

from collections import Counter
from datetime import datetime, timezone
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import (
    Participant,
    ParticipantStatus,
    QSortEntry,
    Statement,
    Study,
    StudyTranslation,
)
from ..schemas import SubmissionInput
from ..utils.crypto import hash_ip


class StudyService:
    """Service handling study logic."""

    @staticmethod
    async def get_study_by_slug(db: AsyncSession, slug: str) -> Study | None:
        """Retrieve a study by its slug with relations loaded."""
        stmt = (
            select(Study)
            .where(Study.slug == slug)
            .options(selectinload(Study.translations))
            .options(
                selectinload(Study.statements).selectinload(Statement.translations)
            )
        )
        result = await db.execute(stmt)
        return cast(Study | None, result.scalar_one_or_none())

    @staticmethod
    async def record_consent(
        db: AsyncSession,
        study_slug: str,
        session_token: Any,
        language_code: str,
        consent_hash: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ):
        """Records the exact time and version (hash) of consent."""
        # 1. Get Study
        study = await StudyService.get_study_by_slug(db, study_slug)
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")

        hashed_ip = hash_ip(ip_address or "unknown")

        # 2. Check if participant exists
        stmt = (
            select(Participant)
            .where(Participant.session_token == session_token)
            .with_for_update()
        )
        result = await db.execute(stmt)
        participant = result.scalar_one_or_none()

        if not participant:
            try:
                # Create new participant record immediately upon consent
                participant = Participant(
                    study_id=study.id,
                    session_token=session_token,
                    language_used=language_code,
                    random_seed=str(session_token)
                    if study.randomize_statements
                    else None,
                    consented_at=datetime.now(timezone.utc),
                    consent_hash=consent_hash,
                    ip_address=hashed_ip,
                    user_agent=user_agent,
                    status=ParticipantStatus.started,
                )
                db.add(participant)
                await db.flush()
            except IntegrityError:
                # Race condition: Participant created concurrently
                await db.rollback()
                result = await db.execute(stmt)
                participant = result.scalar_one_or_none()
                if not participant:
                    raise HTTPException(
                        status_code=500, detail="Concurrency error during consent."
                    )

        # If we fell through (update existing)
        if participant and participant not in db.new:
            participant.consented_at = datetime.now(timezone.utc)
            participant.consent_hash = consent_hash
            participant.language_used = language_code
            participant.ip_address = hashed_ip
            participant.user_agent = user_agent

        await db.commit()
        return {"status": "recorded"}

    @staticmethod
    def resolve_translation(
        study: Study, requested_lang: str
    ) -> tuple[str, StudyTranslation | None]:
        """Logic: Requested Lang -> Default (Study) -> English -> First Available."""
        # 1. Requested
        translation = next(
            (t for t in study.translations if t.language_code == requested_lang), None
        )

        # 2. Default (Study)
        if not translation and study.default_language:
            translation = next(
                (
                    t
                    for t in study.translations
                    if t.language_code == study.default_language
                ),
                None,
            )

        # 3. English
        if not translation:
            translation = next(
                (t for t in study.translations if t.language_code == "en"), None
            )

        # 4. First Available
        if not translation and study.translations:
            translation = study.translations[0]

        resolved_lang = translation.language_code if translation else "en"
        return resolved_lang, translation

    @staticmethod
    def validate_distribution(study: Study, qsort: list[Any]):
        """Validates the Q-sort distribution against the study's grid configuration."""
        # Edge case: Ensure study has statements
        if not study.statements:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: No statements defined.",
            )

        stmt_count = len(study.statements)
        if len(qsort) != stmt_count:
            raise HTTPException(
                status_code=400,
                detail=f"Submission incomplete. Expected {stmt_count} cards, got {len(qsort)}.",
            )

        # Edge case: Empty qsort should be caught above, but double-check
        if not qsort:
            raise HTTPException(
                status_code=400,
                detail="Cannot validate distribution: Q-sort is empty.",
            )

        submission_counts = Counter(entry.grid_score for entry in qsort)
        target_dist = {}

        # Edge case: Handle None or invalid grid_config
        if study.grid_config is None:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: grid_config is missing.",
            )

        if isinstance(study.grid_config, list):
            for item in study.grid_config:
                if isinstance(item, dict) and "score" in item and "capacity" in item:
                    try:
                        score = int(item["score"])
                        capacity = int(item["capacity"])
                        target_dist[score] = capacity
                    except (ValueError, TypeError):
                        # Log but continue - malformed grid config item
                        continue
        elif isinstance(study.grid_config, dict):
            for score_str, capacity in study.grid_config.items():
                try:
                    score = int(score_str)
                    cap = int(capacity)
                    target_dist[score] = cap
                except (ValueError, TypeError):
                    continue
        else:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: grid_config has invalid type.",
            )

        # Edge case: No valid target distribution parsed
        if not target_dist:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: Could not parse grid_config.",
            )

        for score_val, capacity in target_dist.items():
            count = submission_counts.get(score_val, 0)
            if count != capacity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Column {score_val} has incorrect number of cards. Expected {capacity}, got {count}.",
                )
            if score_val in submission_counts:
                del submission_counts[score_val]

        if submission_counts:
            invalid_scores = list(submission_counts.keys())
            raise HTTPException(
                status_code=400,
                detail=f"Submission contains invalid grid scores: {invalid_scores}",
            )

    @staticmethod
    async def process_submission(
        db: AsyncSession,
        data: SubmissionInput,
        client_ip: str,
        user_agent: str | None = None,
    ):
        """Process and save a participant's submission."""
        # 1. IP Hashing
        hashed_ip = hash_ip(client_ip)
        confirmation_code = str(data.session_token)[:8].upper()

        # 2. Get Study
        study = await StudyService.get_study_by_slug(db, data.study_slug)
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")

        # Edge case: Ensure study has statements loaded
        if not hasattr(study, "statements") or study.statements is None:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: Statements not loaded.",
            )

        # 2.5 Validation: Study State
        from ..models import StudyState

        if study.state != StudyState.active:
            raise HTTPException(
                status_code=400,
                detail=f"Study is not active (state: {study.state.value}). Submissions are not allowed.",
            )

        # Edge case: Ensure qsort is not None
        if data.qsort is None:
            raise HTTPException(
                status_code=400,
                detail="Submission error: Q-sort data is missing.",
            )

        # 3. Validation: Statement Ownership
        valid_statement_ids = {s.id for s in study.statements}

        # Edge case: Handle empty valid_statement_ids
        if not valid_statement_ids:
            raise HTTPException(
                status_code=500,
                detail="Study configuration error: No statements defined.",
            )

        for entry in data.qsort:
            if entry.statement_id not in valid_statement_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Statement ID {entry.statement_id} does not belong to study '{data.study_slug}'",
                )

        # 4. Validation: Distribution (only for completed)
        if data.status == ParticipantStatus.completed:
            StudyService.validate_distribution(study, data.qsort)

        # Edge case: Ensure presort_answers and postsort_answers are dicts, not None
        presort_answers = (
            data.presort_answers if data.presort_answers is not None else {}
        )
        postsort_answers = (
            data.postsort_answers if data.postsort_answers is not None else {}
        )

        # 5. Find or Create Participant
        participant_stmt = (
            select(Participant)
            .where(Participant.session_token == data.session_token)
            .with_for_update()
        )
        participant_result = await db.execute(participant_stmt)
        participant = participant_result.scalar_one_or_none()

        if not participant:
            try:
                participant = Participant(
                    study_id=study.id,
                    session_token=data.session_token,
                    language_used=data.language_used,
                    random_seed=str(data.session_token)
                    if study.randomize_statements
                    else None,
                    presort_answers=presort_answers,
                    postsort_answers=postsort_answers,
                    status=data.status,
                    confirmation_code=confirmation_code,
                    ip_address=hashed_ip,
                    user_agent=user_agent,
                    submitted_at=datetime.now(timezone.utc),
                )
                db.add(participant)
                await db.flush()
            except IntegrityError:
                # Race condition: Participant was created by another request in the meantime.
                # Rollback the failed insert and fetch the existing participant.
                await db.rollback()
                participant_result = await db.execute(participant_stmt)
                participant = participant_result.scalar_one_or_none()
                if not participant:
                    # Should not happen if IntegrityError was due to session_token
                    raise HTTPException(
                        status_code=500,
                        detail="Concurrency error: Could not resolve participant.",
                    )
            except Exception as e:
                # Edge case: Catch any unexpected database errors
                await db.rollback()
                raise HTTPException(
                    status_code=500,
                    detail=f"Database error while creating participant: {str(e)}",
                )

        # If we fell through (either from 'else' or after catching exception), participant exists.
        if participant and participant not in db.new:
            # Update existing participant
            if participant.status == ParticipantStatus.completed:
                return str(participant.session_token)[:8].upper()

            participant.language_used = data.language_used
            participant.presort_answers = presort_answers
            participant.postsort_answers = postsort_answers
            if data.status:
                participant.status = data.status
            participant.confirmation_code = confirmation_code
            participant.ip_address = hashed_ip
            participant.user_agent = user_agent
            participant.submitted_at = datetime.now(timezone.utc)

            await db.flush()

            # Replace Q-Sort entries
            await db.execute(
                delete(QSortEntry).where(QSortEntry.participant_id == participant.id)
            )
            await db.flush()

        # Edge case: Ensure participant.id exists before creating QSortEntry
        if not participant or participant.id is None:
            raise HTTPException(
                status_code=500,
                detail="Database error: Participant ID is missing after save.",
            )

        # 6. Save Q-Sort Entries
        try:
            new_entries = [
                QSortEntry(
                    participant_id=participant.id,
                    statement_id=entry.statement_id,
                    grid_score=entry.grid_score,
                    card_comment=entry.card_comment,
                )
                for entry in data.qsort
            ]
            db.add_all(new_entries)
            await db.commit()
        except Exception as e:
            # Edge case: Handle commit failures
            await db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error while saving Q-sort entries: {str(e)}",
            )

        return confirmation_code

    @staticmethod
    async def get_study_stats(db: AsyncSession, study_id: int) -> dict[str, Any]:
        """Calculates aggregated statistics for a study."""
        # 1. Get all participants for this study (excluding discarded)
        stmt = select(Participant).where(
            Participant.study_id == study_id, Participant.is_discarded.is_(False)
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
        device_breakdown = {"mobile": 0, "desktop": 0}
        for p in participants:
            ua = (p.user_agent or "").lower()
            if any(x in ua for x in ["mobile", "android", "iphone", "ipad"]):
                device_breakdown["mobile"] += 1
            else:
                device_breakdown["desktop"] += 1

        return {
            "started_count": started_count,
            "completed_count": completed_count,
            "completion_rate": completion_rate,
            "median_duration_seconds": median_duration,
            "device_breakdown": device_breakdown,
        }

    @staticmethod
    async def get_study_full_dump(db: AsyncSession, study_id: int) -> dict[str, Any]:
        """Extracts complete study data and valid participant sorts for export."""
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
            raise HTTPException(status_code=404, detail="Study not found")

        # 2. Get all non-discarded completed participants with their Q-sort entries
        p_stmt = (
            select(Participant)
            .where(
                Participant.study_id == study_id,
                Participant.status == ParticipantStatus.completed,
                Participant.is_discarded.is_(False),
            )
            .options(selectinload(Participant.qsort_entries))
        )
        p_result = await db.execute(p_stmt)
        participants = p_result.scalars().all()

        # 3. Build Export Structure
        # PQMethod and others need a fixed reference for statement order.
        # We sort by original statement ID.
        sorted_statements = sorted(study.statements, key=lambda s: s.id)
        statement_id_to_index = {s.id: i for i, s in enumerate(sorted_statements)}

        participant_data = []
        for p in participants:
            # Edge case: Handle missing or None qsort_entries
            placements = {}
            if p.qsort_entries:
                placements = {
                    entry.statement_id: entry.grid_score for entry in p.qsort_entries
                }

            # Create a score list in the exact order of sorted_statements
            scores = [placements.get(s.id, None) for s in sorted_statements]

            # Edge case: Ensure presort and postsort are not None
            presort = p.presort_answers if p.presort_answers is not None else {}
            postsort = p.postsort_answers if p.postsort_answers is not None else {}

            participant_data.append(
                {
                    "id": str(p.session_token)[:8].upper(),
                    "duration_seconds": (
                        p.submitted_at - p.consented_at
                    ).total_seconds()
                    if p.submitted_at and p.consented_at
                    else None,
                    "scores": scores,
                    # For raw CSV/KenQ
                    "placements": placements,
                    "presort": presort,
                    "postsort": postsort,
                    "language": p.language_used,
                }
            )

        return {
            "study": {
                "slug": study.slug,
                "grid_config": study.grid_config,
                "statements": [
                    {
                        "id": s.id,
                        "code": s.code,
                        "translations": [
                            {"lang": t.language_code, "text": t.text}
                            for t in s.translations
                        ],
                    }
                    for s in sorted_statements
                ],
                "translations": [
                    {"lang": t.language_code, "title": t.title}
                    for t in study.translations
                ],
            },
            "participants": participant_data,
            "statement_id_to_index": statement_id_to_index,
        }
