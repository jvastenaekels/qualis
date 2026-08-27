from app.utils.storage_mode import storage_mode_banner_lines


def test_banner_empty_when_s3_configured():
    assert storage_mode_banner_lines(s3_configured=True) == []


def test_banner_lists_consequences_when_s3_absent():
    lines = storage_mode_banner_lines(s3_configured=False)
    joined = "\n".join(lines)
    assert "Object storage is not configured" in joined
    assert "storage-optional mode" in joined
    assert "text-only" in joined.lower()
    assert "docs/guides/running-without-s3.md" in joined
    assert "S3_BUCKET_NAME" in joined
