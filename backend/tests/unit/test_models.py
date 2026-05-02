"""Unit tests for SQLAlchemy models."""

import pytest

from app.models import Study, StudyState, User


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
    async def test_twofa_email_otp_code_defaults(self, db, test_user):
        """TwoFAEmailOTPCode defaults attempts=0 and applies server-default created_at."""
        from datetime import datetime, timedelta, timezone
        from app.models import TwoFAEmailOTPCode
        from sqlalchemy import select

        code = TwoFAEmailOTPCode(
            user_id=test_user.id,
            code_hash="bcrypt$dummy",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        )
        db.add(code)
        await db.commit()

        result = await db.execute(
            select(TwoFAEmailOTPCode).where(TwoFAEmailOTPCode.user_id == test_user.id)
        )
        row = result.scalar_one()
        assert row.attempts == 0  # server_default
        assert row.used_at is None
        assert row.created_at is not None  # server_default

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
