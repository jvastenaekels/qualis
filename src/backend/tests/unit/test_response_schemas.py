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
        # missing required `participants` and `statement_id_to_index`
        StudyDumpResponse(study={"slug": "x"})


def test_study_dump_response_round_trip():
    """The runtime payload from StudyDataService.get_study_full_dump uses keys
    `study`, `participants`, `statement_id_to_index`. Pin that shape."""
    from app.schemas.responses import StudyDumpResponse

    payload = {
        "study": {"slug": "demo", "state": "active", "statements": []},
        "participants": [{"db_id": 1, "scores": []}],
        "statement_id_to_index": {1: 0, 2: 1},
        # extra dynamic key — must round-trip via extra='allow'
        "build_id": "abc",
    }
    dump = StudyDumpResponse.model_validate(payload)
    out = dump.model_dump()
    assert out["study"]["slug"] == "demo"
    assert out["participants"][0]["db_id"] == 1
    assert out["build_id"] == "abc"


def test_participant_export_response_shape():
    """Round-trip the participant JSON export shape."""
    from app.schemas.responses import ParticipantExportResponse

    payload = {
        "study": {"slug": "demo"},
        "participant": {"db_id": 5, "scores": [1, 2]},
        "statement_id_to_index": {42: 0},
    }
    export = ParticipantExportResponse.model_validate(payload)
    assert export.participant["db_id"] == 5


def test_submission_result_response_shape():
    """Submit endpoint returns status + confirmation_code + id, with optional
    already_submitted when re-submitting a completed participation."""
    from app.schemas.responses import SubmissionResultResponse

    fresh = SubmissionResultResponse(
        status="success", confirmation_code="ABCD1234", id=7
    )
    assert fresh.status == "success"
    assert fresh.already_submitted is None

    repeat = SubmissionResultResponse(
        status="success", confirmation_code="ABCD1234", id=7, already_submitted=True
    )
    assert repeat.already_submitted is True

    with pytest.raises(ValidationError):
        SubmissionResultResponse(status="success")  # missing confirmation_code, id
