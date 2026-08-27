# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Shared TypedDict wire shapes for JSON boundaries.

These TypedDicts document and enforce the structure of dicts that cross
service boundaries as JSON wire data.  They are *not* Pydantic models —
they carry no validation overhead and are resolved fully at type-check
time.

Placement rationale: types shared across more than one service live here
rather than in any single service module.  Types used only within one
service are defined private to that module.

Coverage:
    - Cluster 2 (StudyDump, SortDataDump, ParticipantDumpRecord, …)
    - Cluster 3 (StudyStats)
    - Cluster 4 (TranslationDefaults, StepHelpEntry)

Cluster 1 (AnalysisRunResult) lives in analysis_service.py because it
is only ever produced and consumed inside that module.
"""

from typing import TypedDict


# ---------------------------------------------------------------------------
# Cluster 4 — Translation defaults
# ---------------------------------------------------------------------------


class StepHelpEntry(TypedDict):
    """A single step-help pair (what / why) for one study step."""

    what: str
    why: str


class TranslationDefaults(TypedDict):
    """Inner value type for DEFAULT_TRANSLATION_CONTENT[locale].

    Mirrors the fields used by StudyTranslationBase (schemas/studies.py).
    ``ui_labels`` is deliberately omitted from DEFAULT_TRANSLATION_CONTENT
    (it has no default) so it is not included here.
    """

    instructions: str
    consent_title: str
    consent_description: str
    pre_instruction: str
    condition_of_instruction: str
    methodology_tips: list[str]
    step_help: dict[str, StepHelpEntry]


# ---------------------------------------------------------------------------
# Cluster 3 — Study statistics
# ---------------------------------------------------------------------------


class DeviceBreakdown(TypedDict):
    """Device-type count for a study."""

    mobile: int
    desktop: int


class StudyStats(TypedDict):
    """Return type of StudyDataService.get_study_stats()."""

    started_count: int
    completed_count: int
    completion_rate: float
    median_duration_seconds: float | None
    device_breakdown: DeviceBreakdown


# ---------------------------------------------------------------------------
# Cluster 2 — Study full dump  (get_study_full_dump / get_study_sort_data)
# ---------------------------------------------------------------------------


class StatementTranslation(TypedDict):
    """One translated text entry for a statement."""

    lang: str
    text: str


class StudyTranslationEntry(TypedDict):
    """One translated title entry for a study."""

    lang: str
    title: str


class StatementDumpRecord(TypedDict):
    """A statement as it appears in the full-dump or sort-data export."""

    id: int
    code: str
    translations: list[StatementTranslation]


class AudioRecordingEntry(TypedDict, total=False):
    """Audio recording metadata with presigned URL.

    All keys are present when a recording exists; the dict itself is the
    value type in ``ParticipantDumpRecord.audio_recordings``.
    """

    id: int
    duration_seconds: float | None
    file_size_bytes: int
    mime_type: str
    created_at: str
    presigned_url: str | None


class ParticipantDumpRecord(TypedDict):
    """One participant row in the full study dump (get_study_full_dump).

    ``presort`` / ``postsort`` are survey-response blobs whose schema is
    study-author-defined and genuinely heterogeneous; they stay as
    ``dict[str, object]``.  ``audio_recordings`` is keyed by question_key.
    ``scores`` may contain ``None`` for missing placements.
    """

    id: str
    db_id: int
    duration_seconds: float | None
    scores: list[int | None]
    placements: dict[int, int]
    presort: dict[str, object]
    postsort: dict[str, object]
    audio_recordings: dict[str, AudioRecordingEntry]
    language: str | None
    is_discarded: bool
    discard_reason: str | None
    status: str
    recruitment_token: str | None
    ip_address: str | None
    user_agent: str | None
    submitted_at: str | None
    created_at: str | None
    last_step_reached: int | None
    last_step_reached_at: str | None


class StudyDumpStudy(TypedDict):
    """The study sub-document inside a StudyDump."""

    slug: str
    state: str
    grid_config: list[dict[str, object]] | None
    presort_config: dict[str, object] | None
    postsort_config: dict[str, object] | None
    statements: list[StatementDumpRecord]
    translations: list[StudyTranslationEntry]


class StudyDump(TypedDict):
    """Return type of StudyDataService.get_study_full_dump()."""

    study: StudyDumpStudy
    participants: list[ParticipantDumpRecord]
    statement_id_to_index: dict[int, int]


# ---------------------------------------------------------------------------
# Lightweight sort-data variant (get_study_sort_data / build_sort_matrix)
# ---------------------------------------------------------------------------


class SortParticipantRecord(TypedDict):
    """Lightweight participant row used by the analysis pipeline."""

    id: str
    db_id: int
    scores: list[int | None]
    is_discarded: bool
    status: str


class SortDataStudy(TypedDict):
    """Study sub-document in the lightweight sort-data dump."""

    statements: list[StatementDumpRecord]
    grid_config: list[dict[str, object]] | None
    distribution_mode: str


class SortDataDump(TypedDict):
    """Return type of StudyDataService.get_study_sort_data()."""

    study: SortDataStudy
    participants: list[SortParticipantRecord]
