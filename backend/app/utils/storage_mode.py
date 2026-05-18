"""Operator-facing startup banner for S3-optional mode."""


def storage_mode_banner_lines(*, s3_configured: bool) -> list[str]:
    """Return the log lines to emit at startup describing storage
    capabilities. Empty when S3 is configured (nothing to warn about)."""
    if s3_configured:
        return []
    return [
        "Object storage (S3) is not configured — Qualis runs in STORAGE-OPTIONAL mode.",
        "  Studies run normally; audio capture is unavailable.",
        "  Any study with audio enabled silently degrades to text-only responses:",
        "  no audio is collected and no error is shown to participants.",
        "  To enable audio, set S3_ENDPOINT_URL, S3_BUCKET_NAME, S3_ACCESS_KEY_ID,",
        "  S3_SECRET_ACCESS_KEY and restart.",
        "  See docs/guides/running-without-s3.md for the capability matrix.",
    ]
