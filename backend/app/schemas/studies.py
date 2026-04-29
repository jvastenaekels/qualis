"""Study, translation, and statement schemas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import DistributionMode, StudyState

from .recruitment import RecruitmentLinkRead
from .projects import ProjectBrief


# Translation Schemas


class PartnerLogo(BaseModel):
    """Schema for a partner institution logo."""

    id: str
    name: str
    logo_url: str
    url: str | None = None


class ProcessStep(BaseModel):
    """Schema for a dynamic study process step."""

    id: str = Field(..., description="Unique ID for DND and tracking")
    title: str = Field(..., max_length=100)
    description: str = Field(..., max_length=500)
    icon: str = Field(..., description="Lucide icon name")
    color: str | None = Field(None, description="Hex color code or CSS variable")

    @field_validator("title", "description", "icon")
    @classmethod
    def validate_strings(cls, v: str) -> str:
        # Relaxed for drafts. Activation validation handles empty strings.
        return v


class StudyTranslationBase(BaseModel):
    """Base schema for study translations."""

    language_code: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    title: str = Field(..., max_length=200)
    description: str = Field("", max_length=5000)
    instructions: str | None = Field(None, max_length=5000)
    subtitle: str | None = Field(None, max_length=200)
    objective: str | None = Field(None, max_length=5000)
    condition_of_instruction: str | None = Field(None, max_length=1000)
    pre_instruction: str | None = Field(None, max_length=1000)

    consent_title: str | None = Field(None, max_length=200)
    consent_description: str | None = Field(None, max_length=5000)
    ui_labels: dict[str, Any] = {}
    process_steps: list[ProcessStep] = []
    methodology_tips: list[str] = []
    step_help: dict[str, dict[str, str]] = {}

    @field_validator(
        "title",
        "instructions",
        "subtitle",
        "objective",
        "condition_of_instruction",
        "pre_instruction",
        "consent_title",
        "consent_description",
    )
    @classmethod
    def validate_trans_strings(cls, v: str | None) -> str | None:
        """Relax validation for drafts - allow empty strings."""
        return v


class StudyTranslationCreate(StudyTranslationBase):
    """Schema for creating a study translation."""

    pass


class StudyTranslationRead(StudyTranslationBase):
    """Schema for reading a study translation."""

    id: int
    study_id: int
    model_config = ConfigDict(from_attributes=True)


# Statement Schemas


class StatementTranslationBase(BaseModel):
    """Base schema for statement translations."""

    language_code: str = Field(..., pattern="^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    text: str = Field(..., max_length=1000)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        # Relaxed for drafts. Activation validation handles empty strings.
        return v


class StatementTranslationCreate(StatementTranslationBase):
    """Schema for creating a statement translation."""

    pass


class StatementTranslationRead(StatementTranslationBase):
    """Schema for reading a statement translation."""

    id: int
    statement_id: int
    model_config = ConfigDict(from_attributes=True)


class StatementBase(BaseModel):
    """Base schema for statements."""

    code: str = Field(..., max_length=50)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        # Relaxed for drafts.
        return v


class StatementCreate(StatementBase):
    """Schema for creating a statement."""

    translations: list[StatementTranslationCreate]


class StatementRead(StatementBase):
    """Schema for reading a statement."""

    id: int
    display_order: int = 0
    translations: list[StatementTranslationRead] = []
    source_concourse_item_id: int | None = None
    source_imported_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class StatementUpdate(BaseModel):
    """Schema for updating a statement text (by code)."""

    code: str = Field(..., max_length=50)
    translations: list[StatementTranslationCreate]

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        # Relaxed for drafts.
        return v


class GridColumn(BaseModel):
    """Schema defining a column in the sorting grid."""

    score: int
    capacity: int


class BrandingBase(BaseModel):
    """Schema for study branding."""

    logo_url: str | None = Field(None, max_length=500)
    accent_color: str | None = Field(None, max_length=50)
    primary_color: str | None = Field(None, max_length=50)
    partners: list[PartnerLogo] = []


# Study Schemas


class StudyBase(BaseModel):
    """Base schema for studies."""

    slug: str = Field(..., pattern="^[a-z0-9-]+$", min_length=3, max_length=100)
    state: StudyState = StudyState.draft
    grid_config: list[GridColumn]
    presort_config: dict[str, Any]
    postsort_config: dict[str, Any]
    branding: BrandingBase | None = None
    default_language: str | None = Field(None, max_length=5)
    show_statement_codes: bool = False
    randomize_statement_order: bool = False
    symmetry_lock: bool = True
    distribution_mode: DistributionMode = DistributionMode.forced
    start_date: datetime | None = None
    end_date: datetime | None = None
    data_retention_months: int | None = Field(None, ge=1, le=240)


class StudyCreate(StudyBase):
    """Schema for creating a study."""

    translations: list[StudyTranslationCreate]
    statements: list[StatementCreate] = []


class StudyUpdate(BaseModel):
    """Schema for updating a study."""

    slug: str | None = Field(None, pattern="^[a-z0-9-]+$", min_length=3, max_length=100)
    state: StudyState | None = None
    grid_config: list[GridColumn] | None = None
    presort_config: dict[str, Any] | None = None
    postsort_config: dict[str, Any] | None = None
    branding: BrandingBase | None = None
    default_language: str | None = Field(None, max_length=5)
    show_statement_codes: bool | None = None
    randomize_statement_order: bool | None = None
    symmetry_lock: bool | None = None
    distribution_mode: DistributionMode | None = None
    translations: list[StudyTranslationCreate] | None = None
    statements: list[StatementUpdate] | None = None
    access_password: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    data_retention_months: int | None = Field(None, ge=1, le=240)
    last_updated_at: datetime | None = None

    # Note: Symmetry validation is skipped for drafts/updates to allow partial saves.
    # It is enforced only when transitioning state to 'active' in the service layer.


class StudyRead(StudyBase):
    """Schema for reading a study."""

    id: int
    project_id: int
    project: ProjectBrief | None = None
    created_at: datetime
    updated_at: datetime
    start_date: datetime | None = None
    end_date: datetime | None = None
    translations: list[StudyTranslationRead] = []
    statements: list[StatementRead] = []
    recruitment_links: list[RecruitmentLinkRead] = []
    requires_password: bool = False
    participant_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class StudyStatsRead(BaseModel):
    """Schema for study statistics."""

    started_count: int
    completed_count: int
    completion_rate: float
    median_duration_seconds: float | None
    device_breakdown: dict[str, int]  # e.g. {"mobile": 10, "desktop": 20}
