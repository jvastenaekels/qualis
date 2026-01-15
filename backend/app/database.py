# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Database configuration and session management."""

from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

SQLALCHEMY_DATABASE_URL = cast(str, settings.DATABASE_URL)

engine_kwargs: dict[str, Any] = {
    "echo": False,
    "pool_size": 20,
    "max_overflow": 40,
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


async def get_db():
    """Dependency that provides an async database session."""
    async with SessionLocal() as db:
        yield db
