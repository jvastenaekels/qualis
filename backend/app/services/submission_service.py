"""Service for participant consent and Q-sort submission processing."""

import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from ..exceptions import (
    ConcurrencyError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from ..models import (
    Participant,
    ParticipantStatus,
    QSortEntry,
    Study,
    StudyState,
)
from ..schemas import SubmissionInput
from ..utils.crypto import hash_ip
from .recruitment_service import RecruitmentService
from .study_service import StudyService

logger = logging.getLogger(__name__)


class SubmissionService:
    """Handles participant consent recording, Q-sort validation, and submission processing."""

    @staticmethod
    async def record_consent(
        db: AsyncSession,
        study_slug: str,
        session_token: Any,
        language_code: str,
        consent_hash: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        is_test_run: bool = False,
    ) -> dict[str, Any]:
        """Records the exact time and version (hash) of consent."""
        # 1. Get Study
        study = await StudyService.get_study_by_slug(db, study_slug)
        if not study:
            raise NotFoundError("Study")

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
                    random_seed=str(
                        StudyService._generate_session_seed(str(session_token))
                    )
                    if study.randomize_statement_order
                    else None,
                    consented_at=datetime.now(timezone.utc),
                    consent_hash=consent_hash,
                    ip_address=hashed_ip,
                    user_agent=user_agent,
                    status=ParticipantStatus.started,
                    is_test_run=is_test_run,
                    last_step_reached=1,
                    last_step_reached_at=datetime.now(timezone.utc),
                )
                db.add(participant)
                await db.flush()

                # Generate memorable resume code (savepoint protects
                # against the extremely rare concurrent collision).
                # Explicit savepoint begin/commit/rollback (rather than
                # `async with begin_nested()`) so the outer transaction
                # state stays clean across retries — the context-manager
                # form left the session in DEACTIVE after the first
                # IntegrityError, which broke the second begin_nested()
                # call with PendingRollbackError.
                from ..resume_codes import generate_unique_resume_code

                resume_code_set = False
                for _rc in range(3):
                    participant.resume_code = await generate_unique_resume_code(
                        db, language_code
                    )
                    savepoint = await db.begin_nested()
                    try:
                        await db.flush()
                    except IntegrityError:
                        await savepoint.rollback()
                        logger.warning(
                            "Resume code collision on attempt %d, retrying",
                            _rc + 1,
                        )
                        continue
                    await savepoint.commit()
                    resume_code_set = True
                    break

                if not resume_code_set:
                    raise ConcurrencyError("Could not generate a unique resume code.")
            except IntegrityError:
                # Race condition: Participant created concurrently
                await db.rollback()
                result = await db.execute(stmt)
                participant = result.scalar_one_or_none()
                if not participant:
                    raise ConcurrencyError("Concurrency error during consent.")

        # If we fell through (update existing)
        if participant and participant not in db.new:
            participant.consented_at = datetime.now(timezone.utc)
            participant.consent_hash = consent_hash
            participant.language_used = language_code
            participant.ip_address = hashed_ip
            participant.user_agent = user_agent
            if is_test_run:
                participant.is_test_run = True
            # Generate resume code if missing (e.g. pre-existing participant)
            if not participant.resume_code:
                from ..resume_codes import generate_unique_resume_code

                for _rc in range(3):
                    participant.resume_code = await generate_unique_resume_code(
                        db, language_code
                    )
                    try:
                        async with db.begin_nested():
                            await db.flush()
                        break
                    except IntegrityError:
                        logger.warning(
                            "Resume code collision on attempt %d (existing participant), retrying",
                            _rc + 1,
                        )
                else:
                    raise ConcurrencyError("Could not generate a unique resume code.")

        await db.commit()
        return {"status": "recorded", "resume_code": participant.resume_code}

    @staticmethod
    def validate_distribution(study: Study, qsort: list[Any]) -> None:
        """Validates the Q-sort distribution against the study's grid configuration."""
        # Edge case: Ensure study has statements
        if not study.statements:
            raise ValidationError("Study configuration error: No statements defined.")

        stmt_count = len(study.statements)
        if len(qsort) != stmt_count:
            raise ValidationError(
                f"Submission incomplete. Expected {stmt_count} cards, got {len(qsort)}."
            )

        # Edge case: Empty qsort should be caught above, but double-check
        if not qsort:
            raise ValidationError("Cannot validate distribution: Q-sort is empty.")

        submission_counts = Counter(entry.grid_score for entry in qsort)
        target_dist = {}

        # Edge case: Handle None or invalid grid_config
        if study.grid_config is None:
            raise ValidationError("Study configuration error: grid_config is missing.")

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
            raise ValidationError(
                "Study configuration error: grid_config has invalid type."
            )

        # Edge case: No valid target distribution parsed
        if not target_dist:
            raise ValidationError(
                "Study configuration error: Could not parse grid_config."
            )

        for score_val, capacity in target_dist.items():
            count = submission_counts.get(score_val, 0)
            if count != capacity:
                raise ValidationError(
                    f"Column {score_val} has incorrect number of cards. Expected {capacity}, got {count}."
                )
            if score_val in submission_counts:
                del submission_counts[score_val]

        if submission_counts:
            invalid_scores = list(submission_counts.keys())
            raise ValidationError(
                f"Submission contains invalid grid scores: {invalid_scores}"
            )

    @staticmethod
    async def process_submission(
        db: AsyncSession,
        data: SubmissionInput,
        client_ip: str,
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        """Process and save a participant's submission."""
        # 1. IP Hashing
        hashed_ip = hash_ip(client_ip)
        confirmation_code = str(data.session_token)[:8].upper()

        # 2. Get Study
        study = await StudyService.get_study_by_slug(db, data.study_slug)
        if not study:
            raise NotFoundError("Study")

        # Edge case: Ensure study has statements loaded
        if not hasattr(study, "statements") or study.statements is None:
            raise ValidationError("Study configuration error: Statements not loaded.")

        # 2.5 Validation: Study State
        if study.state != StudyState.active and not data.is_test_run:
            raise ValidationError(
                f"Study is not active (state: {study.state.value}). Submissions are not allowed."
            )

        # 2.5b Validation: Date-based closure (DB state stays 'active' past end_date)
        if study.state == StudyState.active and not data.is_test_run:
            now = datetime.now(timezone.utc)
            if study.end_date:
                end_dt = study.end_date
                if end_dt.tzinfo is None:
                    closed = now.replace(tzinfo=None) > end_dt
                else:
                    closed = now > end_dt
                if closed:
                    raise ValidationError(
                        "Study has ended. Submissions are no longer accepted."
                    )

        # 2.6 Validation: Recruitment Link
        link = None
        if data.link_token:
            link = await RecruitmentService.validate_link_token(
                db, study.id, data.link_token
            )
            if not link:
                raise ForbiddenError("Invalid, expired, or full recruitment link")

        # Edge case: Ensure qsort is not None
        if data.qsort is None:
            raise ValidationError("Submission error: Q-sort data is missing.")

        # 3. Validation: Statement Ownership
        valid_statement_ids = {s.id for s in study.statements}

        # Edge case: Handle empty valid_statement_ids
        if not valid_statement_ids:
            raise ValidationError("Study configuration error: No statements defined.")

        for entry in data.qsort:
            if entry.statement_id not in valid_statement_ids:
                raise ValidationError(
                    f"Statement ID {entry.statement_id} does not belong to study '{data.study_slug}'"
                )

        # 4. Validation: Distribution (only for completed)
        if data.status == ParticipantStatus.completed:
            SubmissionService.validate_distribution(study, data.qsort)

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
        is_newly_created = False

        # Validate token belongs to this study
        if participant and participant.study_id != study.id:
            raise ValidationError("Session token does not belong to this study.")

        if not participant:
            try:
                participant = Participant(
                    study_id=study.id,
                    session_token=data.session_token,
                    language_used=data.language_used,
                    random_seed=str(
                        StudyService._generate_session_seed(str(data.session_token))
                    )
                    if study.randomize_statement_order
                    else None,
                    presort_answers=presort_answers,
                    postsort_answers=postsort_answers,
                    status=data.status,
                    confirmation_code=confirmation_code,
                    ip_address=hashed_ip,
                    user_agent=user_agent,
                    submitted_at=datetime.now(timezone.utc)
                    if data.status == ParticipantStatus.completed
                    else None,
                    last_step_reached=5
                    if data.status == ParticipantStatus.completed
                    else 1,
                    last_step_reached_at=datetime.now(timezone.utc),
                    is_test_run=data.is_test_run,
                )
                db.add(participant)
                await db.flush()
                is_newly_created = True

                # Increment link usage if link was used
                if link and data.link_token:
                    participant.presort_answers = {
                        **participant.presort_answers,
                        "_recruitment_token": data.link_token,
                    }
                    # Atomically check capacity and increment usage
                    if not await RecruitmentService.increment_usage(db, link.id):
                        raise ForbiddenError(
                            "Invalid, expired, or full recruitment link"
                        )
            except IntegrityError:
                # Race condition: Participant was created by another request in the meantime.
                # Rollback the failed insert and fetch the existing participant.
                await db.rollback()
                participant_result = await db.execute(participant_stmt)
                participant = participant_result.scalar_one_or_none()
                if not participant:
                    # Should not happen if IntegrityError was due to session_token
                    raise ConcurrencyError(
                        "Concurrency error: Could not resolve participant."
                    )
            except (NotFoundError, ValidationError, ForbiddenError, ConcurrencyError):
                raise
            except Exception as e:
                # Edge case: Catch any unexpected database errors
                await db.rollback()
                raise ConcurrencyError(
                    f"Database error while creating participant: {str(e)}"
                )

        # 6. Validation: Consent must be recorded for completed non-test submissions
        if (
            data.status == ParticipantStatus.completed
            and not data.is_test_run
            and participant
            and not participant.consented_at
        ):
            raise ValidationError(
                "Cannot complete submission: consent has not been recorded."
            )

        # If we fell through (either from 'else' or after catching exception), participant exists.
        # Ensure we don't treat a newly created participant as an existing one we need to skip/update.
        if participant and participant not in db.new and not is_newly_created:
            # Update existing participant
            if participant.status == ParticipantStatus.completed:
                return {
                    "confirmation_code": participant.confirmation_code
                    or str(participant.session_token)[:8].upper(),
                    "id": participant.id,
                    "already_submitted": True,
                }

            # Reject expired sessions
            if participant.is_expired:
                raise ValidationError(
                    "Session has expired. Please start a new session."
                )

            participant.language_used = data.language_used
            participant.presort_answers = presort_answers
            participant.postsort_answers = postsort_answers
            if data.status:
                participant.status = data.status
            participant.confirmation_code = confirmation_code
            participant.ip_address = hashed_ip
            participant.user_agent = user_agent
            participant.is_test_run = data.is_test_run
            if data.status == ParticipantStatus.completed:
                participant.submitted_at = datetime.now(timezone.utc)
                participant.last_step_reached = 5
                participant.last_step_reached_at = participant.submitted_at
                participant.draft_responses = None

            await db.flush()

            # Replace Q-Sort entries
            await db.execute(
                delete(QSortEntry).where(QSortEntry.participant_id == participant.id)
            )
            await db.flush()

        # Edge case: Ensure participant.id exists before creating QSortEntry
        if not participant or participant.id is None:
            raise ConcurrencyError(
                "Database error: Participant ID is missing after save."
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
            await db.flush()
            # await db.commit() -> Handled by router
        except Exception as e:
            # Edge case: Handle commit failures
            await db.rollback()
            raise ConcurrencyError(
                f"Database error while saving Q-sort entries: {str(e)}"
            )

        return {"confirmation_code": confirmation_code, "id": participant.id}
