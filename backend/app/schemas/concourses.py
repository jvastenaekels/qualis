"""Concourse, item, tag, and translation schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ConcourseItemStatus


# Tag Schemas


class ConcourseTagCreate(BaseModel):
    """Schema for creating a workspace-scoped tag."""

    name: str = Field(..., max_length=100, min_length=1)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$", max_length=7)


class ConcourseTagRead(ConcourseTagCreate):
    """Schema for reading a tag."""

    id: int
    workspace_id: int
    model_config = ConfigDict(from_attributes=True)


# Item Translation Schemas


class ConcourseItemTranslationBase(BaseModel):
    """Base schema for concourse item translations."""

    language_code: str = Field(..., pattern=r"^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    text: str = Field(..., max_length=1000)


class ConcourseItemTranslationCreate(ConcourseItemTranslationBase):
    """Schema for creating a concourse item translation."""


class ConcourseItemTranslationRead(ConcourseItemTranslationBase):
    """Schema for reading a concourse item translation."""

    id: int
    item_id: int
    model_config = ConfigDict(from_attributes=True)


# Item Schemas


class ConcourseItemCreate(BaseModel):
    """Schema for creating a concourse item."""

    code: str = Field(..., max_length=50)
    source: str | None = Field(None, max_length=500)
    status: ConcourseItemStatus = ConcourseItemStatus.proposed
    translations: list[ConcourseItemTranslationCreate] = Field(..., min_length=1)
    tag_ids: list[int] = []


class ConcourseItemRead(BaseModel):
    """Schema for reading a concourse item."""

    id: int
    code: str
    status: ConcourseItemStatus
    source: str | None = None
    version: int
    display_order: int
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime
    translations: list[ConcourseItemTranslationRead] = []
    tags: list[ConcourseTagRead] = []
    comment_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class ConcourseItemUpdate(BaseModel):
    """Schema for updating a concourse item. Version is required for optimistic locking."""

    version: int = Field(..., description="Current version for optimistic locking")
    code: str | None = Field(None, max_length=50)
    source: str | None = Field(None, max_length=500)
    status: ConcourseItemStatus | None = None
    translations: list[ConcourseItemTranslationCreate] | None = None
    tag_ids: list[int] | None = None
    change_comment: str | None = Field(None, max_length=500)


class ConcourseItemBulkCreate(BaseModel):
    """Schema for bulk-creating concourse items."""

    items: list[ConcourseItemCreate] = Field(..., min_length=1, max_length=500)


class ConcourseItemBulkImport(BaseModel):
    """Schema for importing items from a text block (one statement per line)."""

    text_block: str = Field(..., min_length=1, max_length=100_000)
    language_code: str = Field(..., pattern=r"^[a-z]{2}(-[A-Z]{2})?$", max_length=5)
    code_prefix: str = Field("C", max_length=20)

    @field_validator("text_block")
    @classmethod
    def validate_not_blank(cls, v: str) -> str:
        if not v.strip():
            msg = "Text block must contain at least one non-empty line"
            raise ValueError(msg)
        return v


# Concourse Schemas


class ConcourseCreate(BaseModel):
    """Schema for creating a concourse."""

    title: str = Field(..., max_length=200, min_length=1)
    description: str | None = Field(None, max_length=2000)


class ConcourseUpdate(BaseModel):
    """Schema for updating a concourse."""

    title: str | None = Field(None, max_length=200, min_length=1)
    description: str | None = Field(None, max_length=2000)


class ConcourseRead(BaseModel):
    """Schema for reading a concourse (list view)."""

    id: int
    workspace_id: int
    title: str
    description: str | None = None
    item_count: int = 0
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ConcourseDetailRead(ConcourseRead):
    """Schema for reading a concourse with items (detail view)."""

    items: list[ConcourseItemRead] = []


class ConcourseImportToStudy(BaseModel):
    """Schema for importing concourse items into a study as statements."""

    concourse_id: int
    item_ids: list[int] = Field(..., min_length=1, max_length=500)
    code_prefix: str = Field("", max_length=20)
    replace_existing: bool = False


class StaleTranslation(BaseModel):
    """A single translation in a staleness diff."""

    language_code: str
    text: str


class StaleStatementRead(BaseModel):
    """A statement whose concourse source has changed since import."""

    statement_id: int
    statement_code: str
    source_concourse_item_id: int
    source_deleted: bool
    current_translations: list[StaleTranslation]
    concourse_translations: list[StaleTranslation]


# Version & Comment Schemas


class ConcourseItemVersionRead(BaseModel):
    """Schema for reading a concourse item version snapshot."""

    id: int
    item_id: int
    version_number: int
    code: str
    status: ConcourseItemStatus
    source: str | None = None
    translations_snapshot: list[dict[str, str]] = []
    tag_ids_snapshot: list[int] = []
    change_comment: str | None = None
    changed_by: int | None = None
    changed_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ConcourseItemCommentCreate(BaseModel):
    """Schema for creating a comment on a concourse item."""

    body: str = Field(..., min_length=1, max_length=2000)


class ConcourseItemCommentRead(BaseModel):
    """Schema for reading a comment on a concourse item."""

    id: int
    item_id: int
    user_id: int | None = None
    body: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
