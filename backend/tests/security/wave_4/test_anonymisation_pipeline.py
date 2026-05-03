# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 4 Task 4 — Anonymisation completeness (F-05-002, F-05-003).

Pre-fix gaps
------------

1. **F-05-002 — `user_agent` stored raw at write time.**

   The default consent text (``study_defaults.py:109``) promised that
   "Direct identifiers (such as IP addresses) are immediately
   converted into an anonymous code and are never stored in their
   original format." The example list ("such as IP addresses") is
   non-exhaustive. The Wave 4 inventory (§2.2 promise 1, §2.4 PII
   table) confirmed:

   - ``participants.ip_address`` was hashed at the service-layer
     entry point (``submission_service.py:53``,
     ``submission_service.py:504``).
   - ``participants.user_agent`` was persisted **raw**, on every
     consent and every submit. UA strings carry browser/OS/version
     detail and on rare browsers can be quasi-identifying.

2. **F-05-003 — `qsort_entries.card_comment` preserved through
   anonymisation (observation, not fixed in code).**

   ``StudyDataService.anonymise_participant`` clears the participant's
   ``presort_answers`` and ``postsort_answers`` JSON blobs (set to
   ``{}``) but does not touch ``qsort_entries.card_comment``. This is
   defensible: per-card comments are research data the participant
   contributed under consent and that the consent text itself flags
   for operator screening ("Qualitative comments may be quoted to
   contextualize these factors but will be screened to remove
   revealing details"). Qualis cannot do the screening
   programmatically. **Documented as observation; operator obligation
   for the Wave 7 GDPR memo.**

Post-fix invariants (F-05-002)
------------------------------

1. ``hash_user_agent(ua)`` returns ``"<device_class>:<sha256[:56]>"``
   where device_class is ``"mobile"`` or ``"desktop"`` (substring
   heuristic on the raw UA, case-insensitive). ``None`` UA → ``None``.
2. The function reuses ``IP_HASH_SALT`` (one variable for the whole
   GDPR config), and refuses to start in production without it.
3. ``record_consent`` and ``process_submission`` both call
   ``hash_user_agent`` at the entry point, so no raw UA reaches the
   ``participants`` table.
4. The same UA hashes deterministically across consent and submit
   (so duplicate-detection heuristics on hashed UA still work).
5. Post-anonymisation, ``user_agent`` is ``NULL`` (existing behaviour;
   pinned here as part of the post-anonymisation invariants).

Post-anonymisation invariants (regression for F-05-001 and adjacent)
--------------------------------------------------------------------

After ``anonymise_participant``:
- ``ip_address`` is ``NULL``.
- ``user_agent`` is ``NULL``.
- ``confirmation_code``, ``resume_code``, ``consent_hash`` are ``NULL``.
- ``presort_answers`` is ``{}``.
- ``postsort_answers`` is ``{}``.
- ``draft_responses`` is ``NULL``.
- ``session_token`` is rotated (a fresh UUID).
- ``anonymised_at`` is set.
- ``qsort_entries.card_comment`` is **preserved** (research data;
  operator screening obligation).
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Participant,
    ParticipantStatus,
    Project,
    QSortEntry,
    Statement,
    Study,
    StudyState,
)
from app.services.study_data_service import StudyDataService
from app.utils.crypto import hash_user_agent


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


async def _seed_study_with_one_statement(db: AsyncSession) -> tuple[Study, Statement]:
    project = Project(
        title=f"P-{uuid4().hex[:6]}",
        slug=f"p-{uuid4().hex[:6]}",
    )
    db.add(project)
    await db.flush()
    study = Study(
        slug=f"anon-{uuid4().hex[:6]}",
        project_id=project.id,
        state=StudyState.active,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()
    statement = Statement(study_id=study.id, code="S1")
    db.add(statement)
    await db.flush()
    return study, statement


async def _seed_full_pii_participant(
    db: AsyncSession, study: Study, statement: Statement
) -> Participant:
    """Seed a participant carrying the full PII menagerie + a card comment."""
    p = Participant(
        study_id=study.id,
        session_token=uuid4(),
        language_used="en",
        status=ParticipantStatus.completed,
        consent_hash="abc123",
        consented_at=datetime.now(timezone.utc),
        submitted_at=datetime.now(timezone.utc),
        ip_address="hashed-ip-placeholder",
        user_agent="mobile:hashed-ua-placeholder",
        confirmation_code="CONFIRM1",
        resume_code="swift-river-42",
        presort_answers={"age": 42},
        postsort_answers={"general_comment": "I might be John Smith"},
        draft_responses=None,
        last_step_reached=5,
        last_step_reached_at=datetime.now(timezone.utc),
    )
    db.add(p)
    await db.flush()
    entry = QSortEntry(
        participant_id=p.id,
        statement_id=statement.id,
        grid_score=0,
        card_comment="My address is 12 Main St (revealing detail)",
    )
    db.add(entry)
    await db.commit()
    await db.refresh(p)
    return p


# -----------------------------------------------------------------------------
# F-05-002 — hash_user_agent unit
# -----------------------------------------------------------------------------


class TestHashUserAgent:
    """Pin the format and determinism of ``hash_user_agent``."""

    def test_returns_none_for_none(self) -> None:
        assert hash_user_agent(None) is None

    def test_returns_none_for_empty_string(self) -> None:
        # Mirrors hash_ip's "no value → no hash" semantics.
        assert hash_user_agent("") is None

    def test_format_is_class_colon_hex(self) -> None:
        """The format is "<device_class>:<hex>" (no separator collisions)."""
        result = hash_user_agent("Mozilla/5.0 (X11; Linux x86_64)")
        assert result is not None
        klass, _, digest = result.partition(":")
        assert klass in ("mobile", "desktop")
        assert all(c in "0123456789abcdef" for c in digest)
        assert len(digest) == 56

    def test_iphone_classified_mobile(self) -> None:
        result = hash_user_agent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        )
        assert result is not None
        assert result.startswith("mobile:")

    def test_android_classified_mobile(self) -> None:
        result = hash_user_agent(
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"
        )
        assert result is not None
        assert result.startswith("mobile:")

    def test_desktop_chrome_classified_desktop(self) -> None:
        result = hash_user_agent(
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)"
        )
        assert result is not None
        assert result.startswith("desktop:")

    def test_deterministic_for_same_input(self) -> None:
        """Same UA → same hash (so dedup heuristics on hashed UA work)."""
        ua = "Mozilla/5.0 (X11; Linux x86_64)"
        assert hash_user_agent(ua) == hash_user_agent(ua)

    def test_uses_ip_hash_salt_env_var(self) -> None:
        """A different salt produces a different hash."""
        ua = "Mozilla/5.0 (X11; Linux x86_64)"
        old_salt = os.getenv("IP_HASH_SALT")
        try:
            os.environ["IP_HASH_SALT"] = "salt-A"
            hash_a = hash_user_agent(ua)
            os.environ["IP_HASH_SALT"] = "salt-B"
            hash_b = hash_user_agent(ua)
            assert hash_a != hash_b
        finally:
            if old_salt is None:
                os.environ.pop("IP_HASH_SALT", None)
            else:
                os.environ["IP_HASH_SALT"] = old_salt

    def test_hash_does_not_contain_raw_ua_substring(self) -> None:
        """Defence-in-depth: a recognisable UA token (the model name)
        must not survive into the hash output.
        """
        ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
        result = hash_user_agent(ua)
        assert result is not None
        # The raw UA fragment must not be present in the hash output.
        assert "Mozilla" not in result
        assert "iPhone" not in result
        assert "OS X" not in result


# -----------------------------------------------------------------------------
# F-05-002 — write-time hashing (entry-point invariant)
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
class TestWriteTimeHashing:
    """The ``record_consent`` and ``process_submission`` entry points must
    persist the UA only after ``hash_user_agent``.
    """

    async def test_record_consent_hashes_user_agent(
        self, db: AsyncSession
    ) -> None:
        from app.services.submission_service import SubmissionService

        # Seed a study to consent against.
        study, _ = await _seed_study_with_one_statement(db)
        # Seed the StudyTranslation row (record_consent reads study via
        # StudyService.get_study_by_slug which selectinloads translations
        # and statements; an empty translations relationship is fine).
        session_token = uuid4()
        ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
        await SubmissionService.record_consent(
            db,
            study_slug=study.slug,
            session_token=session_token,
            language_code="en",
            consent_hash="ch",
            ip_address="1.2.3.4",
            user_agent=ua,
        )

        # The participant row must NOT contain the raw UA.
        result = await db.execute(
            select(Participant).where(Participant.session_token == session_token)
        )
        participant = result.scalar_one()
        assert participant.user_agent is not None
        assert participant.user_agent.startswith("mobile:"), (
            f"UA must be hashed with device-class prefix, got {participant.user_agent!r}"
        )
        # Defence-in-depth: no raw UA fragment leaked into the column.
        assert "Mozilla" not in participant.user_agent
        assert "iPhone" not in participant.user_agent
        # And the hashed value matches the documented format end-to-end.
        assert participant.user_agent == hash_user_agent(ua)

    async def test_record_consent_handles_none_user_agent(
        self, db: AsyncSession
    ) -> None:
        """A request without a User-Agent header → ``user_agent IS NULL``
        on the row (mirrors the pre-fix behaviour for absent UA)."""
        from app.services.submission_service import SubmissionService

        study, _ = await _seed_study_with_one_statement(db)
        session_token = uuid4()
        await SubmissionService.record_consent(
            db,
            study_slug=study.slug,
            session_token=session_token,
            language_code="en",
            consent_hash="ch",
            ip_address="1.2.3.4",
            user_agent=None,
        )
        result = await db.execute(
            select(Participant).where(Participant.session_token == session_token)
        )
        assert result.scalar_one().user_agent is None


# -----------------------------------------------------------------------------
# Anonymisation pipeline — the full PII sweep
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAnonymisationPipeline:
    """``StudyDataService.anonymise_participant`` clears every PII column
    enumerated in §2.4 of the wave doc. The single permitted survivor is
    ``qsort_entries.card_comment`` (F-05-003 — observation, operator
    screening obligation).
    """

    async def test_clears_all_pii_columns(self, db: AsyncSession) -> None:
        study, statement = await _seed_study_with_one_statement(db)
        participant = await _seed_full_pii_participant(db, study, statement)
        original_token = participant.session_token

        await StudyDataService.anonymise_participant(db, participant)

        await db.refresh(participant)
        # Direct PII — every one of these was set in the seed.
        assert participant.ip_address is None
        assert participant.user_agent is None
        assert participant.confirmation_code is None
        assert participant.resume_code is None
        assert participant.consent_hash is None
        assert participant.draft_responses is None
        # Free-text answer blobs cleared (set to {} per service docstring).
        assert participant.presort_answers == {}
        assert participant.postsort_answers == {}
        # Session token rotated → original token can never re-access.
        assert participant.session_token != original_token
        # Anonymisation marker set.
        assert participant.anonymised_at is not None

    async def test_card_comment_preserved_as_research_data(
        self, db: AsyncSession
    ) -> None:
        """F-05-003 observation: ``qsort_entries.card_comment`` is the
        documented survivor — research data flagged in the consent text
        as "screened to remove revealing details" (operator obligation).
        This regression pins the current behaviour so any future
        accidental wipe surfaces in CI.
        """
        study, statement = await _seed_study_with_one_statement(db)
        participant = await _seed_full_pii_participant(db, study, statement)

        await StudyDataService.anonymise_participant(db, participant)

        # Re-fetch the surviving qsort entry by participant id (the
        # session token has been rotated; we use participant.id which
        # is stable through anonymisation).
        result = await db.execute(
            select(QSortEntry).where(QSortEntry.participant_id == participant.id)
        )
        entries = result.scalars().all()
        assert len(entries) == 1
        # The comment is preserved verbatim — operator obligation.
        assert (
            entries[0].card_comment
            == "My address is 12 Main St (revealing detail)"
        )

    async def test_idempotent_no_op_on_already_anonymised(
        self, db: AsyncSession
    ) -> None:
        study, statement = await _seed_study_with_one_statement(db)
        participant = await _seed_full_pii_participant(db, study, statement)

        await StudyDataService.anonymise_participant(db, participant)
        first_anon_at = participant.anonymised_at
        first_token = participant.session_token

        # Second call is a no-op (anonymised_at not bumped, token not rotated again).
        await StudyDataService.anonymise_participant(db, participant)
        await db.refresh(participant)
        assert participant.anonymised_at == first_anon_at
        assert participant.session_token == first_token
