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
    DistributionMode,
    Participant,
    ParticipantStatus,
    QSortEntry,
    RecruitmentLink,
    Study,
    StudyState,
)
from ..schemas import SubmissionInput
from ..utils.crypto import hash_ip, hash_user_agent
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
    ) -> dict[str, Any]:
        """Records the exact time and version (hash) of consent."""
        # 1. Get Study
        study = await StudyService.get_study_by_slug(db, study_slug)
        if not study:
            raise NotFoundError("Study")

        hashed_ip = hash_ip(ip_address or "unknown")
        hashed_ua = hash_user_agent(user_agent)

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
                    user_agent=hashed_ua,
                    status=ParticipantStatus.started,
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
            # First-consent-wins: never overwrite the original consent timestamp
            # or hash on a re-POST (re-mount, retry, back-nav). consented_at is
            # the duration metric's start anchor — resetting it yields
            # artificially short or negative durations (negatives are silently
            # dropped, skewing the median) — and it is the legal record of when
            # consent was given. Gate the hash with it so the two can't desync.
            if not participant.consented_at:
                participant.consented_at = datetime.now(timezone.utc)
                participant.consent_hash = consent_hash
            participant.language_used = language_code
            participant.ip_address = hashed_ip
            participant.user_agent = hashed_ua
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

        # Determine the distribution mode. Default to 'forced' for backwards
        # compatibility (existing studies without the column will be migrated
        # with server_default='forced'; in tests using a mock, the attribute may
        # be missing entirely).
        mode = getattr(study, "distribution_mode", DistributionMode.forced)
        if mode is None:
            mode = DistributionMode.forced

        if mode == DistributionMode.forced:
            # Strict: each declared column must hold exactly its capacity.
            for score_val, capacity in target_dist.items():
                count = submission_counts.get(score_val, 0)
                if count != capacity:
                    raise ValidationError(
                        f"Column {score_val} has incorrect number of cards. "
                        f"Expected {capacity}, got {count}."
                    )
                if score_val in submission_counts:
                    del submission_counts[score_val]
        else:
            # free / flexible: skip per-column equality. The total card count
            # has already been validated above (len(qsort) == stmt_count).
            # We still drop valid scores from submission_counts so the
            # invalid-score check below works identically across modes.
            if mode == DistributionMode.flexible:
                # Soft hint: log a warning when per-column counts diverge from
                # declared capacities, but do not reject.
                for score_val, capacity in target_dist.items():
                    count = submission_counts.get(score_val, 0)
                    if count != capacity:
                        logger.warning(
                            "Flexible mode: column %s has %d cards, declared "
                            "capacity %d (soft hint, not rejected).",
                            score_val,
                            count,
                            capacity,
                        )
            for score_val in target_dist:
                if score_val in submission_counts:
                    del submission_counts[score_val]

        if submission_counts:
            invalid_scores = list(submission_counts.keys())
            raise ValidationError(
                f"Submission contains invalid grid scores: {invalid_scores}"
            )

    @staticmethod
    def _validate_study_state(study: Study) -> None:
        """Validate the study can accept submissions.

        Checks:
        - statements collection is loaded on the ORM object,
        - study state is `active`,
        - if `end_date` is set, the study has not ended (DB state stays
          `active` even past `end_date`, so this guard is necessary).
        """
        if not hasattr(study, "statements") or study.statements is None:
            raise ValidationError("Study configuration error: Statements not loaded.")

        if study.state != StudyState.active:
            raise ValidationError(
                f"Study is not active (state: {study.state.value}). Submissions are not allowed."
            )

        if study.end_date:
            now = datetime.now(timezone.utc)
            end_dt = study.end_date
            if end_dt.tzinfo is None:
                closed = now.replace(tzinfo=None) > end_dt
            else:
                closed = now > end_dt
            if closed:
                raise ValidationError(
                    "Study has ended. Submissions are no longer accepted."
                )

    @staticmethod
    def _validate_qsort_payload(study: Study, data: SubmissionInput) -> None:
        """Validate the Q-sort payload submitted by a participant.

        Checks:
        - qsort is not None,
        - every statement_id belongs to this study,
        - the distribution matches grid_config when status == completed.
        """
        if data.qsort is None:
            raise ValidationError("Submission error: Q-sort data is missing.")

        valid_statement_ids = {s.id for s in study.statements}
        if not valid_statement_ids:
            raise ValidationError("Study configuration error: No statements defined.")

        for entry in data.qsort:
            if entry.statement_id not in valid_statement_ids:
                raise ValidationError(
                    f"Statement ID {entry.statement_id} does not belong to study '{data.study_slug}'"
                )

        if data.status == ParticipantStatus.completed:
            SubmissionService.validate_distribution(study, data.qsort)

    @staticmethod
    async def _find_or_create_participant(
        db: AsyncSession,
        data: SubmissionInput,
        study: Study,
        link: RecruitmentLink | None,
        *,
        presort_answers: dict[str, Any],
        postsort_answers: dict[str, Any],
        confirmation_code: str,
        hashed_ip: str,
        user_agent: str | None,
    ) -> tuple[Participant, bool]:
        """Lookup the participant row by session_token; create it if missing.

        On creation, increments the recruitment link usage atomically.
        Handles the race where a concurrent request inserted the same
        session_token by rolling back, re-fetching, and returning the
        existing row. The boolean flag marks whether *this* call did the
        creation (used downstream to skip the existing-row update path).
        """
        participant_stmt = (
            select(Participant)
            .where(Participant.session_token == data.session_token)
            .with_for_update()
        )
        participant_result = await db.execute(participant_stmt)
        participant = participant_result.scalar_one_or_none()

        if participant and participant.study_id != study.id:
            raise ValidationError("Session token does not belong to this study.")

        if participant is not None:
            return participant, False

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
            )
            db.add(participant)
            await db.flush()

            if link and data.link_token:
                participant.presort_answers = {
                    **participant.presort_answers,
                    "_recruitment_token": data.link_token,
                }
                if not await RecruitmentService.increment_usage(db, link.id):
                    raise ForbiddenError("Invalid, expired, or full recruitment link")

            return participant, True
        except IntegrityError:
            # Race: another request inserted the same session_token.
            # Rollback the failed insert and fetch the existing row.
            await db.rollback()
            participant_result = await db.execute(participant_stmt)
            participant = participant_result.scalar_one_or_none()
            if not participant:
                raise ConcurrencyError(
                    "Concurrency error: Could not resolve participant."
                )
            return participant, False
        except (NotFoundError, ValidationError, ForbiddenError, ConcurrencyError):
            raise
        except Exception as e:
            await db.rollback()
            raise ConcurrencyError(
                f"Database error while creating participant: {str(e)}"
            )

    @staticmethod
    async def _update_existing_participant(
        db: AsyncSession,
        participant: Participant,
        is_newly_created: bool,
        data: SubmissionInput,
        *,
        presort_answers: dict[str, Any],
        postsort_answers: dict[str, Any],
        confirmation_code: str,
        hashed_ip: str,
        user_agent: str | None,
    ) -> dict[str, Any] | None:
        """Update an existing participant's submission and clear old Q-sort.

        Returns:
            None — caller should continue inserting the new Q-sort.
            dict — already-submitted short-circuit (caller returns it as-is).
        """
        # Skip when this participant was just inserted in the current request.
        if is_newly_created or participant in db.new:
            return None

        if participant.status == ParticipantStatus.completed:
            return {
                "confirmation_code": participant.confirmation_code
                or str(participant.session_token)[:8].upper(),
                "id": participant.id,
                "already_submitted": True,
            }

        if participant.is_expired:
            raise ValidationError("Session has expired. Please start a new session.")

        participant.language_used = data.language_used
        participant.presort_answers = presort_answers
        participant.postsort_answers = postsort_answers
        if data.status:
            participant.status = data.status
        participant.confirmation_code = confirmation_code
        participant.ip_address = hashed_ip
        participant.user_agent = user_agent
        if data.status == ParticipantStatus.completed:
            participant.submitted_at = datetime.now(timezone.utc)
            participant.last_step_reached = 5
            participant.last_step_reached_at = participant.submitted_at
            participant.draft_responses = None

        await db.flush()

        # Replace Q-Sort entries — the new ones are inserted by
        # _persist_qsort_entries below.
        await db.execute(
            delete(QSortEntry).where(QSortEntry.participant_id == participant.id)
        )
        await db.flush()
        return None

    @staticmethod
    async def _persist_qsort_entries(
        db: AsyncSession,
        participant: Participant,
        data: SubmissionInput,
    ) -> None:
        """Insert the new Q-sort entries for the participant.

        Assumes any pre-existing entries have already been deleted by the
        update path. Raises `ConcurrencyError` on database failure (the
        outer transaction is rolled back).
        """
        if participant.id is None:
            raise ConcurrencyError(
                "Database error: Participant ID is missing after save."
            )

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
        except Exception as e:
            await db.rollback()
            raise ConcurrencyError(
                f"Database error while saving Q-sort entries: {str(e)}"
            )

    @staticmethod
    async def process_submission(
        db: AsyncSession,
        data: SubmissionInput,
        client_ip: str,
        user_agent: str | None = None,
    ) -> dict[str, Any]:
        """Process and save a participant's submission."""
        # 1. IP + UA hashing (UA is treated like IP — see hash_user_agent docstring).
        hashed_ip = hash_ip(client_ip)
        hashed_ua = hash_user_agent(user_agent)
        confirmation_code = str(data.session_token)[:8].upper()

        # 2. Get Study
        study = await StudyService.get_study_by_slug(db, data.study_slug)
        if not study:
            raise NotFoundError("Study")

        # 2.5 Validate study acceptance state (statements loaded, active, not ended)
        SubmissionService._validate_study_state(study)

        # 2.6 Validation: Recruitment Link
        link = None
        if data.link_token:
            link = await RecruitmentService.validate_link_token(
                db, study.id, data.link_token
            )
            if not link:
                raise ForbiddenError("Invalid, expired, or full recruitment link")

        # C4: an already-completed participant re-POSTing must idempotently get
        # its stored confirmation back — even if the grid was edited since, which
        # would make the old Q-sort fail validate_distribution below. Short-
        # circuit BEFORE qsort/distribution validation, using a read-only lookup
        # (no lock, no creation, no link-usage increment — those stay in
        # _find_or_create_participant). The study_id guard preserves the
        # "token belongs to this study" invariant that _find_or_create enforces.
        already_completed = (
            await db.execute(
                select(Participant).where(
                    Participant.session_token == data.session_token
                )
            )
        ).scalar_one_or_none()
        if (
            already_completed is not None
            and already_completed.study_id == study.id
            and already_completed.status == ParticipantStatus.completed
        ):
            return {
                "confirmation_code": already_completed.confirmation_code
                or str(already_completed.session_token)[:8].upper(),
                "id": already_completed.id,
                "already_submitted": True,
            }

        # 3-4. Validate Q-sort payload (presence, statement ownership, distribution)
        SubmissionService._validate_qsort_payload(study, data)

        # Edge case: Ensure presort_answers and postsort_answers are dicts, not None
        presort_answers = (
            data.presort_answers if data.presort_answers is not None else {}
        )
        postsort_answers = (
            data.postsort_answers if data.postsort_answers is not None else {}
        )

        # 5. Find or create the participant row (handles race-condition retry).
        (
            participant,
            is_newly_created,
        ) = await SubmissionService._find_or_create_participant(
            db,
            data,
            study,
            link,
            presort_answers=presort_answers,
            postsort_answers=postsort_answers,
            confirmation_code=confirmation_code,
            hashed_ip=hashed_ip,
            user_agent=hashed_ua,
        )

        # 6. Validation: Consent must be recorded for completed submissions
        if (
            data.status == ParticipantStatus.completed
            and participant
            and not participant.consented_at
        ):
            raise ValidationError(
                "Cannot complete submission: consent has not been recorded."
            )

        # If the participant already existed (or we re-fetched after a race),
        # update its fields and replace the old Q-sort entries. The helper
        # returns the already-submitted short-circuit dict if the row is
        # already in completed state.
        shortcut = await SubmissionService._update_existing_participant(
            db,
            participant,
            is_newly_created,
            data,
            presort_answers=presort_answers,
            postsort_answers=postsort_answers,
            confirmation_code=confirmation_code,
            hashed_ip=hashed_ip,
            user_agent=hashed_ua,
        )
        if shortcut is not None:
            return shortcut

        # 6. Save Q-Sort entries (db.commit() is handled by the router).
        await SubmissionService._persist_qsort_entries(db, participant, data)

        return {"confirmation_code": confirmation_code, "id": participant.id}
