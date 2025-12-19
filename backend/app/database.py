import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

# For local development with SQLite
# On Scalingo/Production, this will be provided via DATABASE_URL
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./q_method.db")

# Fix for SQLAlchemy + asyncpg: "postgres://" or "postgresql://" -> "postgresql+asyncpg://"
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgresql://"):
     SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# asyncpg doesn't support the 'sslmode' query parameter. 
# We strip it if present to avoid TypeError.
if "sslmode=" in SQLALCHEMY_DATABASE_URL:
    from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
    u = urlparse(SQLALCHEMY_DATABASE_URL)
    q = parse_qs(u.query)
    q.pop("sslmode", None)
    SQLALCHEMY_DATABASE_URL = urlunparse(u._replace(query=urlencode(q, doseq=True)))

engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=False, # Set to False in production
)

SessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
    class_=AsyncSession
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with SessionLocal() as db:
        yield db
