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
}

# SQLite doesn't support these pool settings
if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update(
        {
            "pool_size": 10,
            "max_overflow": 20,
            "pool_timeout": 30,
            "pool_recycle": 1800,
        }
    )

engine = create_async_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)


if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event

    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


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
