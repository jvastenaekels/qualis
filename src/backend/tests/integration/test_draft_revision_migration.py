"""The revision migration preserves existing drafts through upgrade/downgrade."""

import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

from sqlalchemy import text

from app.models import Participant
from tests.conftest import TEST_DATABASE_URL


def _alembic(*args):
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=Path(__file__).resolve().parents[2],
        env={**os.environ, "DATABASE_URL": TEST_DATABASE_URL},
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr


async def test_draft_revision_migration_roundtrip(db, active_study):
    participant = Participant(
        study_id=active_study.id,
        session_token=uuid4(),
        language_used="en",
        draft_responses={"presort": {"q": "preserved"}},
    )
    db.add(participant)
    await db.commit()
    participant_id = participant.id
    # Recreate the prior head's shape without depending on the current model.
    await db.execute(
        text("ALTER TABLE participants DROP COLUMN IF EXISTS draft_revision")
    )
    await db.commit()
    _alembic("stamp", "1d82a52cfe76")
    _alembic("upgrade", "b839ce2f641a")
    row = (
        await db.execute(
            text(
                "SELECT draft_responses, draft_revision FROM participants WHERE id=:id"
            ),
            {"id": participant_id},
        )
    ).one()
    assert row.draft_responses == {"presort": {"q": "preserved"}}
    assert row.draft_revision is None
    await db.execute(
        text("UPDATE participants SET draft_revision=9007199254740991 WHERE id=:id"),
        {"id": participant_id},
    )
    await db.commit()
    _alembic("downgrade", "1d82a52cfe76")
    assert (
        await db.execute(
            text("SELECT draft_responses FROM participants WHERE id=:id"),
            {"id": participant_id},
        )
    ).scalar_one() == {"presort": {"q": "preserved"}}
    assert (
        await db.execute(
            text(
                "SELECT count(*) FROM information_schema.columns WHERE table_name='participants' AND column_name='draft_revision'"
            )
        )
    ).scalar_one() == 0
