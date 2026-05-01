# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""S3/Cellar storage service for audio file management."""

import asyncio
import logging
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
        timestamp = int(datetime.now(UTC).timestamp())
        extension = self._get_extension(content_type)
        safe_question_key = _sanitise_question_key(question_key)
        s3_key = f"audio/{study_slug}/{participant_token}/{timestamp}_{safe_question_key}{extension}"

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
                        Metadata={
                            "study": study_slug,
                            "participant": str(participant_token),
                            "question": question_key,
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
            url = self.s3_client.generate_presigned_url(
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
