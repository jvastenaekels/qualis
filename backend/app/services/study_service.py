# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Service layer for Study-related operations."""

from collections import Counter
from datetime import datetime
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy import delete, select
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
        stmt_count = len(study.statements)
        if len(qsort) != stmt_count:
            raise HTTPException(
                status_code=400,
                detail=f"Submission incomplete. Expected {stmt_count} cards, got {len(qsort)}.",
            )

        submission_counts = Counter(entry.grid_score for entry in qsort)
        target_dist = {}

        if isinstance(study.grid_config, list):
            for item in study.grid_config:
                if isinstance(item, dict) and "score" in item and "capacity" in item:
                    target_dist[int(item["score"])] = item["capacity"]
        elif isinstance(study.grid_config, dict):
            for score_str, capacity in study.grid_config.items():
                try:
                    target_dist[int(score_str)] = capacity
                except ValueError:
                    continue

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
        db: AsyncSession, data: SubmissionInput, client_ip: str
    ):
        """Process and save a participant's submission."""
        # 1. IP Hashing
        hashed_ip = hash_ip(client_ip)
        confirmation_code = str(data.session_token)[:8].upper()

        # 2. Get Study
        study = await StudyService.get_study_by_slug(db, data.study_slug)
        if not study:
            raise HTTPException(status_code=404, detail="Study not found")

        # 2.5 Validation: Study State
        if study.state != "active":
            raise HTTPException(
                status_code=400,
                detail=f"Study is not active (state: {study.state}). Submissions invalid.",
            )

        # 3. Validation: Statement Ownership
        valid_statement_ids = {s.id for s in study.statements}
        for entry in data.qsort:
            if entry.statement_id not in valid_statement_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Statement ID {entry.statement_id} does not belong to study '{data.study_slug}'",
                )

        # 4. Validation: Distribution (only for completed)
        if data.status == ParticipantStatus.completed:
            StudyService.validate_distribution(study, data.qsort)

        # 5. Find or Create Participant
        participant_stmt = select(Participant).where(
            Participant.session_token == data.session_token
        )
        participant_result = await db.execute(participant_stmt)
        participant = participant_result.scalar_one_or_none()

        if not participant:
            participant = Participant(
                study_id=study.id,
                session_token=data.session_token,
                language_used=data.language_used,
                presort_answers=data.presort_answers,
                postsort_answers=data.postsort_answers,
                status=data.status,
                confirmation_code=confirmation_code,
                ip_address=hashed_ip,
                submitted_at=datetime.now(),
            )
            db.add(participant)
            await db.flush()
        else:
            if participant.status == ParticipantStatus.completed:
                return str(participant.session_token)[:8].upper()

            participant.language_used = data.language_used
            participant.presort_answers = data.presort_answers
            participant.postsort_answers = data.postsort_answers
            if data.status:
                participant.status = data.status
            participant.confirmation_code = confirmation_code
            participant.ip_address = hashed_ip
            participant.submitted_at = datetime.now()

            await db.flush()

            # Replace Q-Sort entries
            await db.execute(
                delete(QSortEntry).where(QSortEntry.participant_id == participant.id)
            )
            await db.flush()

        # 6. Save Q-Sort Entries
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

        return confirmation_code
