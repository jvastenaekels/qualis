# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.


import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import text, select
from sqlalchemy.pool import StaticPool

# Import app modules - careful with relative imports if running from root
from app.main import app
from app.database import Base, get_db
from app.models import Study, StudyTranslation, Statement, StatementTranslation, StudyState, User

# Use in-memory SQLite for testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DATABASE_URL, 
    echo=False, 
    connect_args={"check_same_thread": False}, 
    poolclass=StaticPool
)
TestingSessionLocal = async_sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine, class_=AsyncSession)

@pytest_asyncio.fixture
async def db():
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with TestingSessionLocal() as session:
        yield session
        
    # Drop tables (optional for in-memory, but good practice)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture
async def client(db):
    # Dependency Override
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    
    # We use http://testserver as base URL
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c

    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def seed_study(db):
    """Seeds a complete study with statements and configs"""
    
    # 1. Owner
    owner = User(email="test@example.com", hashed_password="pw", is_active=True)
    db.add(owner)
    await db.flush()

    # 2. Study
    grid_config = [
        {"score": -1, "capacity": 1},
        {"score": 0, "capacity": 2},
        {"score": 1, "capacity": 1}
    ]
    # Total capacity = 4 cards
    
    study = Study(
        slug="test-study",
        owner_id=owner.id,
        state=StudyState.active,
        grid_config=grid_config,
        presort_config={
            "age": {"type": "number", "label": {"en": "Age"}, "required": True},
            "gender": {"type": "select", "options": [{"value": "M", "label": {"en": "Male"}}], "label": {"en": "Gender"}, "required": False}
        },
        postsort_config={
            "extreme_columns": [-1, 1],
            "ask_missing": False,
            "ask_general_comment": True
        }
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
        consent_decline="No"
    )
    db.add(trans)

    # 4. Statements (Need 4 to match grid capacity)
    statements = []
    for i in range(1, 5):
        s = Statement(study_id=study.id, code=f"S{i}")
        db.add(s)
        await db.flush()
        
        st = StatementTranslation(statement_id=s.id, language_code="en", text=f"Statement {s.code}")
        db.add(st)
        statements.append(s)

    await db.commit()
    
    # Reload with eager loaded statements for tests
    stmt = select(Study).where(Study.id == study.id).options(selectinload(Study.statements))
    result = await db.execute(stmt)
    study = result.scalar_one()
    
    return study
