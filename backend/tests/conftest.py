# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.


"""Pytest configuration and fixtures."""

import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root so TEST_DATABASE_URL is available
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

# Set testing environment variable BEFORE app modules are imported
os.environ["TESTING"] = "true"
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.database import Base, get_db

# Import app modules - careful with relative imports if running from root
from app.main import app
from app.models import (
    Statement,
    StatementTranslation,
    Study,
    StudyState,
    StudyTranslation,
    User,
    Project,
    ProjectMember,
    ProjectRole,
)
from app.utils.security import get_password_hash

# Test Data
TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "testpassword"

# Use PostgreSQL for testing.
# Set TEST_DATABASE_URL in your .env file (project root) or environment.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/qualis_test",
)


@pytest_asyncio.fixture
async def db_engine():
    """Create a fresh database engine for each test."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
    )
    yield engine
    await engine.dispose()


_ENUM_TYPES = (
    "studystate",
    "participantstatus",
    "recruitmentlinktype",
    "concourseitemstatus",
    "distributionmode",
    "projectrole",
    "memoparenttype",
)


async def _reset_schema(conn: AsyncConnection) -> None:
    """Drop all tables then all custom ENUM types, then recreate.

    SQLAlchemy's ``drop_all`` drops tables but silently skips PostgreSQL ENUM
    types when those types are not referenced by any surviving table (e.g.
    after a previous test left a dirty DB).  The stale ENUMs then make the
    next ``create_all`` fail with ``duplicate key value violates unique
    constraint "pg_type_typname_nsp_index"``.  We drop them explicitly with
    ``IF EXISTS … CASCADE`` between the two DDL phases.
    """
    await conn.run_sync(Base.metadata.drop_all)
    for type_name in _ENUM_TYPES:
        await conn.execute(text(f"DROP TYPE IF EXISTS {type_name} CASCADE"))
    await conn.run_sync(lambda sync_conn: Base.metadata.create_all(sync_conn, checkfirst=True))


@pytest_asyncio.fixture
async def db(db_engine):
    """Create a fresh database session for each test."""
    # Drop any leftover schema from previous tests (especially Alembic-driven
    # tests like test_memo_migration that bypass this fixture and leave the
    # studies/users/etc tables in their migration-frozen state — without
    # the latest model columns). Also explicitly drops ENUM types which
    # ``drop_all`` skips, to avoid duplicate-type errors on the next
    # ``create_all`` (see ``_reset_schema`` for details).
    async with db_engine.begin() as conn:
        await _reset_schema(conn)

    # Create session factory bound to this engine
    TestingSessionLocal = async_sessionmaker(
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        bind=db_engine,
        class_=AsyncSession,
    )

    async with TestingSessionLocal() as session:
        yield session

    # Drop tables and ENUM types — symmetric with setup so the next test
    # starts from a truly clean slate.
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        for type_name in _ENUM_TYPES:
            await conn.execute(text(f"DROP TYPE IF EXISTS {type_name} CASCADE"))


@pytest_asyncio.fixture
async def client(db):
    # Dependency Override
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    # We use http://testserver as base URL
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as c:
        yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db: AsyncSession):
    """Create a test user for auth tests."""
    hashed = get_password_hash(TEST_PASSWORD)
    user = User(
        email=TEST_EMAIL,
        hashed_password=hashed,
        email_verified_at=datetime.now(timezone.utc),  # T10: gate-aware fixture
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_project(db: AsyncSession, test_user: User):
    """Create a test project and add test_user as owner."""
    proj = Project(title="Test Project", slug="test-project")
    db.add(proj)
    await db.flush()

    member = ProjectMember(
        project_id=proj.id, user_id=test_user.id, role=ProjectRole.owner
    )
    db.add(member)
    await db.commit()
    await db.refresh(proj)
    return proj


@pytest_asyncio.fixture
async def seed_study(db, test_user, test_project):
    """Seeds a complete study with statements and configs."""
    # 2. Study
    grid_config = [
        {"score": -1, "capacity": 1},
        {"score": 0, "capacity": 2},
        {"score": 1, "capacity": 1},
    ]
    # Total capacity = 4 cards

    study = Study(
        slug="test-study",
        project_id=test_project.id,
        state=StudyState.draft,  # Use draft for update tests
        grid_config=grid_config,
        presort_config={
            "age": {"type": "number", "label": {"en": "Age"}, "required": True},
            "gender": {
                "type": "select",
                "options": [{"value": "M", "label": {"en": "Male"}}],
                "label": {"en": "Gender"},
                "required": False,
            },
        },
        postsort_config={
            "extreme_columns": [-1, 1],
            "ask_missing": False,
            "ask_general_comment": True,
        },
    )
    db.add(study)
    await db.flush()

    # 3. Translation
    trans = StudyTranslation(
        study_id=study.id,
        language_code="en",
        title="Test Study",
        description="Desc",
        instructions="Instr",
        consent_title="Consent",
        consent_description="Legal",
    )
    db.add(trans)

    # 4. Statements (Need 4 to match grid capacity)
    statements = []
    for i in range(1, 5):
        s = Statement(study_id=study.id, code=f"S{i}")
        db.add(s)
        await db.flush()

        st = StatementTranslation(
            statement_id=s.id, language_code="en", text=f"Statement {s.code}"
        )
        db.add(st)
        statements.append(s)

    await db.commit()

    # Reload with eager loaded statements for tests
    stmt = (
        select(Study)
        .where(Study.id == study.id)
        .options(selectinload(Study.statements))
    )
    result = await db.execute(stmt)
    study = result.scalar_one()

    return study


@pytest_asyncio.fixture
async def user_factory(db: AsyncSession):
    """Factory to create dynamic test users."""

    async def _create_user(
        email: str | None = None, password: str = TEST_PASSWORD
    ) -> User:
        import uuid

        email = email or f"user_{uuid.uuid4()}@example.com"
        hashed = get_password_hash(password)
        user = User(
            email=email,
            hashed_password=hashed,
            email_verified_at=datetime.now(timezone.utc),  # T10: gate-aware default
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    return _create_user


@pytest_asyncio.fixture
async def project_factory(db: AsyncSession):
    """Factory to create projects with specific owners."""

    async def _create_project(owner: User, title: str | None = None) -> Project:
        import uuid

        title = title or f"Project {uuid.uuid4()}"
        proj = Project(title=title, slug=f"proj-{uuid.uuid4()}")
        db.add(proj)
        await db.flush()

        member = ProjectMember(
            project_id=proj.id, user_id=owner.id, role=ProjectRole.owner
        )
        db.add(member)
        await db.commit()
        await db.refresh(proj)
        return proj

    return _create_project


@pytest_asyncio.fixture
async def study_factory(db: AsyncSession):
    """Factory to create studies for specific projects."""

    async def _create_study(
        project: Project, owner: User, title: str | None = None
    ) -> Study:
        import uuid

        slug = f"study-{uuid.uuid4()}"
        study = Study(
            slug=slug,
            project_id=project.id,
            state=StudyState.draft,  # Use draft for update tests
            grid_config=[{"score": 0, "capacity": 1}],
            presort_config={},
            postsort_config={},
        )
        db.add(study)
        await db.commit()
        await db.refresh(study)

        # Add minimal translation
        trans = StudyTranslation(
            study_id=study.id,
            language_code="en",
            title=title or "Test Study",
            description="Desc",
            instructions="Instr",
            consent_title="Yes",
            consent_description="Legal",
        )
        db.add(trans)
        await db.commit()
        return study

    return _create_study


@pytest_asyncio.fixture
async def regular_user(db: AsyncSession) -> User:
    """Lightweight user for auth-flow tests that don't need project context.
    Uses a distinct email/password so it never conflicts with ``test_user``,
    which anchors the heavier ``test_project`` / ``seed_study`` fixture chain.
    Use ``test_user`` instead when the test needs project membership."""
    hashed = get_password_hash("regular-pw")
    user = User(
        email="regular@example.com",
        hashed_password=hashed,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def regular_user_token(regular_user: User) -> str:
    """Bearer token (string, no header dict) for ``regular_user``.
    Generated via the production ``create_access_token`` helper so ``iat`` is
    populated correctly and the token behaves exactly like one minted by the
    live /api/token login path."""
    from datetime import timedelta

    from app.utils.security import create_access_token

    return create_access_token(
        subject=regular_user.email, expires_delta=timedelta(minutes=30)
    )


@pytest_asyncio.fixture
async def totp_user(db: AsyncSession) -> User:
    """A user with app-channel TOTP enabled (password: 'totp-pw')."""
    hashed = get_password_hash("totp-pw")
    user = User(
        email="totp@example.com",
        hashed_password=hashed,
        email_verified_at=datetime.now(timezone.utc),
        is_totp_enabled=True,
        totp_channel="app",
        totp_secret="JBSWY3DPEHPK3PXP",  # valid base32 dummy — never verified in this test
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def superuser(db: AsyncSession) -> User:
    """An active superuser with TOTP enabled (password: 'super-pw').

    Distinct email from ``regular_user``/``totp_user`` so it never collides.
    2FA is enabled so this user can itself be a promotion target if needed
    and so it satisfies any future "superuser must have 2FA" invariant."""
    hashed = get_password_hash("super-pw")
    user = User(
        email="super@example.com",
        hashed_password=hashed,
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
        is_superuser=True,
        is_totp_enabled=True,
        totp_channel="app",
        totp_secret="JBSWY3DPEHPK3PXP",  # valid base32 dummy — never verified here
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def superuser_token(superuser: User) -> str:
    """Bearer token (string, no header dict) for ``superuser``.
    Generated via the production ``create_access_token`` helper so ``iat`` is
    populated correctly and the token behaves exactly like one minted by the
    live /api/token login path."""
    from datetime import timedelta

    from app.utils.security import create_access_token

    return create_access_token(
        subject=superuser.email, expires_delta=timedelta(minutes=30)
    )


@pytest_asyncio.fixture
async def second_superuser(db: AsyncSession) -> User:
    """A second active superuser with TOTP enabled (password: 'super2-pw').

    Distinct email from ``superuser`` (super@example.com) so both can coexist
    in the same test transaction. Used by tests that need ≥2 active superusers
    to verify the at-least-one-active-superuser floor allows a demotion when
    a spare remains."""
    hashed = get_password_hash("super2-pw")
    user = User(
        email="super2@example.com",
        hashed_password=hashed,
        email_verified_at=datetime.now(timezone.utc),
        is_active=True,
        is_superuser=True,
        is_totp_enabled=True,
        totp_channel="app",
        totp_secret="JBSWY3DPEHPK3PXP",  # valid base32 dummy — never verified here
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def second_superuser_token(second_superuser: User) -> str:
    """Bearer token (string, no header dict) for ``second_superuser``.
    Mirrors the ``superuser_token`` pattern exactly."""
    from datetime import timedelta

    from app.utils.security import create_access_token

    return create_access_token(
        subject=second_superuser.email, expires_delta=timedelta(minutes=30)
    )


@pytest_asyncio.fixture
def auth_token_factory():
    """Create JWT token for a user."""
    from datetime import timedelta

    from app.utils.security import create_access_token

    def _create_token(user: User):
        token = create_access_token(
            subject=user.email, expires_delta=timedelta(minutes=30)
        )
        return {"Authorization": f"Bearer {token}"}

    return _create_token


@pytest_asyncio.fixture
async def project_member_factory(db: AsyncSession):
    """Factory to add users as members of a project."""
    from app.models import ProjectMember, ProjectRole

    async def _add_member(
        project: Project, user: User, role: ProjectRole
    ) -> None:
        member = ProjectMember(
            project_id=project.id,
            user_id=user.id,
            role=role,
        )
        db.add(member)
        await db.commit()

    return _add_member


@pytest_asyncio.fixture
async def active_study(db, seed_study):
    """Convert seed_study to active state for submission tests."""
    seed_study.state = StudyState.active
    await db.commit()
    await db.refresh(seed_study)
    return seed_study


@pytest_asyncio.fixture
async def seed_user_id(test_user: User) -> int:
    """Return the int PK of the seeded test user."""
    return test_user.id


@pytest_asyncio.fixture
async def seed_study_id(seed_study: Study) -> int:
    """Return the int PK of the seeded study (convenience alias)."""
    return seed_study.id


@pytest_asyncio.fixture
async def seed_other_user_id(db: AsyncSession) -> int:
    """Return the int PK of a second distinct user (no project membership required for T4)."""
    hashed = get_password_hash("otherpassword")
    user = User(
        email="other@example.com",
        hashed_password=hashed,
        email_verified_at=datetime.now(timezone.utc),  # T10: gate-aware default
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user.id


@pytest_asyncio.fixture
async def seed_concourse_id(db: AsyncSession, test_project: Project, test_user: User) -> int:
    """Return the int PK of a concourse owned by test_project."""
    from app.models import Concourse

    concourse = Concourse(
        project_id=test_project.id,
        title="Seed Concourse",
        description="For memo tests",
        created_by=test_user.id,
    )
    db.add(concourse)
    await db.commit()
    await db.refresh(concourse)
    return concourse.id


@pytest_asyncio.fixture
async def seed_project_id(test_project: Project) -> int:
    """Return the int PK of the test project (for memo comment tests)."""
    return test_project.id


@pytest_asyncio.fixture
async def seed_entry_id(
    db: AsyncSession, seed_concourse_id: int, seed_user_id: int
) -> int:
    """Return the int PK of a MemoEntry linked to the seed concourse."""
    from app.models import MemoParentType
    from app.services.memo_service import MemoService

    entry = await MemoService.add_entry(
        db,
        parent_type=MemoParentType.concourse,
        parent_id=seed_concourse_id,
        title="Seed Entry",
        body="seed body",
        user_id=seed_user_id,
    )
    return entry.id


@pytest_asyncio.fixture
def auth_headers_for_seed_user(test_user: User) -> dict[str, str]:
    """Bearer token for the seed user (project owner — passes member+ checks)."""
    from app.utils.security import create_access_token
    from datetime import timedelta

    token = create_access_token(
        subject=test_user.email, expires_delta=timedelta(minutes=30)
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def auth_headers_for_viewer(
    db: AsyncSession, test_project: Project
) -> dict[str, str]:
    """Bearer token for a viewer-role member of the seed project."""
    import uuid
    from datetime import timedelta

    from app.utils.security import create_access_token, get_password_hash

    email = f"viewer_{uuid.uuid4()}@example.com"
    viewer = User(
        email=email,
        hashed_password=get_password_hash("viewerpassword"),
        email_verified_at=datetime.now(timezone.utc),  # T10: gate-aware default
    )
    db.add(viewer)
    await db.flush()

    member = ProjectMember(
        project_id=test_project.id,
        user_id=viewer.id,
        role=ProjectRole.viewer,
    )
    db.add(member)
    await db.commit()

    token = create_access_token(
        subject=email, expires_delta=timedelta(minutes=30)
    )
    return {"Authorization": f"Bearer {token}"}
