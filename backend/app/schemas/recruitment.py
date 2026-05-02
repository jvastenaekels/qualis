"""Recruitment link and invitation schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import RecruitmentLinkType, ProjectRole

from .common import validate_non_empty_string


class RecruitmentLinkBase(BaseModel):
    """Base schema for recruitment links."""

    name: str | None = Field(None, max_length=100)
    type: RecruitmentLinkType = RecruitmentLinkType.public
    capacity: int | None = Field(None, gt=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class RecruitmentLinkCreate(RecruitmentLinkBase):
    """Schema for creating a recruitment link."""

    pass


class RecruitmentLinkRead(RecruitmentLinkBase):
    """Schema for reading a recruitment link."""

    id: int
    study_id: int
    token: str
    usage_count: int
    start_count: int
    expires_at: datetime | None = None
    is_active: bool = True
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# Invitation Schemas


class InvitationCreate(BaseModel):
    """Schema for creating a study/project invitation."""

    email: str
    role: ProjectRole = ProjectRole.member


class InvitationLink(BaseModel):
    """Schema for returning a generated invitation link."""

    invite_url: str
    token: str
