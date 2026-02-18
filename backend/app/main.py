"""Main FastAPI application entry point."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.limiter import limiter
from app.middleware.errors import (
    global_exception_handler,
    http_exception_handler,
    sqlalchemy_exception_handler,
    validation_exception_handler,
)
from app.middleware.security import SecurityHeadersMiddleware
from app.routers import audio, auth, logs, participants, submissions
from app.routers.admin import analysis as admin_analysis
from app.routers.admin import exports as admin_exports
from app.routers.admin import invitations as admin_invitations
from app.routers.admin import recruitment as admin_recruitment
from app.routers.admin import studies as admin_studies
from app.routers.admin import users as admin_users
from app.routers.admin import workspaces as admin_workspaces
from app.core.config import settings

# Import test router (only active in test/dev environments)
from app.routers import test as test_router

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage the application lifespan (startup/shutdown)."""
    # Schema Validation
    logger.info(f"lifespan: DATABASE_URL is {settings.DATABASE_URL}")
    try:
        from app.schema_validation import validate_schema

        await validate_schema()
    except Exception as e:
        logger.error(f"Schema validation failed: {e}")
        logger.error("Database schema is out of sync with application models.")
        logger.warning(
            "Continuing startup despite schema validation failure (non-fatal)."
        )
        # Do not raise - prevents boot loop on some platforms (e.g. Scalingo + Py3.13)
        # raise

    # Production Readiness Checks
    if settings.ENVIRONMENT != "development":
        if settings.SECRET_KEY == "CHANGEME-insecure-dev-only":
            logger.critical(
                "SECRET_KEY is using the insecure default! Set a strong random SECRET_KEY in environment variables."
            )

        if settings.IP_HASH_SALT == "CHANGEME-insecure-dev-only":
            logger.critical(
                "IP_HASH_SALT is using the insecure default! Set a unique IP_HASH_SALT in environment variables."
            )

        logger.info("Production environment detected. Security checks completed.")
    else:
        logger.info("Development environment detected.")

    yield


app = FastAPI(title="Libre-Q API", lifespan=lifespan)

# Rate Limiter
app.state.limiter = limiter


# Fix MyPy: Handler for RateLimitExceeded needs to match expected signature
async def _rate_limit_exceeded_handler_wrapper(
    request: Request, exc: Exception
) -> Response:
    if isinstance(exc, RateLimitExceeded):
        return _rate_limit_exceeded_handler(request, exc)
    return Response("Internal Server Error", status_code=500)


app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler_wrapper)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

# Security Headers (Pure ASGI)
app.add_middleware(SecurityHeadersMiddleware)

# Rate Limiter Middleware
app.add_middleware(SlowAPIMiddleware)

# CORS configuration
origins_raw = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173,http://0.0.0.0:5173",
)
origins = [o.strip() for o in origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(
    admin_studies.router, prefix="/api/admin/studies", tags=["admin-studies"]
)
app.include_router(
    admin_analysis.router, prefix="/api/admin/studies", tags=["admin-analysis"]
)
app.include_router(
    admin_exports.router, prefix="/api/admin/studies", tags=["admin-exports"]
)
app.include_router(
    admin_invitations.router, prefix="/api/admin/invitations", tags=["admin-invites"]
)
app.include_router(admin_users.router, prefix="/api/admin/users", tags=["admin-users"])
app.include_router(
    admin_recruitment.router,
    prefix="/api/admin/recruitment",
    tags=["admin-recruitment"],
)
app.include_router(
    admin_workspaces.router, prefix="/api/admin/workspaces", tags=["admin-workspaces"]
)
app.include_router(submissions.router, prefix="/api", tags=["submissions"])
app.include_router(
    participants.router, prefix="/api/study/{slug}", tags=["participants"]
)
app.include_router(logs.router, prefix="/api", tags=["logs"])
app.include_router(audio.router)

# Include test router (only active in test/dev environments)
if settings.ENVIRONMENT in ["test", "development"]:
    app.include_router(test_router.router)


@app.get("/health")
def health_check():
    """Health check endpoint to verify API availability."""
    return {"status": "ok"}


# Serve Frontend in Production
import os  # noqa: E402

from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

# Correct path relative to where uvicorn is run (backend dir)
# We assume uvicorn is run from 'backend/' so we go up one level to 'frontend/dist'
# OR if we use absolute paths based on __file__
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
ROOT_DIR = os.path.dirname(BASE_DIR)  # root/
FRONTEND_DIST = os.path.join(ROOT_DIR, "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    # Mount assets (JS/CSS) - These are immutable and can be served efficiently
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")),
        name="assets",
    )

    # Catch-all for SPA: Try static files first, then fallback to index.html
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the Single Page Application (SPA) static files and handle client-side routing."""
        # 1. API 404 Fallback: Do not serve SPA for missing API routes
        if full_path.startswith("api"):
            raise StarletteHTTPException(
                status_code=404, detail="API endpoint not found"
            )

        # 2. Check if it's a specific static file (e.g. favicon.ico, manifest.json) in the root
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            # Cache assets (js, css, images) for 1 year, but not HTML
            if full_path.endswith(
                (
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
            ):
                return FileResponse(
                    file_path,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"},
                )
            else:
                return FileResponse(
                    file_path, headers={"Cache-Control": "no-cache, must-revalidate"}
                )

        # 2b. Static 404 Fallback: Do not serve SPA for missing assets
        if full_path.startswith("assets") or full_path.endswith(
            (".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".woff", ".woff2")
        ):
            raise StarletteHTTPException(
                status_code=404, detail="Static file not found"
            )

        # 3. Otherwise serve index.html for CSR navigation (never cache HTML)
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
else:

    @app.get("/")
    def read_root():
        """Root endpoint when frontend is not mounted."""
        return {"Hello": "Frontend build not found. API is running."}
