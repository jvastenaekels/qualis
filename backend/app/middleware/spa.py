"""Single Page Application (SPA) serving for production deployments.

Mounts the frontend build directory and handles client-side routing
by falling back to index.html for non-API, non-asset paths.
"""

import os

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

# Resolve paths relative to the backend/ directory
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
_ROOT_DIR = os.path.dirname(_BASE_DIR)  # project root
FRONTEND_DIST = os.path.join(_ROOT_DIR, "frontend", "dist")

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
    import logging

    logger = logging.getLogger(__name__)
    logger.info("SPA mount: FRONTEND_DIST=%s exists=%s", FRONTEND_DIST, os.path.exists(FRONTEND_DIST))
    logger.info("SPA mount: _ROOT_DIR=%s contents=%s", _ROOT_DIR, os.listdir(_ROOT_DIR) if os.path.exists(_ROOT_DIR) else "N/A")
    if os.path.exists(os.path.join(_ROOT_DIR, "frontend")):
        logger.info("SPA mount: frontend/ contents=%s", os.listdir(os.path.join(_ROOT_DIR, "frontend")))

    if not os.path.exists(FRONTEND_DIST):

        @app.get("/")
        def read_root():
            """Root endpoint when frontend is not mounted."""
            return {"Hello": "Frontend build not found. API is running."}

        return

    # Mount hashed assets with long-lived cache
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
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
