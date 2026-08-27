"""Shared validation helpers and pagination schemas."""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


def validate_non_empty_string(v: str | None) -> str | None:
    """Validator to ensure string is not empty or whitespace-only."""
    if v is None:
        return None
    if not v.strip():
        raise ValueError("String cannot be empty or whitespace only")
    return v.strip()


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""

    items: list[T]
    total: int
    limit: int
    offset: int
