"""Rate limiting configuration using SlowAPI."""

import os

from slowapi import Limiter
from starlette.requests import Request

redis_url = os.getenv("REDIS_URL")
is_testing = os.getenv("TESTING", "").lower() == "true"


def _get_real_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind a reverse proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # First entry is the original client IP
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


if is_testing:
    # Disable rate limiting during tests
    limiter = Limiter(key_func=_get_real_ip, enabled=False)
elif redis_url:
    # Use Redis as storage if available (standard for Scalingo/Cloud)
    limiter = Limiter(key_func=_get_real_ip, storage_uri=redis_url)
else:
    # Fallback to in-memory for local development
    limiter = Limiter(key_func=_get_real_ip)
