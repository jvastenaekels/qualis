"""Rate limiting configuration using SlowAPI."""

import hashlib
import os

from slowapi import Limiter
from starlette.requests import Request

from app.core.config import settings

redis_url = os.getenv("REDIS_URL")
is_testing = os.getenv("TESTING", "").lower() == "true"


def _get_real_ip(request: Request) -> str:
    """Extract client IP for rate limiting.

    Trust model (audit F-01-004): X-Forwarded-For is spoofable by any
    direct caller. We only honour the header when the immediate TCP
    peer (`request.client.host`) is listed in `Settings.TRUSTED_PROXIES`,
    or when that setting is `*` (operator declares the deployment is
    behind a known reverse proxy / load balancer that strips and
    rewrites the header).

    Default = empty trusted-proxy list = ignore the header entirely. This
    is safe for direct-exposed deployments (the rate limiter keys on the
    real TCP peer). Operators behind Scalingo / Heroku / Cloudflare /
    nginx etc. should set `TRUSTED_PROXIES=*` (or the specific
    proxy IPs) in their environment.
    """
    direct_peer = request.client.host if request.client else "127.0.0.1"
    trusted = settings.trusted_proxies_list

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and trusted and ("*" in trusted or direct_peer in trusted):
        # First entry is the original client IP per RFC 7239 convention
        return forwarded.split(",")[0].strip()

    return direct_peer


async def email_hash_key_func(request: Request) -> str:
    """Rate-limit key based on lowercased-email hash, for anti-enumeration.

    Reads the JSON body's ``email`` field and returns a SHA-256 prefix so
    that brute-force attempts on a specific address are limited regardless
    of source IP.  Falls back to the per-request IP key (_get_real_ip) when
    the body is missing, unparseable, or contains no ``email`` field — this
    keeps the limiter functional even when a misconfigured client omits the
    field.  The IP-based limiter is still applied separately on every
    endpoint that uses this key, so the fallback is defense-in-depth, not
    the primary gate.

    Body-reading safety: ``Request.body()`` (called internally by
    ``Request.json()``) stores its bytes on ``request._body`` after the
    first read.  Subsequent reads by Starlette / FastAPI hit the cache, so
    calling this key_func first does *not* consume the stream for the route
    handler.
    """
    try:
        body = await request.json()
        email = (
            str(body.get("email", "")).lower().strip() if isinstance(body, dict) else ""
        )
    except Exception:
        email = ""
    if not email:
        return _get_real_ip(request)
    return "email:" + hashlib.sha256(email.encode("utf-8")).hexdigest()[:32]


def resume_code_key_func_sync(request: Request) -> str:
    """Rate-limit key based on the path-bound resume ``code``.

    F-06-001: layered with the per-IP limit on
    ``GET /api/study/{slug}/resume/{code}`` so a distributed brute-force
    spread across many IPs is bounded by a per-code attempt cap. Returns
    a SHA-256 prefix of the code so the limiter storage doesn't carry
    raw codes; the slug is mixed in to reduce collision risk should the
    same code ever appear in two studies (the DB unique constraint
    prevents this today, but the keying stays robust under that
    invariant changing).

    Falls back to per-IP keying if the path params are missing (e.g.
    middleware ordering edge cases). The IP-based limiter is still
    applied separately on the same endpoint, so the fallback is
    defence-in-depth, not the primary gate.
    """
    code = ""
    slug = ""
    path_params = getattr(request, "path_params", None)
    if isinstance(path_params, dict):
        raw_code = path_params.get("code", "")
        raw_slug = path_params.get("slug", "")
        if isinstance(raw_code, str):
            code = raw_code.lower()
        if isinstance(raw_slug, str):
            slug = raw_slug.lower()
    if not code:
        return _get_real_ip(request)
    composite = f"{slug}|{code}".encode("utf-8")
    return "resume:" + hashlib.sha256(composite).hexdigest()[:32]


def email_hash_key_func_sync(request: Request) -> str:
    """Sync version of email_hash_key_func for use with slowapi decorators.

    slowapi's ``@limiter.limit(key_func=...)`` calls the key function
    synchronously (no await), so an async key_func cannot be passed directly.
    This version reads ``request._body`` — the body cache that Starlette
    populates after the first ``await request.body()`` call — which is always
    available when slowapi invokes the key_func (after the ASGI body has been
    read by the framework).  Falls back to IP when the cache is cold or the
    body has no ``email`` field.
    """
    import json

    try:
        raw: bytes = getattr(request, "_body", b"") or b""
        body = json.loads(raw) if raw else {}
        email = (
            str(body.get("email", "")).lower().strip() if isinstance(body, dict) else ""
        )
    except Exception:
        email = ""
    if not email:
        return _get_real_ip(request)
    return "email:" + hashlib.sha256(email.encode("utf-8")).hexdigest()[:32]


if is_testing:
    # Disable rate limiting during tests
    limiter = Limiter(key_func=_get_real_ip, enabled=False)
elif redis_url:
    # Use Redis as storage if available (standard for Scalingo/Cloud)
    limiter = Limiter(key_func=_get_real_ip, storage_uri=redis_url)
else:
    # Fallback to in-memory for local development
    limiter = Limiter(key_func=_get_real_ip)
