"""Rate limiting configuration using SlowAPI."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

redis_url = os.getenv("REDIS_URL")
is_testing = os.getenv("TESTING", "").lower() == "true"

if is_testing:
    # Disable rate limiting during tests
    limiter = Limiter(key_func=get_remote_address, enabled=False)
elif redis_url:
    # Use Redis as storage if available (standard for Scalingo/Cloud)
    limiter = Limiter(key_func=get_remote_address, storage_uri=redis_url)
else:
    # Fallback to in-memory for local development
    limiter = Limiter(key_func=get_remote_address)
