# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 3 Task 6 — Audio-upload ownership claim integrity.

The audio upload endpoint (``POST /api/audio/upload``) does not accept a
``participant_id`` from the request body or query string. The
participant identity is derived from the form-supplied ``session_token``
(a 128-bit UUID) which is looked up against
``Participant.session_token`` — same opaque credential that gates every
participant-facing endpoint. There is no body-supplied identifier the
attacker could tamper with to claim ownership of a different
participant row.

Similarly, ``DELETE /api/audio/{recording_id}`` and
``GET /api/audio/{recording_id}/url`` require the caller's
``session_token`` to match the participant who owns the recording —
fetched via the ``recording → participant`` join — before any S3 key
is exposed.

This regression guard pins three behaviours:

1. ``DELETE /api/audio/{recording_id}`` rejects a wrong session_token
   with 403 even when the caller knows the recording id.
2. ``GET /api/audio/{recording_id}/url`` rejects a wrong session_token
   with 403 (would otherwise leak a presigned URL).
3. The upload endpoint has no ``participant_id`` parameter — verified
   by reading the route signature.

Status: filed as F-04-003 (observation — body has no trusted participant
claim, all participant-id derivation is session-token-based).
"""

from __future__ import annotations

import inspect

import pytest
from httpx import AsyncClient

from app.routers.audio import (
    delete_audio_recording,
    get_audio_url,
    upload_audio,
)

from .conftest import TenancyFixtures


class TestAudioUploadOwnership:
    """Audio endpoints derive participant identity from session_token only."""

    def test_upload_signature_has_no_participant_id_parameter(self) -> None:
        """The upload route must not accept a body-supplied participant_id.

        If such a parameter were ever added, ownership-claim tampering
        becomes possible — an attacker could upload audio as another
        participant by spoofing the id. The regression test pins that
        the parameter list is session_token-only.
        """
        sig = inspect.signature(upload_audio)
        param_names = set(sig.parameters)
        assert "participant_id" not in param_names, (
            "upload_audio must not accept a participant_id parameter — "
            "ownership must be derived from session_token. Parameters: "
            f"{sorted(param_names)}"
        )
        # session_token is the trusted credential.
        assert "session_token" in param_names, (
            f"upload_audio must accept session_token. Parameters: {sorted(param_names)}"
        )

    def test_delete_and_get_url_signatures_use_session_token(self) -> None:
        """The delete + get-url routes must gate on session_token."""
        for fn in (delete_audio_recording, get_audio_url):
            sig = inspect.signature(fn)
            assert "session_token" in sig.parameters, (
                f"{fn.__name__} must gate on session_token; "
                f"parameters: {sorted(sig.parameters)}"
            )

    @pytest.mark.asyncio
    async def test_delete_rejects_wrong_session_token(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
    ) -> None:
        """DELETE /api/audio/{rec_id} with wrong session_token must 403."""
        # Both audio_in_a and audio_in_b are seeded; an attacker who knows
        # audio_in_b.id but presents participant_in_a's session_token must
        # be denied.
        wrong_session = tenancy.participant_in_a.session_token
        response = await client.delete(
            f"/api/audio/{tenancy.audio_in_b.id}",
            params={"session_token": str(wrong_session)},
        )
        assert response.status_code == 403, (
            "Cross-participant delete must be rejected with 403; "
            f"got {response.status_code} body={response.text!r}"
        )

    @pytest.mark.asyncio
    async def test_get_url_rejects_wrong_session_token(
        self,
        tenancy: TenancyFixtures,
        client: AsyncClient,
    ) -> None:
        """GET /api/audio/{rec_id}/url with wrong session_token must 403.

        Critical because this endpoint returns a presigned S3 URL — a
        successful response would be a direct data leak.
        """
        wrong_session = tenancy.participant_in_a.session_token
        response = await client.get(
            f"/api/audio/{tenancy.audio_in_b.id}/url",
            params={"session_token": str(wrong_session)},
        )
        assert response.status_code == 403, (
            "Cross-participant presigned-URL fetch must be rejected with 403; "
            f"got {response.status_code} body={response.text!r}"
        )
