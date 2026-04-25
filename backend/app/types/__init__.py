# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Shared TypedDict wire shapes for JSON boundaries."""

from .wire import (
    AudioRecordingEntry,
    ParticipantDumpRecord,
    SortDataDump,
    SortDataStudy,
    SortParticipantRecord,
    StatementDumpRecord,
    StatementTranslation,
    StudyDump,
    StudyDumpStudy,
    StudyStats,
    StepHelpEntry,
    TranslationDefaults,
)

__all__ = [
    "AudioRecordingEntry",
    "ParticipantDumpRecord",
    "SortDataDump",
    "SortDataStudy",
    "SortParticipantRecord",
    "StatementDumpRecord",
    "StatementTranslation",
    "StudyDump",
    "StudyDumpStudy",
    "StudyStats",
    "StepHelpEntry",
    "TranslationDefaults",
]
