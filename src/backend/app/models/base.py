# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Shared base, session constants, and domain enums for all model modules."""

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    select,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship
from sqlalchemy.sql import func

from ..database import Base

# Sessions expire after this many days of inactivity (based on last_step_reached_at)
SESSION_TTL_DAYS: int = 60


# Enums
class StudyState(str, Enum):
    """Enum for study lifecycle states."""

    draft = "draft"
    active = "active"
    paused = "paused"
    closed = "closed"
    archived = "archived"


class ConcourseItemStatus(str, Enum):
    """Enum for concourse item curation status."""

    proposed = "proposed"
    accepted = "accepted"
    rejected = "rejected"


class ParticipantStatus(str, Enum):
    """Enum for participant progress status."""

    started = "started"
    completed = "completed"


class ProjectRole(str, Enum):
    """Enum for project roles."""

    owner = "owner"
    member = "member"  # Renamed from `researcher` (project-roles-refactor 2026-05-02).
    viewer = "viewer"


class StudyRole(str, Enum):
    """Enum for study-specific roles."""

    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class MemoParentType(str, Enum):
    """Discriminator for the polymorphic memo subsystem."""

    concourse = "concourse"
    study = "study"


class RecruitmentLinkType(str, Enum):
    """Enum for types of recruitment links."""

    public = "public"
    individual = "individual"
    limited = "limited"


__all__ = [
    # re-exported from ..database
    "Base",
    # SQLAlchemy imports re-exported for sub-modules
    "JSON",
    "Boolean",
    "CheckConstraint",
    "DateTime",
    "Float",
    "ForeignKey",
    "Integer",
    "SmallInteger",
    "String",
    "UniqueConstraint",
    "select",
    "SAEnum",
    "Mapped",
    "column_property",
    "mapped_column",
    "relationship",
    "func",
    # stdlib
    "datetime",
    "timedelta",
    "timezone",
    "Any",
    "UUID",
    "uuid4",
    # constants
    "SESSION_TTL_DAYS",
    # enums
    "StudyState",
    "ConcourseItemStatus",
    "ParticipantStatus",
    "ProjectRole",
    "StudyRole",
    "MemoParentType",
    "RecruitmentLinkType",
]
