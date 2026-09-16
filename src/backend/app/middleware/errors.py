# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Middleware for global error handling and standardized responses."""

import logging
import traceback
from typing import Any, cast

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class StandardError(BaseModel):
    """Standardized error response schema."""

    code: str
    message: str
    details: Any | None = None


def create_error_response(
    status_code: int, code: str, message: str, details: Any = None
) -> JSONResponse:
    """Helper to return a standardized JSON response."""
    content = StandardError(code=code, message=message, details=details).model_dump()
    return JSONResponse(status_code=status_code, content=content)


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle standard HTTP exceptions (e.g., 404, 403) with standard schema."""
    # Cast to concrete type for access
    exc = cast(StarletteHTTPException, exc)
    code = "error"
    if exc.status_code == 404:
        code = "resource_not_found"
        if str(exc.detail) == "Not Found":
            exc.detail = "API endpoint not found"
    elif exc.status_code == 401:
        code = "unauthorized"
    elif exc.status_code == 403:
        code = "forbidden"
    elif exc.status_code == 409:
        code = "conflict"

    message = str(exc.detail)
    details = None

    if isinstance(exc.detail, dict):
        message = exc.detail.get("message", message)
        details = exc.detail.get("details", None)
        # If 'details' was not explicitly provided but we have other keys,
        # use the whole dict as details (minus message if redundant)
        if details is None:
            details = {k: v for k, v in exc.detail.items() if k != "message"}

    return create_error_response(
        status_code=exc.status_code,
        code=code,
        message=message,
        details=details,
    )


async def validation_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Handle Pydantic validation errors (422) with standard schema."""
    from fastapi.encoders import jsonable_encoder

    exc = cast(RequestValidationError, exc)
    # Pydantic v2 puts the submitted value under ``input`` (and sometimes
    # inside ``ctx``); a password one character too short would otherwise
    # be echoed to the client and written to the log. Keep what the
    # frontend renders — where, what, which rule — and nothing the user
    # typed. A 422 is the client's mistake, not an incident: WARNING.
    details = jsonable_encoder(
        [
            {k: v for k, v in err.items() if k in ("loc", "msg", "type")}
            for err in exc.errors()
        ]
    )
    logger.warning(
        "Validation error on %s %s: %s", request.method, request.url.path, details
    )
    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code="validation_error",
        message="Validation failed for the request.",
        details=details,
    )


async def sqlalchemy_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Handle Database errors (e.g., integrity constraints)."""
    logger.error(
        f"Database Error on {request.method} {request.url}: {str(exc)}\n"
        f"{traceback.format_exc()}"
    )

    if isinstance(exc, IntegrityError):
        # Unique-constraint violation. The driver message names the
        # constraint, the column and the conflicting value ("Key
        # (email)=(x@y) already exists"); it is in the log line above,
        # never in the response, or any path that does not catch the
        # error locally becomes an enumeration oracle.
        return create_error_response(
            status_code=status.HTTP_409_CONFLICT,
            code="conflict",
            message="A conflict occurred (e.g. unique constraint violation).",
        )

    # Convert generic DB errors to 500
    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="database_error",
        message="An unexpected database error occurred.",
    )


async def service_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle business-layer exceptions from the service layer."""
    from app.exceptions import (
        ConflictError,
        ForbiddenError,
        NotFoundError,
        ServiceError,
        ValidationError,
    )

    if isinstance(exc, NotFoundError):
        return create_error_response(
            status_code=status.HTTP_404_NOT_FOUND,
            code="resource_not_found",
            message=exc.message,
        )
    if isinstance(exc, ValidationError):
        return create_error_response(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="validation_error",
            message=exc.message,
        )
    if isinstance(exc, ConflictError):
        return create_error_response(
            status_code=status.HTTP_409_CONFLICT,
            code="conflict",
            message=exc.message,
        )
    if isinstance(exc, ForbiddenError):
        return create_error_response(
            status_code=status.HTTP_403_FORBIDDEN,
            code="forbidden",
            message=exc.message,
        )

    # ConcurrencyError and generic ServiceError → 500
    exc = cast(ServiceError, exc)
    logger.error(f"Service error on {request.method} {request.url}: {exc.message}")
    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="internal_server_error",
        message=exc.message,
    )


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global handler for all unhandled exceptions."""
    # Log the full traceback
    logger.error(
        f"Unhandled Exception on {request.method} {request.url}: {str(exc)}\n"
        f"{traceback.format_exc()}"
    )

    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="internal_server_error",
        message="An internal server error occurred.",
    )
