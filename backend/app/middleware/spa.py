"""Single Page Application (SPA) serving for production deployments.

Mounts the frontend build directory and handles client-side routing
by falling back to index.html for non-API, non-asset paths.
"""

import os
from typing import Any

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

# Resolve paths relative to the backend/ directory
# spa.py is at backend/app/middleware/spa.py → 3 dirname calls to reach backend/
_BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)  # backend/
_ROOT_DIR = os.path.dirname(_BASE_DIR)  # project root
FRONTEND_DIST = os.path.join(_ROOT_DIR, "frontend", "dist")
DOCS_DIR = os.path.join(_ROOT_DIR, "docs")

_CACHEABLE_EXTENSIONS = (
    ".js",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
)


def mount_spa(app: FastAPI) -> None:
    """Mount frontend static files and SPA catch-all route.

    If the frontend build directory doesn't exist (e.g. in development),
    registers a simple root endpoint instead.
    """
    # Serve the repo docs/ as static files so in-app guide links resolve
    # (e.g. the capability banners' "View guide"). Independent of the
    # frontend build; guarded so a packaging without docs/ degrades to a
    # 404 link rather than a crash. Registered before the SPA catch-all so
    # /docs/* is never swallowed by the client-side-routing fallback.
    if os.path.isdir(DOCS_DIR):
        app.mount("/docs", StaticFiles(directory=DOCS_DIR), name="docs")

    if not os.path.exists(FRONTEND_DIST):

        @app.get("/", include_in_schema=False)
        def read_root() -> dict[str, str]:
            """Root endpoint when frontend is not mounted."""
            return {"Hello": "Frontend build not found. API is running."}

        return

    # Mount hashed assets with long-lived cache
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> Any:  # type: ignore[explicit-any]  # FastAPI route returns FileResponse or raises
        """Serve SPA static files and handle client-side routing."""
        # 1. Never serve SPA for missing API routes
        if full_path.startswith("api"):
            raise StarletteHTTPException(
                status_code=404, detail="API endpoint not found"
            )

        # 2. Serve known static files from the dist root
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            if full_path.endswith(_CACHEABLE_EXTENSIONS):
                return FileResponse(
                    file_path,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"},
                )
            return FileResponse(
                file_path, headers={"Cache-Control": "no-cache, must-revalidate"}
            )

        # 3. Return 404 for missing assets rather than falling through to index.html
        if full_path.startswith("assets") or full_path.endswith(_CACHEABLE_EXTENSIONS):
            raise StarletteHTTPException(
                status_code=404, detail="Static file not found"
            )

        # 4. Fallback: serve index.html for client-side routing
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
