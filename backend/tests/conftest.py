# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.


"""Pytest configuration and fixtures."""

import os
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

# Set testing environment variable BEFORE app matches are imported
os.environ["TESTING"] = "true"
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
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
    Workspace,
    WorkspaceMember,
    WorkspaceRole,
)
from app.utils.security import get_password_hash

# Test Data
TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "testpassword"

# Use PostgreSQL for testing
# We use the 'open_q' database as default since creating new databases
# (like 'open_q_test') might require superuser permissions not available in all environments.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://open_q_user:open-q-pwd@127.0.0.1:5432/open_q",
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


@pytest_asyncio.fixture
async def db(db_engine):
    """Create a fresh database session for each test."""
    # Create tables
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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

    # Drop tables (optional for in-memory, but good practice)
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


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
    user = User(email=TEST_EMAIL, hashed_password=hashed)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_workspace(db: AsyncSession, test_user: User):
    """Create a test workspace and add test_user as owner."""
    ws = Workspace(title="Test Workspace", slug="test-workspace")
    db.add(ws)
    await db.flush()

    member = WorkspaceMember(
        workspace_id=ws.id, user_id=test_user.id, role=WorkspaceRole.owner
    )
    db.add(member)
    await db.commit()
    await db.refresh(ws)
    return ws


@pytest_asyncio.fixture
async def seed_study(db, test_user, test_workspace):
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
        workspace_id=test_workspace.id,
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
        consent_accept="Yes",
        consent_decline="No",
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
        user = User(email=email, hashed_password=hashed)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    return _create_user


@pytest_asyncio.fixture
async def workspace_factory(db: AsyncSession):
    """Factory to create workspaces with specific owners."""

    async def _create_workspace(owner: User, title: str | None = None) -> Workspace:
        import uuid

        title = title or f"Workspace {uuid.uuid4()}"
        ws = Workspace(title=title, slug=f"ws-{uuid.uuid4()}")
        db.add(ws)
        await db.flush()

        member = WorkspaceMember(
            workspace_id=ws.id, user_id=owner.id, role=WorkspaceRole.owner
        )
        db.add(member)
        await db.commit()
        await db.refresh(ws)
        return ws

    return _create_workspace


@pytest_asyncio.fixture
async def study_factory(db: AsyncSession):
    """Factory to create studies for specific workspaces."""

    async def _create_study(
        workspace: Workspace, owner: User, title: str | None = None
    ) -> Study:
        import uuid

        slug = f"study-{uuid.uuid4()}"
        study = Study(
            slug=slug,
            workspace_id=workspace.id,
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
            consent_accept="Yes",
            consent_decline="No",
        )
        db.add(trans)
        await db.commit()
        return study

    return _create_study


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
async def workspace_member_factory(db: AsyncSession):
    """Factory to add users as members of a workspace."""
    from app.models import WorkspaceMember, WorkspaceRole

    async def _add_member(
        workspace: Workspace, user: User, role: WorkspaceRole
    ) -> None:
        member = WorkspaceMember(
            workspace_id=workspace.id,
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
