"""Settings.is_s3_configured capability flag."""

from app.core.config import Settings


def _settings(**over):
    base = dict(
        S3_ENDPOINT_URL="https://s3.example.com",
        S3_BUCKET_NAME="bucket",
        S3_ACCESS_KEY_ID="key",
        S3_SECRET_ACCESS_KEY="secret",
    )
    base.update(over)
    return Settings(**base)


def test_is_s3_configured_true_when_all_four_set():
    assert _settings().is_s3_configured is True


def test_is_s3_configured_false_when_endpoint_missing():
    assert _settings(S3_ENDPOINT_URL=None).is_s3_configured is False


def test_is_s3_configured_false_when_bucket_missing():
    assert _settings(S3_BUCKET_NAME=None).is_s3_configured is False


def test_is_s3_configured_false_when_access_key_missing():
    assert _settings(S3_ACCESS_KEY_ID=None).is_s3_configured is False


def test_is_s3_configured_false_when_secret_missing():
    assert _settings(S3_SECRET_ACCESS_KEY=None).is_s3_configured is False
