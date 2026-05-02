# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""SQLAlchemy database models — re-export facade.

All public names are re-exported from sub-modules so that existing
``from app.models import X`` imports continue to work unchanged.

Sub-modules are imported in dependency order so SQLAlchemy's mapper
registry has all classes registered before forward-reference relationships
are resolved at first query time.
"""

# base — enums, constants, shared SQLAlchemy helpers
from .base import Any as Any
from .base import Base as Base
from .base import Boolean as Boolean
from .base import CheckConstraint as CheckConstraint
from .base import ConcourseItemStatus as ConcourseItemStatus
from .base import DateTime as DateTime
from .base import Float as Float
from .base import ForeignKey as ForeignKey
from .base import Integer as Integer
from .base import JSON as JSON
from .base import Mapped as Mapped
from .base import MemoParentType as MemoParentType
from .base import ParticipantStatus as ParticipantStatus
from .base import ProjectRole as ProjectRole
from .base import RecruitmentLinkType as RecruitmentLinkType
from .base import SAEnum as SAEnum
from .base import SESSION_TTL_DAYS as SESSION_TTL_DAYS
from .base import SmallInteger as SmallInteger
from .base import String as String
from .base import StudyRole as StudyRole
from .base import StudyState as StudyState
from .base import UUID as UUID
from .base import UniqueConstraint as UniqueConstraint
from .base import column_property as column_property
from .base import datetime as datetime
from .base import func as func
from .base import mapped_column as mapped_column
from .base import relationship as relationship
from .base import select as select
from .base import timedelta as timedelta
from .base import timezone as timezone
from .base import uuid4 as uuid4

# sub-domain models — import order matters for the SQLAlchemy registry
from .user import User as User
from .project import Project as Project
from .project import ProjectMember as ProjectMember
from .study import DistributionMode as DistributionMode
from .study import Statement as Statement
from .study import StatementTranslation as StatementTranslation
from .study import Study as Study
from .study import StudyTranslation as StudyTranslation
from .participant import AudioRecording as AudioRecording
from .participant import Participant as Participant
from .participant import QSortEntry as QSortEntry
from .recruitment import Invitation as Invitation
from .recruitment import RecruitmentLink as RecruitmentLink
from .concourse import Concourse as Concourse
from .concourse import ConcourseItem as ConcourseItem
from .concourse import ConcourseItemComment as ConcourseItemComment
from .concourse import ConcourseItemTag as ConcourseItemTag
from .concourse import ConcourseItemTranslation as ConcourseItemTranslation
from .concourse import ConcourseItemVersion as ConcourseItemVersion
from .concourse import ConcourseTag as ConcourseTag
from .analysis import AnalysisRun as AnalysisRun
from .memo import MemoComment as MemoComment
from .memo import MemoEntry as MemoEntry
from .email_token import ConsumedEmailToken as ConsumedEmailToken
from .twofa_email_otp import TwoFAEmailOTPCode as TwoFAEmailOTPCode

# Computed column properties (defined after all models to avoid circular references)
# Study.participant_count references Participant, so it must be set here after
# both Study and Participant are imported and registered.
Study.participant_count = column_property(  # type: ignore[attr-defined]
    select(func.count(Participant.id))
    .where(
        Participant.study_id == Study.id,
        Participant.is_discarded.is_(False),
        Participant.status == ParticipantStatus.completed,
    )
    .correlate(Study)
    .scalar_subquery()
)
