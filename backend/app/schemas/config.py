"""Public bootstrap config exposed unauthenticated at GET /api/config."""

from typing import Literal

from pydantic import BaseModel


class PublicConfig(BaseModel):
    """Minimal client bootstrap payload.

    ``email_delivery`` is "smtp" when SMTP credentials are configured and
    "manual" otherwise (see docs/guides/running-without-smtp.md).

    ``audio_storage`` is "available" when S3/object-storage credentials are
    configured and "unavailable" otherwise. When "unavailable", the
    participant audio UI is suppressed and audio-enabled studies degrade to
    text-only (see docs/guides/running-without-s3.md).
    """

    email_delivery: Literal["smtp", "manual"]
    audio_storage: Literal["available", "unavailable"]
