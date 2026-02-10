# Libre-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""S3/Cellar storage service for audio file management."""

import asyncio
import logging
from datetime import datetime
from typing import Any
from uuid import UUID

import boto3  # type: ignore
from botocore.config import Config as BotoConfig  # type: ignore
from botocore.exceptions import ClientError  # type: ignore
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)


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
        self.bucket_name = settings.S3_BUCKET_NAME

    async def upload_audio(
        self,
        content: bytes,
        content_type: str,
        study_slug: str,
        participant_token: UUID,
        question_key: str,
    ) -> dict[str, Any]:
        """
        Upload audio file to S3 and return metadata.

        Args:
            content: Audio file bytes
            content_type: MIME type of the audio file
            study_slug: Study identifier
            participant_token: Participant session token
            question_key: Question identifier (e.g., "card_123", "missing_statement")

        Returns:
            Dictionary with s3_bucket, s3_key, file_size_bytes, mime_type

        Raises:
            HTTPException: If upload fails
        """
        file_size = len(content)

        # Generate S3 key with timestamp for uniqueness
        timestamp = int(datetime.utcnow().timestamp())
        extension = self._get_extension(content_type)
        s3_key = f"audio/{study_slug}/{participant_token}/{timestamp}_{question_key}{extension}"

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
                    raise HTTPException(status_code=500, detail="Audio upload failed")

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
            HTTPException: If URL generation fails
        """
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": s3_key},
                ExpiresIn=expiration,
            )
            return url
        except ClientError as e:
            logger.error("Presigned URL generation failed for key %s: %s", s3_key, e)
            raise HTTPException(status_code=500, detail="Failed to generate audio URL")

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
