"""Unit tests for shared response schemas."""

import pytest
from pydantic import ValidationError

from app.schemas.responses import (
    AckResponse,
    StorageUsageResponse,
    TOTPEnableResponse,
)


def test_ack_response_minimal():
    ack = AckResponse(status="ok")
    assert ack.status == "ok"
    assert ack.details is None


def test_ack_response_with_details():
    ack = AckResponse(status="unlocked", details="No password required")
    assert ack.status == "unlocked"
    assert ack.details == "No password required"


def test_storage_usage_response_required_fields():
    usage = StorageUsageResponse(
        total_bytes=1024,
        total_mb=0.001,
        file_count=5,
        quota_mb=100,
        quota_bytes=104857600,
        usage_percent=0.001,
    )
    assert usage.total_bytes == 1024
    assert usage.file_count == 5


def test_storage_usage_response_rejects_missing_fields():
    with pytest.raises(ValidationError):
        StorageUsageResponse(total_bytes=1024)  # missing other required fields


def test_totp_enable_response_shape():
    resp = TOTPEnableResponse(status="enabled", backup_codes=["abc", "def"])
    assert resp.status == "enabled"
    assert len(resp.backup_codes) == 2


def test_resolved_study_config_preserves_extra_keys():
    """The `extra='allow'` config is the load-bearing reason these schemas exist
    (so orval generates real interfaces, not opaque dicts). Pin it with a
    round-trip test: any unknown key must survive model_dump()."""
    from app.schemas.responses import ResolvedStudyConfigResponse

    payload = {
        "slug": "demo",
        "title": "Demo Study",
        "description": "A study",
        "statements": [{"id": 1, "text": "A statement"}],
        "grid_config": [{"score": -1, "capacity": 1}],
    }
    resolved = ResolvedStudyConfigResponse.model_validate(payload)
    out = resolved.model_dump()
    assert out["statements"] == [{"id": 1, "text": "A statement"}]
    assert out["grid_config"] == [{"score": -1, "capacity": 1}]


def test_study_dump_response_rejects_missing_required_fields():
    """Symmetric to test_storage_usage_response_rejects_missing_fields:
    `extra='allow'` does not relax the required-field validation."""
    from app.schemas.responses import StudyDumpResponse

    with pytest.raises(ValidationError):
        StudyDumpResponse(slug="x")  # missing required `id`
