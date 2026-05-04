# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 4 Task 6 — Bulk export PII handling for anonymised participants
(F-05-006).

Pre-fix gap
-----------

Per Wave 4 inventory §2.2 (Promise 3 verdict) and §2.3 stage 6
("anonymised"):

- Bulk export queries (``exports.py:47, :98, :141``;
  ``study_data_service.py:168, :381``) filter on
  ``Participant.is_discarded.is_(False)`` only — they do **not**
  filter on ``Participant.anonymised_at IS NULL``.
- Anonymisation nulls ``ip_address``, ``user_agent``,
  ``confirmation_code``, ``resume_code``, ``consent_hash``,
  ``draft_responses``; clears ``presort_answers`` /
  ``postsort_answers`` to ``{}``; rotates the session token; and
  deletes audio recordings + S3 objects.
- BUT ``qsort_entries.card_comment`` is preserved (F-05-003
  observation: research data the consent text flags for operator
  screening before publication).

Decision rule applied
---------------------

- **Aggregate / analysis exports** (bulk CSV, PQMethod, R-Kit,
  research package, JSON dump, get_study_stats, get_study_sort_data):
  anonymised participants are KEPT. The export is used for factor
  analysis and the rows ride through with PII zeroed (the consent
  text's "may be quoted to contextualize ... screened to remove
  revealing details" wording covers card_comment as a
  researcher-screening obligation per F-05-003).
- **Per-participant follow-up exports** (per-participant CSV / JSON /
  audio): anonymised participants are EXCLUDED. These endpoints are
  individual-lookup channels used for support / follow-up. After
  anonymisation the row no longer represents an identifiable
  participant; presenting it as a follow-up target leaks the
  preserved ``card_comment`` and would be a UX trap (operator might
  treat an anonymised row as a contactable participant).

Severity
--------

**Minor.** The leak surface is admin-only (StudyRole.editor on the
study), and the operator who triggers anonymisation has explicitly
chosen to break contact with the participant. The fix is
defence-in-depth on the per-participant follow-up endpoints; the
bulk endpoints' inclusion of anonymised rows is the documented
contract (F-05-003).

Post-fix invariants
-------------------

For each participant in the test seed (one active, one anonymised):

1. ``GET /admin/studies/{slug}/export/csv`` includes BOTH rows.
   The anonymised row's IP_Hash, User_Agent, presort, postsort
   columns are blank. The ``S{n}_Comment`` column still carries
   the preserved ``card_comment`` (per F-05-003 observation).
2. ``GET /admin/studies/{slug}/export/pqmethod`` and
   ``GET /admin/studies/{slug}/export/r-kit`` include BOTH rows
   in the .dat / q_data.csv data matrix (analysis input).
3. ``GET /admin/studies/{slug}/dump`` returns BOTH participants
   (full study archive — researchers may inspect anonymised rows
   for QC).
4. ``GET /admin/studies/{slug}/participants/{anon_id}/export/csv``
   returns 404 (per-participant follow-up channel).
5. ``GET /admin/studies/{slug}/participants/{anon_id}/export/json``
   returns 404.
6. ``GET /admin/studies/{slug}/participants/{anon_id}/export/audio``
   returns 404 (also: anonymisation already deletes audio rows;
   the explicit filter keeps the contract uniform).
7. The active participant's per-participant endpoints still work
   (regression: the filter must not over-broaden the 404).
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Participant,
    ParticipantStatus,
    Project,
    ProjectMember,
    ProjectRole,
    QSortEntry,
    Statement,
    StatementTranslation,
    Study,
    StudyState,
    StudyTranslation,
    User,
)


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


async def _seed_owner(db: AsyncSession) -> User:
    """Seed a user with a verified email (gate-aware, like the global
    test_user fixture)."""
    user = User(
        email=f"owner-{uuid4().hex[:6]}@example.com",
        hashed_password="x" * 60,
        is_active=True,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


async def _seed_study_with_owner(
    db: AsyncSession, owner: User
) -> tuple[Project, Study, Statement]:
    project = Project(
        title=f"P-{uuid4().hex[:6]}",
        slug=f"p-{uuid4().hex[:6]}",
    )
    db.add(project)
    await db.flush()

    member = ProjectMember(
        project_id=project.id, user_id=owner.id, role=ProjectRole.owner
    )
    db.add(member)

    study = Study(
        slug=f"export-pii-{uuid4().hex[:6]}",
        project_id=project.id,
        state=StudyState.active,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()

    trans = StudyTranslation(
        study_id=study.id,
        language_code="en",
        title="Export PII Study",
        description="Desc",
        instructions="Instr",
        consent_title="Consent",
        consent_description="Legal",
    )
    db.add(trans)

    statement = Statement(study_id=study.id, code="S1")
    db.add(statement)
    await db.flush()

    st_trans = StatementTranslation(
        statement_id=statement.id, language_code="en", text="Statement 1"
    )
    db.add(st_trans)
    await db.commit()
    await db.refresh(study)
    await db.refresh(statement)
    return project, study, statement


async def _seed_active_participant(
    db: AsyncSession, study: Study, statement: Statement
) -> Participant:
    """An ordinary completed participant (not anonymised, not discarded)."""
    p = Participant(
        study_id=study.id,
        session_token=uuid4(),
        language_used="en",
        status=ParticipantStatus.completed,
        consent_hash="abc",
        consented_at=datetime.now(timezone.utc),
        submitted_at=datetime.now(timezone.utc),
        ip_address="hashed-ip-active",
        user_agent="mobile:hashed-ua-active",
        confirmation_code="CONFIRM1",
        presort_answers={"age": 30},
        postsort_answers={"comment": "active comment"},
    )
    db.add(p)
    await db.flush()
    db.add(
        QSortEntry(
            participant_id=p.id,
            statement_id=statement.id,
            grid_score=0,
            card_comment="active card comment",
        )
    )
    await db.commit()
    await db.refresh(p)
    return p


async def _seed_anonymised_participant(
    db: AsyncSession, study: Study, statement: Statement
) -> Participant:
    """A participant whose PII has been anonymised — anonymised_at is set,
    PII columns are cleared, but ``qsort_entries.card_comment`` is
    preserved per F-05-003 (operator screening obligation).
    """
    p = Participant(
        study_id=study.id,
        session_token=uuid4(),  # Already rotated post-anonymisation.
        language_used="en",
        status=ParticipantStatus.completed,
        consent_hash=None,  # Cleared.
        consented_at=datetime.now(timezone.utc),
        submitted_at=datetime.now(timezone.utc),
        anonymised_at=datetime.now(timezone.utc),
        ip_address=None,  # Cleared.
        user_agent=None,  # Cleared.
        confirmation_code=None,  # Cleared.
        resume_code=None,  # Cleared.
        presort_answers={},  # Cleared.
        postsort_answers={},  # Cleared.
        draft_responses=None,  # Cleared.
    )
    db.add(p)
    await db.flush()
    db.add(
        QSortEntry(
            participant_id=p.id,
            statement_id=statement.id,
            grid_score=0,
            # Preserved per F-05-003 — the operator-screening obligation.
            card_comment="My address is 12 Main St (revealing detail)",
        )
    )
    await db.commit()
    await db.refresh(p)
    return p


# -----------------------------------------------------------------------------
# F-05-006 — Bulk exports include anonymised participants (analysis path)
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
class TestBulkExportsIncludeAnonymisedRows:
    """Bulk exports are aggregate analysis inputs. Anonymised rows ride
    through with PII zeroed; the preserved ``card_comment`` is the
    operator-screening obligation pinned by F-05-003.
    """

    async def test_bulk_csv_includes_both_active_and_anonymised(
        self,
        client: AsyncClient,
        db: AsyncSession,
        auth_token_factory,
    ) -> None:
        owner = await _seed_owner(db)
        _, study, statement = await _seed_study_with_owner(db, owner)
        active = await _seed_active_participant(db, study, statement)
        anonymised = await _seed_anonymised_participant(db, study, statement)
        headers = auth_token_factory(owner)

        response = await client.get(
            f"/api/admin/studies/{study.slug}/export/csv", headers=headers
        )
        assert response.status_code == 200, response.text

        rows = list(csv.DictReader(io.StringIO(response.text)))
        # Both participants present.
        assert len(rows) == 2

        # Locate each row by Participant_UID (session_token, lower-cased
        # in the CSV via str(p.session_token)).
        active_row = next(
            r for r in rows if r["Participant_UID"] == str(active.session_token)
        )
        anon_row = next(
            r for r in rows if r["Participant_UID"] == str(anonymised.session_token)
        )

        # Active row carries PII (hashed) — ordinary export contract.
        assert active_row["IP_Hash"] == "hashed-ip-active"
        assert active_row["User_Agent"] == "mobile:hashed-ua-active"
        # Anonymised row's PII columns are blank.
        assert anon_row["IP_Hash"] == ""
        assert anon_row["User_Agent"] == ""
        assert anon_row["Confirmation_Code"] == ""

        # F-05-003 invariant: card_comment is preserved (operator
        # screening obligation, not a code-side bug).
        assert anon_row["S1_Comment"] == "My address is 12 Main St (revealing detail)"
        assert active_row["S1_Comment"] == "active card comment"

    async def test_bulk_pqmethod_includes_anonymised_in_data_matrix(
        self,
        client: AsyncClient,
        db: AsyncSession,
        auth_token_factory,
    ) -> None:
        """PQMethod .dat files are the factor-analysis input — anonymised
        rows must contribute their score vector."""
        import zipfile

        owner = await _seed_owner(db)
        _, study, statement = await _seed_study_with_owner(db, owner)
        await _seed_active_participant(db, study, statement)
        await _seed_anonymised_participant(db, study, statement)
        headers = auth_token_factory(owner)

        response = await client.get(
            f"/api/admin/studies/{study.slug}/export/pqmethod", headers=headers
        )
        assert response.status_code == 200, response.text

        with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
            dat_name = next(n for n in zf.namelist() if n.endswith(".dat"))
            dat_content = zf.read(dat_name).decode()
        # Header line + N_Users in the header should report 2 (both
        # active + anonymised).
        header_line = dat_content.splitlines()[0]
        # Header format: "{slug:8}{n_users:3}{n_items:3}".
        n_users_field = header_line[8:11].strip()
        assert n_users_field == "2", (
            f"Expected 2 users (active + anonymised) in PQM header, got {header_line!r}"
        )

    async def test_bulk_dump_includes_anonymised(
        self,
        client: AsyncClient,
        db: AsyncSession,
        auth_token_factory,
    ) -> None:
        """The JSON dump is the research archive — anonymised rows
        appear with PII zeroed."""
        owner = await _seed_owner(db)
        _, study, statement = await _seed_study_with_owner(db, owner)
        await _seed_active_participant(db, study, statement)
        await _seed_anonymised_participant(db, study, statement)
        headers = auth_token_factory(owner)

        response = await client.get(
            f"/api/admin/studies/{study.slug}/dump", headers=headers
        )
        assert response.status_code == 200, response.text
        data = response.json()
        # Both participants present in the archive dump.
        assert len(data["participants"]) == 2


# -----------------------------------------------------------------------------
# F-05-006 — Per-participant exports exclude anonymised rows (follow-up path)
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
class TestPerParticipantExportsExcludeAnonymised:
    """Per-participant exports are individual-lookup endpoints used in
    follow-up / support contexts. Anonymised rows must 404 to avoid
    leaking the preserved ``card_comment`` to a follow-up consumer
    and to avoid presenting the row as a contactable participant."""

    async def test_per_participant_csv_404s_for_anonymised(
        self,
        client: AsyncClient,
        db: AsyncSession,
        auth_token_factory,
    ) -> None:
        owner = await _seed_owner(db)
        _, study, statement = await _seed_study_with_owner(db, owner)
        anonymised = await _seed_anonymised_participant(db, study, statement)
        headers = auth_token_factory(owner)

        response = await client.get(
            f"/api/admin/studies/{study.slug}/participants/{anonymised.id}/export/csv",
            headers=headers,
        )
        assert response.status_code == 404, response.text

    async def test_per_participant_json_404s_for_anonymised(
        self,
        client: AsyncClient,
        db: AsyncSession,
        auth_token_factory,
    ) -> None:
        owner = await _seed_owner(db)
        _, study, statement = await _seed_study_with_owner(db, owner)
        anonymised = await _seed_anonymised_participant(db, study, statement)
        headers = auth_token_factory(owner)

        response = await client.get(
            f"/api/admin/studies/{study.slug}/participants/{anonymised.id}/export/json",
            headers=headers,
        )
        assert response.status_code == 404, response.text

    async def test_per_participant_audio_404s_for_anonymised(
        self,
        client: AsyncClient,
        db: AsyncSession,
        auth_token_factory,
    ) -> None:
        owner = await _seed_owner(db)
        _, study, statement = await _seed_study_with_owner(db, owner)
        anonymised = await _seed_anonymised_participant(db, study, statement)
        headers = auth_token_factory(owner)

        response = await client.get(
            f"/api/admin/studies/{study.slug}/participants/{anonymised.id}/export/audio",
            headers=headers,
        )
        assert response.status_code == 404, response.text

    async def test_per_participant_csv_works_for_active(
        self,
        client: AsyncClient,
        db: AsyncSession,
        auth_token_factory,
    ) -> None:
        """Regression: the new ``anonymised_at IS NULL`` filter must
        not over-broaden the 404 — non-anonymised rows still export."""
        owner = await _seed_owner(db)
        _, study, statement = await _seed_study_with_owner(db, owner)
        active = await _seed_active_participant(db, study, statement)
        headers = auth_token_factory(owner)

        response = await client.get(
            f"/api/admin/studies/{study.slug}/participants/{active.id}/export/csv",
            headers=headers,
        )
        assert response.status_code == 200, response.text
        # Header + 1 data row.
        rows = list(csv.DictReader(io.StringIO(response.text)))
        assert len(rows) == 1
        assert rows[0]["Participant_UID"] == str(active.session_token)
