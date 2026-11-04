"""Study ownership must survive insert races; failed audio must preserve prior bytes."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.exceptions import ValidationError
from app.models import AudioRecording, Participant, ParticipantStatus, Study
from app.schemas import SubmissionInput
from app.services import audio_service, storage_service
from app.services.storage_service import StorageService
from app.services.submission_service import SubmissionService


async def _hide_first_participant_lookup(db, monkeypatch):
    """Force the insertion race while keeping the real unique constraint/recovery."""
    execute = db.execute
    hidden = False

    async def execute_with_race(statement, *args, **kwargs):
        nonlocal hidden
        if not hidden and any(
            item.get("entity") is Participant
            for item in getattr(statement, "column_descriptions", [])
        ):
            hidden = True
            return await execute(select(Participant).where(False))
        return await execute(statement, *args, **kwargs)

    monkeypatch.setattr(db, "execute", execute_with_race)


@pytest.mark.parametrize("race", [False, True])
async def test_consent_rejects_other_study_without_changing_consent(
    db, active_study, monkeypatch, race
):
    other = Study(
        slug="public-consent-target",
        project_id=active_study.project_id,
        grid_config=[],
        presort_config={},
        postsort_config={},
    )
    participant = Participant(
        study_id=active_study.id,
        session_token=uuid4(),
        language_used="en",
        status=ParticipantStatus.started,
        resume_code="existing-resume-code",
    )
    db.add_all([other, participant])
    await db.commit()
    token, slug = participant.session_token, other.slug
    if race:
        await _hide_first_participant_lookup(db, monkeypatch)

    with pytest.raises(ValidationError, match="does not belong"):
        await SubmissionService.record_consent(
            db, slug, token, "fr", consent_hash="wrong-study-consent"
        )

    await db.rollback()
    persisted = (
        await db.execute(select(Participant).where(Participant.session_token == token))
    ).scalar_one()
    assert persisted.consented_at is None
    assert persisted.consent_hash is None
    assert persisted.language_used == "en"


async def test_submission_race_rejects_participant_created_in_other_study(
    db, active_study, monkeypatch
):
    other = Study(
        slug="other-submission-target",
        project_id=active_study.project_id,
        grid_config=[],
        presort_config={},
        postsort_config={},
    )
    participant = Participant(
        study_id=active_study.id,
        session_token=uuid4(),
        language_used="en",
        status=ParticipantStatus.started,
    )
    db.add_all([other, participant])
    await db.commit()
    data = SubmissionInput(
        study_slug=other.slug,
        session_token=participant.session_token,
        language_used="en",
        status=ParticipantStatus.started,
        qsort=[],
    )
    await _hide_first_participant_lookup(db, monkeypatch)

    with pytest.raises(ValidationError, match="does not belong"):
        await SubmissionService._find_or_create_participant(
            db,
            data,
            other,
            presort_answers={},
            postsort_answers={},
            confirmation_code="test",
            hashed_ip="test",
            user_agent=None,
        )


async def test_failed_same_second_audio_replacement_preserves_original(
    db, active_study, monkeypatch
):
    participant = Participant(
        study_id=active_study.id,
        session_token=uuid4(),
        language_used="en",
        status=ParticipantStatus.started,
    )
    db.add(participant)
    await db.commit()
    objects = {}
    service = StorageService(skip_init=True)
    service.bucket_name = "test"
    service.s3_client = SimpleNamespace(
        put_object=lambda **kw: objects.__setitem__(kw["Key"], kw["Body"]),
        delete_object=lambda **kw: objects.pop(kw["Key"], None),
    )
    monkeypatch.setattr(audio_service, "storage_service", service)
    monkeypatch.setattr(
        storage_service,
        "datetime",
        SimpleNamespace(now=lambda tz: datetime(2026, 1, 1, tzinfo=UTC)),
    )

    first = await audio_service.store_recording(
        db,
        participant,
        active_study,
        question_key="card_1",
        content=b"original",
        sniffed_mime="audio/webm",
        duration_seconds=1,
    )
    first_id, first_key = first.id, first.s3_key

    async def failed_commit():
        raise RuntimeError("simulated database outage")

    monkeypatch.setattr(db, "commit", failed_commit)
    with pytest.raises(RuntimeError, match="database outage"):
        await audio_service.store_recording(
            db,
            participant,
            active_study,
            question_key="card_1",
            content=b"new",
            sniffed_mime="audio/webm",
            duration_seconds=1,
        )
    await db.rollback()
    restored = await db.get(AudioRecording, first_id)
    assert restored.s3_key == first_key
    assert objects == {first_key: b"original"}
