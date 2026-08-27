# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Pydantic schemas for the memo subsystem."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


MemoParentTypeLiteral = Literal["concourse", "study"]


class MemoCommentBase(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class MemoCommentCreate(MemoCommentBase):
    mentions: list[int] = Field(default_factory=list)


class MemoCommentUpdate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class MemoCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entry_id: int
    user_id: int | None
    body: str
    mentions: list[int]
    resolved: bool
    resolved_at: datetime | None
    resolved_by: int | None
    deleted: bool
    created_at: datetime
    updated_at: datetime


class MemoEntryBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(default="", max_length=10000)


class MemoEntryCreate(MemoEntryBase):
    position: int | None = None  # server appends if None


class MemoEntryUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    body: str | None = Field(None, max_length=10000)
    position: int | None = None


class MemoEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_type: MemoParentTypeLiteral
    parent_id: int
    title: str
    body: str
    position: int
    created_at: datetime
    updated_at: datetime
    created_by: int | None
    last_edited_by: int | None
    comments: list[MemoCommentRead]


class MemoRead(BaseModel):
    parent_type: MemoParentTypeLiteral
    parent_id: int
    entries: list[MemoEntryRead]


class MemoTemplate(BaseModel):
    id: str
    title: str
    description: str
