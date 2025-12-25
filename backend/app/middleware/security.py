# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

from starlette.types import ASGIApp, Scope, Receive, Send

class SecurityHeadersMiddleware:
    """
    Pure ASGI middleware to add security headers.
    More performant and robust than BaseHTTPMiddleware for simple header injection.
    """
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                
                # Security Headers
                security_headers = [
                    (b"Strict-Transport-Security", b"max-age=63072000; includeSubDomains; preload"),
                    (b"X-Content-Type-Options", b"nosniff"),
                    (b"X-Frame-Options", b"DENY"),
                    (b"X-XSS-Protection", b"1; mode=block"),
                    (b"Content-Security-Policy", b"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https: https://fonts.gstatic.com; connect-src 'self' https:; frame-ancestors 'none'; upgrade-insecure-requests;"),
                    (b"Referrer-Policy", b"strict-origin-when-cross-origin"),
                    (b"Permissions-Policy", b"camera=(), microphone=(), geolocation=(), interest-cohort=()"),
                ]
                
                for name, value in security_headers:
                    # Check if header already exists to avoid duplicates
                    if not any(h[0].lower() == name.lower() for h in headers):
                        headers.append((name, value))
                
                message["headers"] = headers
            
            await send(message)

        await self.app(scope, receive, send_wrapper)
