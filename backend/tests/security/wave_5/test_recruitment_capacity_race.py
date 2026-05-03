# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""F-06-003 — Recruitment capacity gate uses SELECT FOR UPDATE.

Threat model
------------

A capacity-bound recruitment link (e.g. ``capacity=10``) must reject the
11th submission even under concurrent submission attempts. The naive
"check then increment" pattern is vulnerable to TOCTOU races: two
requests both read ``usage_count=9 < capacity=10``, both pass, both
increment, and the link ends with ``usage_count=11`` past its cap.

Post-fix invariant
------------------

``RecruitmentService.increment_usage`` runs the read under
``SELECT … FOR UPDATE`` (PostgreSQL row-level lock); any concurrent
caller blocks until the first commits, so the capacity guard cannot
slip. ``validate_link_token`` deliberately omits the capacity check
to avoid TOCTOU (the comment at lines 143-144 documents this).

This module pins the contract:

1. **`increment_usage` succeeds for the first N calls** (where
   N == capacity), then refuses every subsequent call.
2. **`validate_link_token` does not pre-gate on capacity** —
   capacity gating lives only in the atomic increment path.
3. **`increment_usage` uses `with_for_update()`** — static check
   that the lock primitive is in place; without it, the contract
   above would silently fail under concurrency.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Project,
    ProjectMember,
    ProjectRole,
    RecruitmentLink,
    RecruitmentLinkType,
    Study,
    StudyState,
    StudyTranslation,
    User,
)
from app.services.recruitment_service import RecruitmentService
from app.utils.security import get_password_hash


@pytest_asyncio.fixture
async def link_with_capacity(db: AsyncSession) -> tuple[Study, RecruitmentLink]:
    """Seed a study with a capacity-3 recruitment link."""
    user = User(
        email="cap@example.com",
        hashed_password=get_password_hash("pw"),
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()

    project = Project(title="cap-project", slug="cap-project")
    db.add(project)
    await db.flush()
    db.add(
        ProjectMember(project_id=project.id, user_id=user.id, role=ProjectRole.owner)
    )

    study = Study(
        slug="cap-study",
        project_id=project.id,
        state=StudyState.active,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()
    db.add(
        StudyTranslation(
            study_id=study.id,
            language_code="en",
            title="Cap Study",
            description="d",
            instructions="i",
            consent_title="c",
            consent_description="cd",
        )
    )
    await db.flush()

    link = RecruitmentLink(
        study_id=study.id,
        type=RecruitmentLinkType.individual,
        token="cap-token-abc",
        name="cap link",
        capacity=3,
        is_active=True,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return study, link


@pytest.mark.asyncio
class TestCapacityGate:
    """The atomic increment refuses the (capacity+1)-th call."""

    async def test_increment_succeeds_until_capacity(
        self,
        db: AsyncSession,
        link_with_capacity: tuple[Study, RecruitmentLink],
    ) -> None:
        _, link = link_with_capacity
        # 3 successful increments
        for _ in range(3):
            assert await RecruitmentService.increment_usage(db, link.id) is True
        await db.commit()
        await db.refresh(link)
        assert link.usage_count == 3

    async def test_increment_refuses_past_capacity(
        self,
        db: AsyncSession,
        link_with_capacity: tuple[Study, RecruitmentLink],
    ) -> None:
        _, link = link_with_capacity
        # Fill to capacity
        for _ in range(3):
            assert await RecruitmentService.increment_usage(db, link.id) is True
        # Next call must refuse
        assert await RecruitmentService.increment_usage(db, link.id) is False
        # And again — refusal is idempotent
        assert await RecruitmentService.increment_usage(db, link.id) is False
        await db.commit()
        await db.refresh(link)
        assert link.usage_count == 3, (
            f"usage_count must not advance past capacity; got {link.usage_count}"
        )


@pytest.mark.asyncio
class TestValidateDoesNotGateOnCapacity:
    """``validate_link_token`` deliberately skips capacity checks.

    The atomic gate in ``increment_usage`` is the single source of truth.
    A capacity check inside ``validate_link_token`` would re-introduce
    the TOCTOU window the FOR UPDATE pattern was added to close.
    """

    async def test_validate_returns_link_even_at_capacity(
        self,
        db: AsyncSession,
        link_with_capacity: tuple[Study, RecruitmentLink],
    ) -> None:
        study, link = link_with_capacity
        # Fill to capacity.
        for _ in range(3):
            assert await RecruitmentService.increment_usage(db, link.id) is True
        await db.commit()

        # validate_link_token must still return the link (not None) at
        # capacity — capacity gating is increment_usage's job.
        result = await RecruitmentService.validate_link_token(
            db, study_id=study.id, token=link.token
        )
        assert result is not None, (
            "validate_link_token must not pre-gate on capacity (TOCTOU); "
            "the atomic increment is the sole gate"
        )
        assert result.id == link.id


class TestImplementationContract:
    """Static guard on ``increment_usage``: must use SELECT FOR UPDATE."""

    def test_increment_uses_for_update_lock(self) -> None:
        import inspect

        source = inspect.getsource(RecruitmentService.increment_usage)
        assert "with_for_update" in source, (
            "RecruitmentService.increment_usage must use with_for_update() "
            "to take a row-level lock; without it, concurrent callers race "
            "the capacity check. Source preview:\n" + source[:600]
        )

    def test_validate_does_not_check_capacity(self) -> None:
        import inspect

        source = inspect.getsource(RecruitmentService.validate_link_token)
        # The comment "Capacity is enforced atomically in increment_usage()"
        # documents the deliberate omission. We assert the absence of a
        # capacity comparison in this function.
        assert "link.usage_count" not in source and "capacity" not in source.replace(
            "Capacity is enforced", ""
        ), (
            "validate_link_token must not check capacity (TOCTOU window); "
            "the atomic increment is the sole gate. Source:\n" + source
        )
