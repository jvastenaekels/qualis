# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""S3/Cellar storage service for audio file management."""

import asyncio
import hashlib
import logging
import os
import re
from datetime import UTC, datetime
from typing import TypedDict, cast
from uuid import UUID

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from app.core.config import settings
from app.exceptions import NotFoundError, ServiceError

logger = logging.getLogger(__name__)


class AudioUploadMetadata(TypedDict):
    """Metadata returned by upload_audio (keys consumed by the audio router)."""

    s3_bucket: str
    s3_key: str
    file_size_bytes: int
    mime_type: str


# question_key is participant-supplied (form field, audio recording context).
# We constrain it to a strict charset to prevent path-traversal and key-injection
# in S3 (e.g. "../etc/passwd", keys with "/" that break the audio/{slug}/{token}/
# scoping prefix). Allow alphanumerics, dash, underscore, dot only — anything
# else is collapsed to underscore.
_QUESTION_KEY_SANITISER = re.compile(r"[^A-Za-z0-9._-]+")
_MAX_QUESTION_KEY_LEN = 80


def _sanitise_question_key(value: str) -> str:
    """Return a path-traversal-safe rendition of a participant-supplied
    question_key, suitable for inclusion in an S3 object key."""
    if not value:
        return "unknown"
    cleaned = _QUESTION_KEY_SANITISER.sub("_", value).strip("._-")
    if not cleaned:
        return "unknown"
    return cleaned[:_MAX_QUESTION_KEY_LEN]


def _hashed_audio_prefix(study_slug: str, participant_token: UUID) -> str:
    """Return an opaque hex prefix for the audio S3 key.

    Pre-Wave-4 keys were ``audio/{study_slug}/{participant_token}/…``.
    To anyone with ``s3:ListBucket`` permission the slug + token leaked
    study existence and a per-participant identifier — and pre-
    anonymisation, the token bound the key directly to a row. Hashing
    the (slug + token) pair into an opaque hex prefix removes the
    re-identification surface from key listings while keeping the
    per-row ``s3_key`` deterministic and stable for delete/get-url
    flows (the row stores the full key).

    Reuses ``IP_HASH_SALT`` for the same operator-config reason as
    ``hash_ip`` and ``hash_user_agent`` (one salt, one var).
    Truncated to 32 hex chars (16 bytes) — the prefix only needs to
    avoid collisions across the bucket; the per-key uniqueness lives
    in the timestamp + question_key suffix.
    """
    salt = os.getenv("IP_HASH_SALT")
    if not salt:
        if os.getenv("DATABASE_URL", "").startswith("postgre"):
            raise ValueError(
                "IP_HASH_SALT environment variable MUST be set in production for privacy."
            )
        salt = "CHANGEME-insecure-dev-only"
    digest = hashlib.sha256(
        f"{study_slug}|{participant_token}|{salt}".encode()
    ).hexdigest()[:32]
    return digest


class StorageService:
    """S3/Cellar storage operations for audio files."""

    def __init__(self, skip_init: bool = False):
        """Initialize S3 client with configuration from settings.

        Args:
            skip_init: If True, skip initialization (useful for testing)
        """
        if skip_init:
            return

        if not all(
            [
                settings.S3_ENDPOINT_URL,
                settings.S3_BUCKET_NAME,
                settings.S3_ACCESS_KEY_ID,
                settings.S3_SECRET_ACCESS_KEY,
            ]
        ):
            raise ValueError(
                "S3 configuration incomplete. Check S3_* environment variables."
            )

        self.s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            config=BotoConfig(
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )
        # Presigned-URL client. When S3_PUBLIC_ENDPOINT_URL is set and differs
        # from the internal endpoint, presigned URLs must point at the
        # browser-reachable host, not the internal one (e.g. MinIO in
        # docker-compose: backend uploads via http://minio:9000, the
        # participant's browser plays back from http://localhost:9000).
        # Presigning is an offline SigV4 operation, so this client never has
        # to reach the public host. Otherwise reuse the single client.
        public_endpoint = settings.S3_PUBLIC_ENDPOINT_URL
        if public_endpoint and public_endpoint != settings.S3_ENDPOINT_URL:
            self.presign_client = boto3.client(
                "s3",
                endpoint_url=public_endpoint,
                region_name=settings.S3_REGION,
                aws_access_key_id=settings.S3_ACCESS_KEY_ID,
                aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                config=BotoConfig(
                    request_checksum_calculation="when_required",
                    response_checksum_validation="when_required",
                ),
            )
        else:
            self.presign_client = self.s3_client

        # settings.S3_BUCKET_NAME is str | None; the all() guard above guarantees
        # it is non-None at this point. Use an explicit raise (not assert) so the
        # narrow holds even if Python is run with -O.
        if settings.S3_BUCKET_NAME is None:
            raise RuntimeError("S3_BUCKET_NAME unset after S3 configuration validation")
        self.bucket_name: str = settings.S3_BUCKET_NAME

    async def upload_audio(
        self,
        content: bytes,
        content_type: str,
        study_slug: str,
        participant_token: UUID,
        question_key: str,
    ) -> AudioUploadMetadata:
        """
        Upload audio file to S3 and return metadata.

        Args:
            content: Audio file bytes
            content_type: MIME type of the audio file
            study_slug: Study identifier
            participant_token: Participant session token
            question_key: Question identifier (e.g., "card_123", "missing_statement")

        Returns:
            AudioUploadMetadata with s3_bucket, s3_key, file_size_bytes, mime_type

        Raises:
            HTTPException: If upload fails
        """
        file_size = len(content)

        # Generate S3 key with timestamp for uniqueness.
        # question_key is sanitised before being concatenated into the path
        # — see _sanitise_question_key for the threat model.
        # The (study, participant) prefix is a 32-char hex hash of
        # (slug, token, salt) — see _hashed_audio_prefix. This removes
        # study/participant metadata from S3 key listings (defence in
        # depth against an operator-side ListBucket leak). Pre-existing
        # rows keep their legacy key on disk; anonymisation deletes by
        # the per-row stored s3_key, so both formats coexist safely.
        timestamp = int(datetime.now(UTC).timestamp())
        extension = self._get_extension(content_type)
        safe_question_key = _sanitise_question_key(question_key)
        prefix = _hashed_audio_prefix(study_slug, participant_token)
        s3_key = f"audio/{prefix}/{timestamp}_{safe_question_key}{extension}"

        # Upload to S3 with retry for transient failures
        loop = asyncio.get_running_loop()
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                await loop.run_in_executor(
                    None,
                    lambda: self.s3_client.put_object(
                        Bucket=self.bucket_name,
                        Key=s3_key,
                        Body=content,
                        ContentLength=file_size,
                        ContentType=content_type,
                        # S3 object metadata: omit study_slug and
                        # participant_token to mirror the hashed-key
                        # treatment. Question key kept (sanitised) for
                        # operator debugging — it's the form-level
                        # context, not a participant identifier.
                        Metadata={
                            "question": safe_question_key,
                        },
                    ),
                )
                break
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if attempt < max_retries and error_code in (
                    "RequestTimeout",
                    "ServiceUnavailable",
                    "InternalError",
                    "SlowDown",
                ):
                    delay = 1.0 * (2**attempt)
                    logger.warning(
                        "S3 upload attempt %d/%d failed (%s), retrying in %.1fs",
                        attempt + 1,
                        max_retries + 1,
                        error_code,
                        delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error("S3 upload failed for key %s: %s", s3_key, e)
                    raise ServiceError("Audio upload failed")

        return {
            "s3_bucket": self.bucket_name,
            "s3_key": s3_key,
            "file_size_bytes": file_size,
            "mime_type": content_type,
        }

    def generate_presigned_url(self, s3_key: str, expiration: int = 3600) -> str:
        """
        Generate presigned URL for secure download.

        Args:
            s3_key: S3 object key
            expiration: URL expiration time in seconds (default: 1 hour)

        Returns:
            Presigned URL string

        Raises:
            ServiceError: If URL generation fails
        """
        try:
            url = self.presign_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": s3_key},
                ExpiresIn=expiration,
            )
            return str(url)  # boto3 stubs type generate_presigned_url as Any
        except ClientError as e:
            logger.error("Presigned URL generation failed for key %s: %s", s3_key, e)
            raise ServiceError("Failed to generate audio URL")

    async def download_object(self, s3_key: str) -> bytes:
        """
        Download an object from S3 and return its bytes.

        Args:
            s3_key: S3 object key

        Returns:
            Object content as bytes

        Raises:
            NotFoundError: If the S3 object does not exist
            ServiceError: If the download fails for another reason
        """
        try:
            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.s3_client.get_object(Bucket=self.bucket_name, Key=s3_key),
            )
            return cast(
                bytes, response["Body"].read()
            )  # boto3 stubs: StreamingBody.read() is Any
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "NoSuchKey":
                logger.warning("S3 object not found: %s", s3_key)
                raise NotFoundError("Audio file")
            logger.error("S3 download failed for key %s: %s", s3_key, e)
            raise ServiceError("Audio download failed")

    async def delete_audio(self, s3_key: str) -> None:
        """
        Delete audio file from S3.

        Args:
            s3_key: S3 object key

        Note:
            Logs but doesn't fail if file doesn't exist (idempotent operation)
        """
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: self.s3_client.delete_object(
                    Bucket=self.bucket_name, Key=s3_key
                ),
            )
        except ClientError as e:
            # Log but don't fail - file might already be deleted
            logger.warning("S3 deletion warning for key %s: %s", s3_key, e)

    def _get_extension(self, mime_type: str) -> str:
        """
        Map MIME type to file extension.

        Args:
            mime_type: MIME type string

        Returns:
            File extension with dot (e.g., ".webm")
        """
        mapping = {
            "audio/webm": ".webm",
            "video/webm": ".webm",
            "audio/mp4": ".m4a",
            "audio/mpeg": ".mp3",
            "audio/ogg": ".ogg",
        }
        return mapping.get(mime_type, ".webm")


# Singleton instance (lazy initialization)
_storage_service_instance = None


def get_storage_service() -> StorageService:
    """Get or create the storage service singleton."""
    global _storage_service_instance
    if _storage_service_instance is None:
        _storage_service_instance = StorageService()
    return _storage_service_instance


# For backward compatibility and convenience
try:
    storage_service = StorageService()
except ValueError:
    # In test environment or when S3 is not configured
    storage_service = StorageService(skip_init=True)
