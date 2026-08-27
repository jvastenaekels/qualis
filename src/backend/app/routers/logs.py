"""API router for frontend logs."""

import logging
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel

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
async def report_log(entry: LogEntry, request: Request) -> dict[str, str]:
    """Receives logging/error data from the frontend."""
    # F-05-010: never log a raw client IP. Hash with the same
    # SHA-256 + IP_HASH_SALT used for participants.ip_address so the
    # log line is non-identifying while still letting an investigator
    # correlate frontend errors from the same source. The token-scrubber
    # filter (F-03-013) only handles query strings; `extra` payloads
    # need explicit redaction at write time.
    raw_ip = request.client.host if request.client else None
    client_ip_hash = hash_ip(raw_ip) if raw_ip else "unknown"

    log_payload = {
        "source": "frontend",
        "level": entry.level,
        "client_message": entry.message,
        "stack": entry.stack,
        "context": entry.context,
        "url": entry.url,
        "userAgent": entry.userAgent or request.headers.get("user-agent"),
        "ip_hash": client_ip_hash,
    }

    # Format meant for server logs (e.g., CloudWatch, Kibana friendly if JSONified)
    if entry.level.lower() == "error":
        frontend_logger.error(f"FRONTEND ERROR: {entry.message}", extra=log_payload)
        # Also print to standard console for immediate visibility during dev/docker logs
        print(f"[FRONTEND ERROR] {entry.message} | URL: {entry.url}")
        if entry.stack:
            print(f"Stack: {entry.stack}")
    elif entry.level.lower() == "warn":
        frontend_logger.warning(f"FRONTEND WARN: {entry.message}", extra=log_payload)
    else:
        frontend_logger.info(f"FRONTEND INFO: {entry.message}", extra=log_payload)

    return {"status": "received"}
