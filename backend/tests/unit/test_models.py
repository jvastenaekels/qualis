"""Unit tests for SQLAlchemy models."""

from datetime import datetime, timedelta, timezone

import pytest

from app.models import (
    SESSION_TTL_DAYS,
    Participant,
    ParticipantStatus,
    Study,
    StudyState,
    User,
)


@pytest.mark.asyncio
async def test_study_default_state(db, test_project):
    """Test that a new study defaults to 'draft' state when persisted."""
    study = Study(
        slug="test-default",
        project_id=test_project.id,
        grid_config={},
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()
    # Now default should be applied by SQLAlchemy
    assert study.state == StudyState.draft


@pytest.mark.asyncio
async def test_study_new_fields(db, test_project):
    """Test show_statement_codes and default_language in Study model."""
    study = Study(
        slug="test-fields",
        project_id=test_project.id,
        grid_config={},
        presort_config={},
        postsort_config={},
        default_language="fi",
        show_statement_codes=True,
    )
    db.add(study)
    await db.commit()

    # Reload
    from sqlalchemy import select

    result = await db.execute(select(Study).where(Study.slug == "test-fields"))
    reloaded = result.scalar_one()
    assert reloaded.default_language == "fi"
    assert reloaded.show_statement_codes is True


class TestParticipantIsExpired:
    """Pure-property regression net for ``Participant.is_expired`` (audit I).

    The property gates the resume endpoint (410) and submission service
    (ValidationError); it had zero direct coverage. These tests pin every
    branch in-memory (no DB) so a regression in the completed short-circuit,
    the timestamp fallback chain, or the naive/aware tz handling is caught.
    """

    @staticmethod
    def _participant(**kwargs: object) -> Participant:
        # Construct in-memory; column server-defaults (status, created_at) are
        # not applied without a flush, so every attribute under test is set
        # explicitly by the caller.
        return Participant(study_id=1, **kwargs)

    def test_completed_session_never_expires(self):
        """A completed session is never expired, even with an ancient timestamp."""
        ancient = datetime.now(timezone.utc) - timedelta(days=SESSION_TTL_DAYS * 10)
        p = self._participant(
            status=ParticipantStatus.completed,
            last_step_reached_at=ancient,
            created_at=ancient,
        )
        assert p.is_expired is False

    def test_recent_activity_not_expired(self):
        """A started session active within the TTL window is not expired."""
        recent = datetime.now(timezone.utc) - timedelta(days=SESSION_TTL_DAYS - 1)
        p = self._participant(
            status=ParticipantStatus.started,
            last_step_reached_at=recent,
        )
        assert p.is_expired is False

    def test_stale_last_step_expired(self):
        """A started session inactive beyond the TTL is expired."""
        stale = datetime.now(timezone.utc) - timedelta(days=SESSION_TTL_DAYS + 1)
        p = self._participant(
            status=ParticipantStatus.started,
            last_step_reached_at=stale,
        )
        assert p.is_expired is True

    def test_falls_back_to_consented_at(self):
        """With no last_step_reached_at, a stale consented_at drives expiry."""
        stale = datetime.now(timezone.utc) - timedelta(days=SESSION_TTL_DAYS + 1)
        p = self._participant(
            status=ParticipantStatus.started,
            last_step_reached_at=None,
            consented_at=stale,
        )
        assert p.is_expired is True

    def test_falls_back_to_created_at(self):
        """With no activity/consent timestamps, a stale created_at drives expiry."""
        stale = datetime.now(timezone.utc) - timedelta(days=SESSION_TTL_DAYS + 1)
        p = self._participant(
            status=ParticipantStatus.started,
            last_step_reached_at=None,
            consented_at=None,
            created_at=stale,
        )
        assert p.is_expired is True

    def test_no_timestamps_not_expired(self):
        """No reference timestamp at all → cannot be expired (returns False)."""
        p = self._participant(
            status=ParticipantStatus.started,
            last_step_reached_at=None,
            consented_at=None,
            created_at=None,
        )
        assert p.is_expired is False

    def test_naive_datetime_from_db_is_handled(self):
        """A naive (tz-less) timestamp — as some DB drivers return — is compared
        correctly rather than raising a naive/aware comparison TypeError."""
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        stale_naive = now_naive - timedelta(days=SESSION_TTL_DAYS + 1)
        assert stale_naive.tzinfo is None
        p = self._participant(
            status=ParticipantStatus.started,
            last_step_reached_at=stale_naive,
        )
        assert p.is_expired is True

        fresh_naive = now_naive - timedelta(days=1)
        p2 = self._participant(
            status=ParticipantStatus.started,
            last_step_reached_at=fresh_naive,
        )
        assert p2.is_expired is False


def test_user_hashing_placeholder():
    """Ensure User model handles passwords appropriately (integration point usually)."""
    u = User(email="a@b.com", hashed_password="hashed_secret")
    assert u.hashed_password == "hashed_secret"


class TestAuthEmailFlowModels:
    """Smoke tests for the auth-email-flows ORM models added in Task 1."""

    @pytest.mark.asyncio
    async def test_consumed_email_token_roundtrip(self, db):
        """ConsumedEmailToken can be inserted and queried by jti."""
        from app.models import ConsumedEmailToken
        from sqlalchemy import select

        token = ConsumedEmailToken(jti="test-jti-xyz", purpose="twofa_disable")
        db.add(token)
        await db.commit()

        result = await db.execute(
            select(ConsumedEmailToken).where(ConsumedEmailToken.jti == "test-jti-xyz")
        )
        row = result.scalar_one()
        assert row.purpose == "twofa_disable"
        assert row.consumed_at is not None  # server_default applied

    @pytest.mark.asyncio
    async def test_user_password_changed_at_defaults_to_now(self, db):
        """User.password_changed_at server_default fires on insert."""
        from app.models import User
        from app.utils.security import get_password_hash
        from sqlalchemy import select

        u = User(
            email="pwd-default-check@example.com",
            hashed_password=get_password_hash("x"),
            is_active=True,
        )
        db.add(u)
        await db.commit()

        result = await db.execute(
            select(User).where(User.email == "pwd-default-check@example.com")
        )
        row = result.scalar_one()
        assert row.password_changed_at is not None
        assert row.email_verified_at is None
        assert row.totp_channel is None
