"""Startup schema validation must see the whole model, and must say so.

Before wave 7 the check compared the database against a hard-coded list of
9 tables (of 23) and a handful of columns, logged its failure at WARNING,
and then logged "validation passed" unconditionally — so a missing
``memo_comments`` table or a missing recent column produced a green line.
``make check`` runs the module as a script and therefore never failed.
"""

from __future__ import annotations

import logging

import pytest
from sqlalchemy import text

from app.schema_validation import SchemaValidationError, validate_schema

SUCCESS = "schema validation passed"


@pytest.mark.asyncio
async def test_full_model_schema_reports_no_issue(
    db, db_engine, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.schema_validation"):
        issues = await validate_schema(db_engine)
    assert issues == []
    assert any(SUCCESS in r.getMessage() for r in caplog.records)


@pytest.mark.asyncio
async def test_missing_table_outside_the_old_hardcoded_list_is_reported(
    db, db_engine, caplog: pytest.LogCaptureFixture
) -> None:
    async with db_engine.begin() as conn:
        await conn.execute(text("DROP TABLE memo_comments"))

    with caplog.at_level(logging.INFO, logger="app.schema_validation"):
        issues = await validate_schema(db_engine)

    assert issues == ["missing table memo_comments"]
    assert not any(SUCCESS in r.getMessage() for r in caplog.records)
    assert any(
        r.levelno == logging.ERROR and "memo_comments" in r.getMessage()
        for r in caplog.records
    )


@pytest.mark.asyncio
async def test_missing_column_is_reported_and_strict_mode_raises(db, db_engine) -> None:
    async with db_engine.begin() as conn:
        await conn.execute(text("ALTER TABLE participants DROP COLUMN anonymised_at"))

    issues = await validate_schema(db_engine)
    assert issues == ["missing column participants.anonymised_at"]

    with pytest.raises(SchemaValidationError) as exc_info:
        await validate_schema(db_engine, strict=True)
    assert "participants.anonymised_at" in str(exc_info.value)
