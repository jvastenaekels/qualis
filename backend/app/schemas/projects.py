"""Project schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ProjectRole

from .common import QuotaInfo, validate_non_empty_string
from .users import UserRead


class ProjectMemberRead(BaseModel):
    """Schema for reading project member details."""

    user_id: int
    user: UserRead
    role: ProjectRole
    joined_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProjectBrief(BaseModel):
    """Lightweight project schema (no members) for nested use in StudyRead."""

    id: int
    title: str
    slug: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProjectRead(ProjectBrief):
    """Schema for reading a project with members."""

    members: list[ProjectMemberRead] = []
    member_quota: QuotaInfo


class ProjectWithRole(ProjectRead):
    """Schema for reading a project with the current user's role."""

    user_role: ProjectRole


class ProjectCreate(BaseModel):
    """Schema for creating a project."""

    title: str = Field(..., max_length=100)
    slug: str = Field(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=50)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        res = validate_non_empty_string(v)
        if res is None:
            raise ValueError("String cannot be empty")
        return res


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""

    title: str | None = Field(None, max_length=100)
    slug: str | None = Field(None, pattern="^[a-z0-9-]+$", min_length=3, max_length=50)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        return validate_non_empty_string(v)


class ProjectMemberUpdate(BaseModel):
    """Schema for updating a project member."""

    role: ProjectRole


class ProjectInvitationCreate(BaseModel):
    """Schema for creating a project invitation."""

    email: str
    role: ProjectRole = ProjectRole.member
