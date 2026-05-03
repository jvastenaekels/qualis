# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 4 Task 5 — Audio S3 keys + lifecycle (F-05-004, F-05-005).

Pre-fix gap (F-05-004 — minor)
------------------------------

Pre-Wave-4 audio keys followed the pattern::

    audio/{study_slug}/{participant_token}/{timestamp}_{question}{ext}

To anyone with ``s3:ListBucket`` permission (operator IAM
mis-configuration, S3-side audit log mining, or the operator
themselves) the slug + token leaked:
- study existence and per-study object counts
- a per-participant token that, pre-anonymisation, mapped 1:1 to a
  ``participants.session_token`` row in the DB

This is a defence-in-depth concern, not a leak in the application
auth path: the application never exposes ListBucket to clients;
keys are only addressable by the application via ``download_object``
and ``delete_audio`` after the auth check. But the hardening cost is
low and the privacy upside is real.

Post-fix invariants (F-05-004)
------------------------------

1. New audio uploads use the key pattern::

       audio/{sha256(study_slug | participant_token | IP_HASH_SALT)[:32]}
       /{timestamp}_{safe_question_key}{ext}

   — an opaque 32-char hex prefix that does not reveal study slug or
   participant token to a ListBucket viewer.
2. The S3 object metadata block no longer includes the raw study slug
   or participant token (only ``question``, the sanitised form-context
   key, is kept for operator debugging).
3. Pre-existing rows retain their legacy keys on disk; anonymisation
   deletes by the per-row stored ``s3_key`` so both formats coexist.

Lifecycle pin (F-05-005 — observation; documented for the GDPR memo)
--------------------------------------------------------------------

``StudyDataService.anonymise_participant`` already deletes every
``audio_recordings`` row's S3 object before nulling the participant's
PII (``study_data_service.py:117-130``). Failures are logged at
warning level and DB anonymisation continues — a deliberate
fail-open posture: a transient S3 outage must not block legal
erasure. **Operator obligation:** run a periodic orphan sweep on the
bucket. Documented as observation; no code change in this batch.

The bucket-side **lifecycle policy** itself (auto-delete N days after
``LastModified``) cannot be shipped from application code: it lives
in the S3 bucket configuration. **Documented as operator obligation
in the Wave 7 GDPR memo.** The fact that anonymisation reliably
deletes audio rows + objects is what this test pins.
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AudioRecording,
    Participant,
    ParticipantStatus,
    Project,
    Study,
    StudyState,
)
from app.services.storage_service import (
    StorageService,
    _hashed_audio_prefix,
)


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


async def _seed_study(db: AsyncSession) -> Study:
    project = Project(
        title=f"P-{uuid4().hex[:6]}",
        slug=f"p-{uuid4().hex[:6]}",
    )
    db.add(project)
    await db.flush()
    study = Study(
        slug=f"audio-keys-{uuid4().hex[:6]}",
        project_id=project.id,
        state=StudyState.active,
        grid_config=[{"score": 0, "capacity": 1}],
        presort_config={},
        postsort_config={},
    )
    db.add(study)
    await db.flush()
    return study


async def _seed_participant_with_audio(
    db: AsyncSession, study: Study, *, s3_key: str = "audio/legacy/key.webm"
) -> tuple[Participant, AudioRecording]:
    p = Participant(
        study_id=study.id,
        session_token=uuid4(),
        language_used="en",
        status=ParticipantStatus.completed,
        consented_at=datetime.now(timezone.utc),
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(p)
    await db.flush()
    rec = AudioRecording(
        participant_id=p.id,
        question_key="card_1",
        s3_bucket="test-bucket",
        s3_key=s3_key,
        file_size_bytes=1024,
        duration_seconds=1.0,
        mime_type="audio/webm",
    )
    db.add(rec)
    await db.commit()
    await db.refresh(p)
    return p, rec


# -----------------------------------------------------------------------------
# F-05-004 — hashed-prefix key naming
# -----------------------------------------------------------------------------


class TestHashedAudioPrefix:
    """Pin the format of the new key prefix (slug + token are not
    discoverable from the bucket listing).
    """

    def test_returns_32_hex_chars(self) -> None:
        prefix = _hashed_audio_prefix("study-abc", uuid4())
        assert re.fullmatch(r"[0-9a-f]{32}", prefix), prefix

    def test_does_not_contain_slug_or_token(self) -> None:
        slug = "study-recognisable-slug"
        token = uuid4()
        prefix = _hashed_audio_prefix(slug, token)
        assert slug not in prefix
        assert str(token) not in prefix
        # Hex digests don't carry "-" so the UUID dashes wouldn't be
        # there anyway — but the absence of the bare slug in the
        # prefix is the load-bearing assertion.

    def test_deterministic_for_same_input(self) -> None:
        slug = "study-abc"
        token = uuid4()
        assert _hashed_audio_prefix(slug, token) == _hashed_audio_prefix(slug, token)

    def test_different_for_different_participants(self) -> None:
        slug = "study-abc"
        prefix_1 = _hashed_audio_prefix(slug, uuid4())
        prefix_2 = _hashed_audio_prefix(slug, uuid4())
        assert prefix_1 != prefix_2

    def test_different_for_different_studies_same_token(self) -> None:
        token = uuid4()
        prefix_1 = _hashed_audio_prefix("study-a", token)
        prefix_2 = _hashed_audio_prefix("study-b", token)
        assert prefix_1 != prefix_2

    def test_uses_ip_hash_salt(self) -> None:
        slug = "study-abc"
        token = uuid4()
        old_salt = os.getenv("IP_HASH_SALT")
        try:
            os.environ["IP_HASH_SALT"] = "salt-A"
            hash_a = _hashed_audio_prefix(slug, token)
            os.environ["IP_HASH_SALT"] = "salt-B"
            hash_b = _hashed_audio_prefix(slug, token)
            assert hash_a != hash_b
        finally:
            if old_salt is None:
                os.environ.pop("IP_HASH_SALT", None)
            else:
                os.environ["IP_HASH_SALT"] = old_salt


@pytest.mark.asyncio
class TestUploadKeyPattern:
    """``StorageService.upload_audio`` must use the hashed prefix (no
    raw slug or participant token in the key)."""

    async def test_key_uses_hashed_prefix(self) -> None:
        """The stored key starts with ``audio/<32 hex>/`` and does not
        contain the raw slug or token.
        """
        service = StorageService(skip_init=True)
        service.bucket_name = "test-bucket"
        service.s3_client = MagicMock()  # put_object is a no-op for the test

        slug = "study-recognisable"
        token = UUID("00000000-1111-2222-3333-444444444444")
        result = await service.upload_audio(
            content=b"fake-audio",
            content_type="audio/webm",
            study_slug=slug,
            participant_token=token,
            question_key="card_1",
        )

        s3_key = result["s3_key"]
        # Key starts with "audio/<32-hex>/".
        assert re.match(r"^audio/[0-9a-f]{32}/", s3_key), s3_key
        # Neither the slug nor the token leak into the key.
        assert slug not in s3_key
        assert str(token) not in s3_key
        # The sanitised question_key still appears in the suffix.
        assert "card_1" in s3_key
        # Extension preserved.
        assert s3_key.endswith(".webm")

    async def test_object_metadata_has_no_slug_or_token(self) -> None:
        """The S3 ``Metadata`` block must not include the raw slug or
        participant token (defence in depth: even if a viewer can read
        the key, they shouldn't recover the participant identity from
        ``HeadObject`` either).
        """
        service = StorageService(skip_init=True)
        service.bucket_name = "test-bucket"
        service.s3_client = MagicMock()

        slug = "study-recognisable"
        token = UUID("00000000-1111-2222-3333-444444444444")
        await service.upload_audio(
            content=b"fake-audio",
            content_type="audio/webm",
            study_slug=slug,
            participant_token=token,
            question_key="card_1",
        )

        # The first call to put_object carries the Metadata block.
        call_kwargs = service.s3_client.put_object.call_args.kwargs
        metadata = call_kwargs["Metadata"]
        # Slug is not in the metadata.
        assert slug not in metadata.values()
        # Token is not in the metadata (compare full UUID + str form).
        assert str(token) not in metadata.values()
        # Question key is still present (sanitised).
        assert metadata.get("question") == "card_1"


# -----------------------------------------------------------------------------
# F-05-005 — anonymisation propagates to S3
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
class TestAnonymisationDeletesS3Audio:
    """``anonymise_participant`` must delete every audio object from S3
    AND delete the ``audio_recordings`` rows. Failures are logged but
    do not block DB anonymisation (fail-open posture: legal erasure
    must not be gated on S3 availability).
    """

    async def test_anonymise_invokes_delete_audio_for_each_recording(
        self, db: AsyncSession
    ) -> None:
        study = await _seed_study(db)
        participant, rec = await _seed_participant_with_audio(
            db, study, s3_key="audio/legacy-prefix/participant-1/1234_card_1.webm"
        )
        # Add a second recording to verify the loop.
        rec_2 = AudioRecording(
            participant_id=participant.id,
            question_key="card_2",
            s3_bucket="test-bucket",
            s3_key="audio/legacy-prefix/participant-1/5678_card_2.webm",
            file_size_bytes=2048,
            duration_seconds=2.0,
            mime_type="audio/webm",
        )
        db.add(rec_2)
        await db.commit()
        keys_before = {rec.s3_key, rec_2.s3_key}

        # Patch the storage_service singleton's delete_audio. The
        # service imports `storage_service` lazily inside
        # anonymise_participant, so patching the canonical module-level
        # name is sufficient.
        from app.services.storage_service import storage_service

        with patch.object(
            storage_service, "delete_audio", new_callable=AsyncMock
        ) as mock_delete:
            from app.services.study_data_service import StudyDataService

            await StudyDataService.anonymise_participant(db, participant)

            # delete_audio called once per row.
            called_keys = {
                call.args[0] for call in mock_delete.call_args_list
            }
            assert called_keys == keys_before, (
                f"expected {keys_before}, got {called_keys}"
            )

        # Audio recordings rows are gone from the DB regardless of S3 fate.
        await db.refresh(participant, attribute_names=["audio_recordings"])
        assert len(participant.audio_recordings) == 0

    async def test_anonymise_continues_on_s3_delete_failure(
        self, db: AsyncSession
    ) -> None:
        """Transient S3 outage must not block DB anonymisation
        (fail-open posture per the service docstring)."""
        study = await _seed_study(db)
        participant, _ = await _seed_participant_with_audio(
            db, study, s3_key="audio/legacy/key.webm"
        )

        from app.services.storage_service import storage_service

        async def _boom(_key: str) -> None:
            raise RuntimeError("simulated S3 outage")

        with patch.object(storage_service, "delete_audio", side_effect=_boom):
            from app.services.study_data_service import StudyDataService

            # Must not raise — the failure is logged at warning level.
            await StudyDataService.anonymise_participant(db, participant)

        # Participant is still anonymised.
        await db.refresh(participant)
        assert participant.anonymised_at is not None
        assert participant.ip_address is None
        # Audio rows still deleted from DB (operator orphan-sweeps S3).
        await db.refresh(participant, attribute_names=["audio_recordings"])
        assert len(participant.audio_recordings) == 0


# -----------------------------------------------------------------------------
# Stable hash for documentation
# -----------------------------------------------------------------------------


class TestHashedPrefixIsStableAcrossRuntimes:
    """Pin a known input → output mapping so a future code change that
    silently shifts the hash format (truncation length, separator,
    salt usage) trips this test.
    """

    def test_known_input_produces_known_output(self) -> None:
        # We pin against an explicit salt to stay deterministic
        # regardless of the test runner's IP_HASH_SALT environment.
        slug = "study-fixed"
        token = UUID("11111111-2222-3333-4444-555555555555")
        salt = "FIXED-TEST-SALT-FOR-PIN"
        old = os.getenv("IP_HASH_SALT")
        try:
            os.environ["IP_HASH_SALT"] = salt
            actual = _hashed_audio_prefix(slug, token)
        finally:
            if old is None:
                os.environ.pop("IP_HASH_SALT", None)
            else:
                os.environ["IP_HASH_SALT"] = old

        # Re-derive directly with hashlib to detect any drift in the
        # implementation. This is a tautology by construction — but
        # by spelling it out, a refactor that changes the input
        # ordering, separator, or truncation length will fail loudly.
        expected = hashlib.sha256(
            f"{slug}|{token}|{salt}".encode()
        ).hexdigest()[:32]
        assert actual == expected
