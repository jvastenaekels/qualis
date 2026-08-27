"""Shared response schemas for endpoints whose payloads are too narrow to
deserve their own dedicated schemas file.

These exist primarily so FastAPI emits a named openapi schema (not
`additionalProperties: true`), which lets orval generate proper TypeScript
interfaces instead of opaque `{[k:string]:unknown}` wrappers.
"""

from pydantic import BaseModel, ConfigDict, Field


class AckResponse(BaseModel):
    """Generic acknowledgement: `{status: "...", details?: "..."}`.

    Used by endpoints that mutate state and only need to confirm success
    (save_draft, update_progress, change_password, disable_totp, unlock_study).
    """

    status: str = Field(description="Short status token, e.g. 'ok' or 'unlocked'.")
    details: str | None = Field(
        default=None, description="Optional human-readable explanation."
    )


class StorageUsageResponse(BaseModel):
    """Audio storage usage for a study (returned by GET /storage-usage)."""

    total_bytes: int
    total_mb: float
    file_count: int
    quota_mb: int
    quota_bytes: int
    usage_percent: float


class TOTPEnableResponse(BaseModel):
    """Result of enabling 2FA: status token + backup recovery codes."""

    status: str
    backup_codes: list[str] = Field(
        default_factory=list,
        description="One-time backup codes to store offline.",
    )


class ResolvedStudyConfigResponse(BaseModel):
    """Public study config returned by GET /api/study/{slug}.

    The runtime payload is rich and partially dynamic (translation-resolved
    fields, optional pre/post-sort configs, ui_labels, branding) — too much
    to enumerate exhaustively here without dragging the StudyConfig zod
    schema's structure into Pydantic. We declare the well-known top-level
    fields the frontend always reads and accept additional keys via
    `extra='allow'`. This is enough for orval to emit a real interface
    instead of an opaque dict.
    """

    model_config = ConfigDict(extra="allow")

    slug: str
    title: str
    description: str = ""
    instructions: str | None = None
    language: str | None = None
    requires_password: bool = False


class StudyDumpResponse(BaseModel):
    """Admin full-study dump (GET /admin/studies/{slug}/dump).

    Open shape — the runtime payload is the StudyDump TypedDict from
    `app.types.wire`: `{study, participants, statement_id_to_index}`. We
    declare the well-known top-level keys as `dict` / `list` and accept
    additional keys via `extra='allow'` so orval emits a named interface
    rather than an opaque dict.
    """

    model_config = ConfigDict(extra="allow")

    study: dict[str, object]
    participants: list[dict[str, object]]
    statement_id_to_index: dict[int, int]


class ParticipantExportResponse(BaseModel):
    """Admin participant JSON export (GET /admin/.../participants/{id}/export/json).

    Open shape — the payload is `{study, participant, statement_id_to_index}`,
    a single-participant slice of the full StudyDump. `extra='allow'` lets
    additional dynamic keys survive round-tripping.
    """

    model_config = ConfigDict(extra="allow")

    study: dict[str, object]
    participant: dict[str, object]
    statement_id_to_index: dict[int, int]


class SubmissionResultResponse(BaseModel):
    """Result of a participant Q-sort submission (POST /api/submit).

    Returned by the submit endpoint after StudyService.process_submission
    completes. `already_submitted` is only present when re-submitting a
    completed participation. `extra='allow'` covers any future additions.
    """

    model_config = ConfigDict(extra="allow")

    status: str
    confirmation_code: str
    id: int
    already_submitted: bool | None = None
