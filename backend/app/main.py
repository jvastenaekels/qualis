"""Main FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.exceptions import ServiceError
from app.limiter import limiter
from app.middleware.errors import (
    global_exception_handler,
    http_exception_handler,
    service_exception_handler,
    sqlalchemy_exception_handler,
    validation_exception_handler,
)
from app.middleware.security import SecurityHeadersMiddleware
from app.routers import audio, auth, logs, participants, submissions
from app.routers.admin import concourses as admin_concourses
from app.routers.admin import analysis as admin_analysis
from app.routers.admin import exports as admin_exports
from app.routers.admin import invitations as admin_invitations
from app.routers.admin import lifecycle as admin_lifecycle
from app.routers.admin import recruitment as admin_recruitment
from app.routers.admin import studies as admin_studies
from app.routers.admin import users as admin_users
from app.routers.admin import projects as admin_projects
from app.routers.admin import memos as admin_memos
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

# Sentinel value for unset secrets in dev — production startup checks compare
# against this constant to detect missing env vars. Not a credential.
_INSECURE_DEFAULT_SENTINEL = "CHANGEME-insecure-dev-only"

# Sentry — initialised here (before app construction) so the SDK captures
# import-time and startup errors. No-op when SENTRY_DSN is not configured.
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        # GDPR: do not send participant emails / IPs to Sentry by default.
        # Operators can opt in per Sentry project if their privacy policy allows.
        send_default_pii=False,
    )
    logger.info(
        "Sentry initialised (environment=%s, traces_sample_rate=%s)",
        settings.ENVIRONMENT,
        settings.SENTRY_TRACES_SAMPLE_RATE,
    )
else:
    logger.info("Sentry DSN not configured — error reporting disabled")


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
        if settings.SECRET_KEY == _INSECURE_DEFAULT_SENTINEL:
            logger.critical(
                "SECRET_KEY is using the insecure default! Set a strong random SECRET_KEY in environment variables."
            )

        if settings.IP_HASH_SALT == _INSECURE_DEFAULT_SENTINEL:
            logger.critical(
                "IP_HASH_SALT is using the insecure default! Set a unique IP_HASH_SALT in environment variables."
            )

        logger.info("Production environment detected. Security checks completed.")
    else:
        logger.info("Development environment detected.")

    yield


app = FastAPI(title="Qualis API", lifespan=lifespan)

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
app.add_exception_handler(ServiceError, service_exception_handler)
app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

# Security Headers (Pure ASGI)
app.add_middleware(SecurityHeadersMiddleware)

# Rate Limiter Middleware
app.add_middleware(SlowAPIMiddleware)

# CORS configuration — origin list is sourced from Settings.ALLOWED_ORIGINS
# (see backend/app/core/config.py and .env.example).
# Allow-list of headers replaces the wildcard (audit F-01-007). Cookies/origin
# are still supported via allow_credentials=True.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",  # JWT bearer
        "Content-Type",  # JSON / multipart bodies
        "Accept",  # content negotiation
        "Accept-Language",  # i18n preference
        "X-Project-ID",  # current project context for admin requests
        "X-Requested-With",  # XHR sentinel some clients still send
    ],
)

app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(
    admin_studies.router, prefix="/api/admin/studies", tags=["admin-studies"]
)
app.include_router(
    admin_analysis.router, prefix="/api/admin/studies", tags=["admin-analysis"]
)
app.include_router(
    admin_lifecycle.router, prefix="/api/admin/studies", tags=["admin-lifecycle"]
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
    admin_projects.router, prefix="/api/admin/projects", tags=["admin-projects"]
)
app.include_router(
    admin_concourses.router,
    prefix="/api/admin/concourses",
    tags=["admin-concourses"],
)
app.include_router(admin_memos.router, prefix="/api", tags=["admin-memos"])
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
from app.middleware.spa import mount_spa  # noqa: E402

mount_spa(app)
