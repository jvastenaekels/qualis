"""Unit tests for StudyService."""

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Participant, ParticipantStatus
from app.schemas import QSortEntryInput, SubmissionInput
from app.services.study_service import StudyService


@pytest.mark.asyncio
async def test_validate_distribution_valid(seed_study):
    # seed_study has capacity: -1:1, 0:2, 1:1 (Total 4)
    qsort = [
        QSortEntryInput(statement_id=1, grid_score=-1),
        QSortEntryInput(statement_id=2, grid_score=0),
        QSortEntryInput(statement_id=3, grid_score=0),
        QSortEntryInput(statement_id=4, grid_score=1),
    ]
    # Should not raise
    StudyService.validate_distribution(seed_study, qsort)


@pytest.mark.asyncio
async def test_validate_distribution_incomplete(seed_study):
    qsort = [QSortEntryInput(statement_id=1, grid_score=0)]
    with pytest.raises(HTTPException) as excinfo:
        StudyService.validate_distribution(seed_study, qsort)
    assert excinfo.value.status_code == 400
    assert "Submission incomplete" in excinfo.value.detail


@pytest.mark.asyncio
async def test_validate_distribution_wrong_counts(seed_study):
    # All in column 0
    qsort = [
        QSortEntryInput(statement_id=1, grid_score=0),
        QSortEntryInput(statement_id=2, grid_score=0),
        QSortEntryInput(statement_id=3, grid_score=0),
        QSortEntryInput(statement_id=4, grid_score=0),
    ]
    with pytest.raises(HTTPException) as excinfo:
        StudyService.validate_distribution(seed_study, qsort)
    assert excinfo.value.status_code == 400
    assert "incorrect number of cards" in excinfo.value.detail


@pytest.mark.asyncio
async def test_validate_distribution_invalid_score(seed_study):
    qsort = [
        QSortEntryInput(statement_id=1, grid_score=-1),
        QSortEntryInput(statement_id=2, grid_score=0),
        QSortEntryInput(statement_id=3, grid_score=0),
        QSortEntryInput(statement_id=4, grid_score=99),  # Invalid
    ]
    with pytest.raises(HTTPException) as excinfo:
        StudyService.validate_distribution(seed_study, qsort)
    assert excinfo.value.status_code == 400
    # It hits the "incorrect number of cards" for column 1 first, because 4 cards are expected
    # and column 1 has 0.
    assert "incorrect number of cards" in excinfo.value.detail


@pytest.mark.asyncio
async def test_process_submission_new_participant(db, seed_study):
    session_token = uuid.uuid4()
    data = SubmissionInput(
        session_token=session_token,
        study_slug=seed_study.slug,
        language_used="en",
        status=ParticipantStatus.started,
        qsort=[QSortEntryInput(statement_id=seed_study.statements[0].id, grid_score=0)],
    )

    code = await StudyService.process_submission(db, data, "127.0.0.1")
    assert code == str(session_token)[:8].upper()

    # Verify DB
    res = await db.execute(
        select(Participant)
        .where(Participant.session_token == session_token)
        .options(selectinload(Participant.qsort_entries))
    )
    p = res.scalar_one()
    assert p.status == ParticipantStatus.started
    assert len(p.qsort_entries) == 1


@pytest.mark.asyncio
async def test_process_submission_update_existing(db, seed_study):
    session_token = uuid.uuid4()
    # 1. First submission
    data1 = SubmissionInput(
        session_token=session_token,
        study_slug=seed_study.slug,
        language_used="en",
        status=ParticipantStatus.started,
        qsort=[QSortEntryInput(statement_id=seed_study.statements[0].id, grid_score=0)],
    )
    await StudyService.process_submission(db, data1, "1.1.1.1")

    # 2. Update
    data2 = SubmissionInput(
        session_token=session_token,
        study_slug=seed_study.slug,
        language_used="en",
        status=ParticipantStatus.started,
        qsort=[
            QSortEntryInput(statement_id=seed_study.statements[0].id, grid_score=1),
            QSortEntryInput(statement_id=seed_study.statements[1].id, grid_score=-1),
        ],
    )
    await StudyService.process_submission(db, data2, "2.2.2.2")

    # Verify
    res = await db.execute(
        select(Participant)
        .where(Participant.session_token == session_token)
        .options(selectinload(Participant.qsort_entries))
    )
    p = res.scalar_one()
    assert len(p.qsort_entries) == 2
    assert p.qsort_entries[0].grid_score in [1, -1]
    assert p.ip_address != "3c49e0c1f6097262"  # Placeholder check (using hash_ip)


@pytest.mark.asyncio
async def test_process_submission_completed_early_return(db, seed_study):
    session_token = uuid.uuid4()
    # Create already completed participant
    p = Participant(
        study_id=seed_study.id,
        session_token=session_token,
        language_used="en",
        status=ParticipantStatus.completed,
        confirmation_code="OLDCODE",
    )
    db.add(p)
    await db.commit()

    data = SubmissionInput(
        session_token=session_token,
        study_slug=seed_study.slug,
        language_used="en",
        status=ParticipantStatus.started,  # Trying to change back to started?
        qsort=[],
    )

    # Should return existing code and NOT update anything
    code = await StudyService.process_submission(db, data, "1.2.3.4")
    assert code == str(session_token)[:8].upper()

    # Double check if it actually didn't update
    db.expire_all()
    res = await db.execute(
        select(Participant).where(Participant.session_token == session_token)
    )
    p_after = res.scalar_one()
    assert p_after.status == ParticipantStatus.completed  # Stayed completed


@pytest.mark.asyncio
async def test_validate_distribution_legacy_dict(seed_study):
    """Test validation with dict-based grid config (legacy format)."""
    # Manually change grid_config to dict: score -> capacity
    seed_study.grid_config = {"-1": 1, "0": 2, "1": 1}
    qsort = [
        QSortEntryInput(statement_id=1, grid_score=-1),
        QSortEntryInput(statement_id=2, grid_score=0),
        QSortEntryInput(statement_id=3, grid_score=0),
        QSortEntryInput(statement_id=4, grid_score=1),
    ]
    # Should not raise
    StudyService.validate_distribution(seed_study, qsort)


@pytest.mark.asyncio
async def test_get_study_stats(db, seed_study):
    """Test statistics calculation."""
    from datetime import datetime, timedelta

    # 1. Ongoing participant
    p1 = Participant(
        study_id=seed_study.id,
        session_token=uuid.uuid4(),
        status=ParticipantStatus.started,
        language_used="en",
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS...)",
    )
    # 2. Completed participant (Duration 100s)
    now = datetime.now()
    p2 = Participant(
        study_id=seed_study.id,
        session_token=uuid.uuid4(),
        status=ParticipantStatus.completed,
        language_used="en",
        consented_at=now - timedelta(seconds=100),
        submitted_at=now,
        user_agent="Mozilla/5.0 (Windows NT 10.0...)",
    )
    # 3. Discarded participant (Should be ignored)
    p3 = Participant(
        study_id=seed_study.id,
        session_token=uuid.uuid4(),
        status=ParticipantStatus.completed,
        language_used="en",
        is_discarded=True,
    )

    db.add_all([p1, p2, p3])
    await db.commit()

    stats = await StudyService.get_study_stats(db, seed_study.id)

    assert stats["started_count"] == 2  # p1 + p2 (p3 discarded)
    assert stats["completed_count"] == 1  # p2 only
    assert stats["completion_rate"] == 0.5  # 1/2
    assert stats["completed_count"] == 1  # p2 only
    assert stats["completion_rate"] == 0.5  # 1/2
    # Service returns "median_duration_seconds"
    assert stats["median_duration_seconds"] == 100.0
    assert stats["device_breakdown"]["mobile"] == 1
    assert stats["device_breakdown"]["desktop"] == 1


@pytest.mark.asyncio
async def test_get_study_full_dump(db, seed_study):
    """Test full data dump for export."""
    from datetime import datetime
    from app.models import QSortEntry

    # Create completed participant with sorts
    p = Participant(
        study_id=seed_study.id,
        session_token=uuid.uuid4(),
        status=ParticipantStatus.completed,
        language_used="en",
        submitted_at=datetime.now(),
        consented_at=datetime.now(),
    )
    db.add(p)
    await db.commit()

    # Add entries
    entries = [
        QSortEntry(
            participant_id=p.id,
            statement_id=seed_study.statements[0].id,
            grid_score=-1,
        ),
        QSortEntry(
            participant_id=p.id,
            statement_id=seed_study.statements[1].id,
            grid_score=0,
        ),
        QSortEntry(
            participant_id=p.id,
            statement_id=seed_study.statements[2].id,
            grid_score=0,
        ),
        QSortEntry(
            participant_id=p.id,
            statement_id=seed_study.statements[3].id,
            grid_score=1,
        ),
    ]
    db.add_all(entries)
    await db.commit()

    dump = await StudyService.get_study_full_dump(db, seed_study.id)
    
    assert dump["study"]["slug"] == seed_study.slug
    assert len(dump["study"]["statements"]) == 4
    assert len(dump["participants"]) == 1
    
    p_data = dump["participants"][0]
    # Check if scores aligns with statement order (ids: 1, 2, 3, 4)
    # scores should be [-1, 0, 0, 1]
    assert p_data["scores"] == [-1, 0, 0, 1]
    assert "placements" in p_data
