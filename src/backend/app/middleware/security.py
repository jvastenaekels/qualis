# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Middleware for security headers."""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings


class SecurityHeadersMiddleware:
    """Pure ASGI middleware to add security headers.

    More performant and robust than BaseHTTPMiddleware for simple header injection.
    """

    def __init__(self, app: ASGIApp):
        """Initialize the middleware."""
        self.app = app
        # Build media-src dynamically to include S3 endpoint for presigned URL playback
        media_sources = "'self' blob:"
        if settings.S3_ENDPOINT_URL:
            media_sources += f" {settings.S3_ENDPOINT_URL}"
        self._csp = (
            f"default-src 'self'; script-src 'self'; "
            f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            f"img-src 'self' data: https:; "
            f"font-src 'self' data: https: https://fonts.gstatic.com; "
            f"connect-src 'self' https:; "
            f"media-src {media_sources}; "
            f"frame-ancestors 'none'; upgrade-insecure-requests;"
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Handle the ASGI request."""
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))

                # Security Headers
                security_headers = [
                    (
                        b"Strict-Transport-Security",
                        b"max-age=63072000; includeSubDomains; preload",
                    ),
                    (b"X-Content-Type-Options", b"nosniff"),
                    (b"X-Frame-Options", b"DENY"),
                    (b"X-XSS-Protection", b"1; mode=block"),
                    (
                        b"Content-Security-Policy",
                        self._csp.encode(),
                    ),
                    (b"Referrer-Policy", b"strict-origin-when-cross-origin"),
                    (
                        b"Permissions-Policy",
                        b"camera=(), microphone=(self), geolocation=(), interest-cohort=()",
                    ),
                ]

                for name, value in security_headers:
                    # Check if header already exists to avoid duplicates
                    if not any(h[0].lower() == name.lower() for h in headers):
                        headers.append((name, value))

                message["headers"] = headers

            await send(message)

        await self.app(scope, receive, send_wrapper)
