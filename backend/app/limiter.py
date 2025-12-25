import os
from slowapi import Limiter
from slowapi.util import get_remote_address

redis_url = os.getenv("REDIS_URL")
if redis_url:
    # Use Redis as storage if available (standard for Scalingo/Cloud)
    limiter = Limiter(key_func=get_remote_address, storage_uri=redis_url)
else:
    # Fallback to in-memory for local development
    limiter = Limiter(key_func=get_remote_address)
