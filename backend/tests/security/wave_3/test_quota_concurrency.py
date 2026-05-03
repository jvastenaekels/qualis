# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 3 Task 9 — Quota state under concurrent member-add.

The member quota check at
``app.services.quotas.assert_can_add_member`` (and the symmetric
``assert_can_create_owned_project``) follows the canonical
check-then-insert pattern:

1. ``SELECT COUNT(*) FROM project_members WHERE project_id = X``
2. If count >= limit: raise QuotaExceeded.
3. Caller inserts a new ProjectMember row.

There is **no row-level lock** between steps 1 and 3:

- No ``with_for_update()`` on the count query.
- No advisory lock (``pg_advisory_xact_lock``) on the project id.
- No serialisable isolation level escalation.

Two concurrent invitation-accepts on the same project, both running
when ``count = limit - 1``, both observe ``count - 1`` in step 1 and
both pass step 2; both inserts then commit and the project lands at
``count = limit + 1``. This is a classic TOCTOU race.

**Severity: minor.** The quota cap on Qualis is configured per-deployment
(``MAX_MEMBERS_PER_PROJECT`` defaults to ``0`` which means unlimited)
and is not billing- or licensing-relevant for the open-source
deployment. The race over-fills by 1 per concurrent burst, which is
recoverable (the operator can remove the extra member). The fix —
either ``SELECT … FOR UPDATE`` on a project-level lock row, or a partial
unique index that caps the row count — is out of scope for Wave 3 and
deferred to the backlog (Task 10).

**Concurrency simulation note.** The in-process httpx test client
serialises through a single ``AsyncSession`` (the ``db`` fixture); we
cannot simulate true PostgreSQL concurrency from inside one test. We
therefore document the TOCTOU pattern via static-analysis assertions
and an *interleaved-count* simulation that demonstrates the race
window without actually firing concurrent connections.

Status: filed as F-04-006 (minor — quota TOCTOU, no row-level lock).
"""

from __future__ import annotations

import inspect

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProjectMember, ProjectRole
from app.services import quotas

from .conftest import TenancyFixtures


class TestQuotaTOCTOU:
    """Static + behavioural evidence for the quota TOCTOU race."""

    def test_count_helper_does_not_lock_rows(self) -> None:
        """``_count_members`` must NOT use ``with_for_update`` today.

        This is a deliberately negative pin: it documents the *current*
        behaviour. When the race is fixed (e.g. by moving the check
        into a SELECT … FOR UPDATE on a sentinel row), this test must
        be flipped to assert the new locking semantics — that's the
        signal the fix landed.
        """
        source = inspect.getsource(quotas._count_members)
        assert "with_for_update" not in source, (
            "If with_for_update has been added to _count_members, the TOCTOU "
            "fix has landed — flip this assertion and update F-04-006."
        )
        assert "advisory" not in source.lower(), (
            "If an advisory lock has been added, flip this assertion."
        )

    def test_assert_can_add_member_uses_unguarded_count(self) -> None:
        """Source of ``assert_can_add_member`` must call ``_count_members``
        without surrounding lock acquisition. Pinned to catch any
        accidental rewrite that only changes a comment but leaves the
        race in place.
        """
        source = inspect.getsource(quotas.assert_can_add_member)
        assert "_count_members" in source
        assert "with_for_update" not in source
        assert "advisory" not in source.lower()

    @pytest.mark.asyncio
    async def test_interleaved_counts_demonstrate_race_window(
        self,
        tenancy: TenancyFixtures,
        db: AsyncSession,
    ) -> None:
        """Demonstrate the race window without firing concurrent connections.

        We seed the project to exactly ``limit - 1`` members (3 already
        from the fixture; we set the in-test limit to 4). Two
        sequential calls to ``_count_members`` in quick succession both
        observe ``count = 3``, which would let two adds slip through
        in the real concurrent case. The point of this test is not to
        fail (it asserts the unsafe behaviour holds) but to make the
        race visible and to break loud if a future commit accidentally
        introduces a side effect.
        """
        # Capture the count twice without an intervening insert.
        count_1 = await quotas._count_members(db, tenancy.project_a.id)
        count_2 = await quotas._count_members(db, tenancy.project_a.id)
        assert count_1 == count_2 == 3, (
            f"Fixture seeds 3 project_a members; saw {count_1}, {count_2}"
        )

        # Now insert a fourth member directly via the ORM (mimicking the
        # second leg of one of the racing requests).
        from app.models import User

        # Create an extra user we can add to the project.
        from datetime import datetime, timezone
        from app.utils.security import get_password_hash

        extra_user = User(
            email="extra-quota-test@example.com",
            hashed_password=get_password_hash("pw"),
            email_verified_at=datetime.now(timezone.utc),
        )
        db.add(extra_user)
        await db.flush()
        db.add(
            ProjectMember(
                project_id=tenancy.project_a.id,
                user_id=extra_user.id,
                role=ProjectRole.member,
            )
        )
        await db.commit()

        # Now an immediate re-count sees 4 — but the *cached* count_1/count_2
        # from before the insert was 3. In a real concurrent race, both
        # branches would have already passed the check on count_1 = 3
        # against limit = 4 and would both insert, ending at 5.
        count_after = await quotas._count_members(db, tenancy.project_a.id)
        assert count_after == 4

        # The race-window demonstration: the gap between count_1 and
        # count_after is the window in which a second concurrent
        # request would also see ``count_1`` and pass the check.
        # No DB-level constraint stops a 5th insert.

    def test_db_has_no_uniqueness_constraint_capping_member_count(self) -> None:
        """Belt-and-suspenders: ProjectMember has only a (project_id, user_id)
        unique constraint — no row-count cap at the DB layer.

        If a future schema change adds a partial-unique-index quota cap,
        flip this assertion.
        """
        from app.models import ProjectMember as PM

        constraints = {c.name for c in PM.__table__.constraints}
        # The (project_id, user_id) uniqueness is fine — that's what
        # prevents double-membership. A row-count cap would have to be
        # implemented as a CHECK or trigger or an external counter.
        assert not any("count" in (c or "").lower() for c in constraints), (
            "If a count-capping constraint has been added, the TOCTOU race "
            "has been fixed at the DB layer. Update F-04-006."
        )

    def test_owned_project_quota_uses_same_unguarded_pattern(self) -> None:
        """Symmetric finding: ``assert_can_create_owned_project`` has the
        same race shape (per-user owned-project count). Pinned so the
        finding stays comprehensive.
        """
        source = inspect.getsource(quotas.assert_can_create_owned_project)
        assert "_count_owned_projects" in source
        assert "with_for_update" not in source
        assert "advisory" not in source.lower()
