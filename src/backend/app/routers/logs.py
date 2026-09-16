"""API router for frontend logs."""

import logging
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.limiter import limiter
from app.middleware.log_scrub import scrub_token_query
from app.utils.crypto import hash_ip

# Configure logger specifically for frontend errors
frontend_logger = logging.getLogger("frontend_error")
frontend_logger.setLevel(logging.ERROR)

# You might want to attach a specific handler here if not already handled by root
# For now, it will bubble up to the root logger which usually prints to stdout/stderr

router = APIRouter()


class LogEntry(BaseModel):
    """Schema for frontend log entries."""

    level: Literal["error", "warn", "info", "debug"]
    message: str
    stack: str | None = None
    context: dict[str, Any] | None = None
    url: str | None = None
    userAgent: str | None = None


@router.post("/logs")
@limiter.limit("30/minute")
async def report_log(entry: LogEntry, request: Request) -> dict[str, str]:
    """Receives logging/error data from the frontend.

    Anonymous by design (the error boundary fires for participants too),
    so it is rate-limited per IP like every other unauthenticated write.
    """
    # F-05-010: never log a raw client IP. Hash with the same
    # SHA-256 + IP_HASH_SALT used for participants.ip_address so the
    # log line is non-identifying while still letting an investigator
    # correlate frontend errors from the same source. The token-scrubber
    # filter (F-03-013) only handles query strings; `extra` payloads
    # need explicit redaction at write time.
    raw_ip = request.client.host if request.client else None
    client_ip_hash = hash_ip(raw_ip) if raw_ip else "unknown"

    # The scrub filter on ``frontend_error`` rewrites the message, but
    # ``extra`` values land on the record as attributes that a structured
    # sink emits verbatim, so the URL-bearing fields are scrubbed here.
    log_payload = {
        "source": "frontend",
        "level": entry.level,
        "client_message": scrub_token_query(entry.message),
        "stack": scrub_token_query(entry.stack) if entry.stack else None,
        "context": entry.context,
        "url": scrub_token_query(entry.url) if entry.url else None,
        "userAgent": entry.userAgent or request.headers.get("user-agent"),
        "ip_hash": client_ip_hash,
    }

    # One structured record per report; the root handler already writes
    # it to the console, so no print() — print bypasses every filter.
    if entry.level.lower() == "error":
        frontend_logger.error(
            "FRONTEND ERROR: %s | url=%s | stack=%s",
            entry.message,
            entry.url,
            entry.stack,
            extra=log_payload,
        )
    elif entry.level.lower() == "warn":
        frontend_logger.warning("FRONTEND WARN: %s", entry.message, extra=log_payload)
    else:
        frontend_logger.info("FRONTEND INFO: %s", entry.message, extra=log_payload)

    return {"status": "received"}
