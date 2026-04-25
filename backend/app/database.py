# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Database configuration and session management."""

from collections.abc import AsyncGenerator
from typing import Any, cast
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

SQLALCHEMY_DATABASE_URL = cast(str, settings.DATABASE_URL)

# Fix for SQLAlchemy + asyncpg: "postgres://" or "postgresql://" -> "postgresql+asyncpg://"
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace(
        "postgres://", "postgresql+asyncpg://", 1
    )
elif SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgresql://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )

# asyncpg doesn't support the 'sslmode' query parameter.
# We strip it if present to avoid TypeError.
if "sslmode=" in SQLALCHEMY_DATABASE_URL:
    u = urlparse(SQLALCHEMY_DATABASE_URL)
    q = parse_qs(u.query)
    q.pop("sslmode", None)
    SQLALCHEMY_DATABASE_URL = urlunparse(u._replace(query=urlencode(q, doseq=True)))

# Pool sizing: production gets a larger pool; dev/test stays minimal
# to fit within sandbox DB plans (~5-10 connection slots).
_is_production = settings.ENVIRONMENT == "production"

engine_kwargs: dict[str, Any] = {
    "echo": False,
    "pool_size": 3 if _is_production else 1,
    "max_overflow": 2 if _is_production else 1,
    "pool_timeout": 30,
    "pool_recycle": 1800,
    "pool_pre_ping": True,  # Detect disconnected connections
}

# Add strict statement timeout for production
if "postgre" in SQLALCHEMY_DATABASE_URL:
    engine_kwargs["connect_args"] = {
        "server_settings": {
            "statement_timeout": "30000",  # 30s timeout per query
            "idle_in_transaction_session_timeout": "60000",  # 60s max idle tx
        }
    }

engine = create_async_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)


SessionLocal = async_sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy declarative models."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides an async database session."""
    async with SessionLocal() as db:
        yield db
