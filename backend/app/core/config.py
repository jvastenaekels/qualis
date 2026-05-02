"""Application configuration."""

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


class Settings(BaseSettings):
    """Application configuration."""

    API_PREFIX: str = "/api"
    PROJECT_NAME: str = "Qualis API"
    ENVIRONMENT: str = "production"

    # Security
    SECRET_KEY: str = "CHANGEME-insecure-dev-only"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours
    IP_HASH_SALT: str = "CHANGEME-insecure-dev-only"

    # Database
    DATABASE_URL: str | None = None

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"

    # Error reporting (optional). Leave SENTRY_DSN empty to disable.
    # When set, errors are reported to Sentry tagged with ENVIRONMENT.
    SENTRY_DSN: str | None = None
    # 0 = no perf traces; raise to ~0.1 in prod once Sentry is wired.
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0

    # Rate-limiter trust model for X-Forwarded-For (audit F-01-004).
    # The header is honoured only when the immediate TCP peer matches one
    # of these values. Empty (default) = use the direct client IP, ignore
    # the header entirely (safe for direct-exposed deployments). Set to
    # "*" when behind a trusted reverse proxy / load balancer that you
    # control (e.g. Scalingo). Comma-separated; supports literal IPs.
    TRUSTED_PROXIES: str = ""

    @property
    def trusted_proxies_list(self) -> list[str]:
        return [p.strip() for p in self.TRUSTED_PROXIES.split(",") if p.strip()]

    # CORS — comma-separated origin list. Defaults cover local dev (Vite + preview).
    # In production set explicit origins via env, e.g.
    #   ALLOWED_ORIGINS=https://qualis.example.org,https://staging.qualis.example.org
    ALLOWED_ORIGINS: str = (
        "http://localhost:5173,http://localhost:4173,"
        "http://127.0.0.1:5173,http://127.0.0.1:4173"
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        """Parsed CORS origin list — used by CORSMiddleware."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    # Mail
    SMTP_TLS: bool = True
    SMTP_PORT: int | None = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: str | None = None
    EMAILS_FROM_NAME: str | None = None

    # S3/Cellar Storage
    S3_ENDPOINT_URL: str | None = (
        None  # e.g., https://cellar-c2.services.clever-cloud.com
    )
    S3_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str | None = None
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None

    # 2FA — Email OTP channel
    TWOFA_EMAIL_OTP_EXPIRE_MINUTES: int = 5
    TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS: int = 30

    # Email verification & password-reset token lifetimes
    EMAIL_VERIFICATION_REQUIRED: bool = True
    EMAIL_VERIFY_TOKEN_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_TOKEN_EXPIRE_HOURS: int = 1
    TWOFA_DISABLE_TOKEN_EXPIRE_MINUTES: int = 15

    # Audio Recording Limits
    AUDIO_MAX_FILE_SIZE_MB: int = 10
    AUDIO_MAX_DURATION_SECONDS: int = 300  # 5 minutes
    AUDIO_ALLOWED_MIME_TYPES: list[str] = Field(
        default=["audio/webm", "video/webm", "audio/mp4", "audio/mpeg"]
    )

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_url(cls, v: str | None) -> str:
        """Assembles and validates the database URL."""
        if not v:
            # For static analysis, OpenAPI generation, and CI checks that don't need a real DB,
            # we provide a dummy PostgreSQL URL. Connection will fail later if actually needed.
            return "postgresql+asyncpg://localhost/qualis_dummy"

        # 1. Handle postgres/postgresql prefix for asyncpg
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgresql://") and "+asyncpg" not in v:
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)

        # 2. Strip sslmode if present (asyncpg doesn't support it as query param)
        if "sslmode=" in v:
            u = urlparse(v)
            q = parse_qs(u.query)
            q.pop("sslmode", None)
            v = urlunparse(u._replace(query=urlencode(q, doseq=True)))

        return v

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def effective_emails_from_name(self) -> str:
        """Helper to get the email from name, falling back to project name."""
        return self.EMAILS_FROM_NAME or self.PROJECT_NAME

    @property
    def is_smtp_configured(self) -> bool:
        """True iff all three SMTP credentials are populated.

        When False, the email subsystem falls back to logging the email
        body to stdout (see app.utils.email._send_or_log). The auth-email
        verification gate uses this to avoid locking users out of an
        unconfigured deployment.
        """
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)

    @property
    def email_verification_active(self) -> bool:
        """The verification gate only fires when both:
        - the operator opted in (EMAIL_VERIFICATION_REQUIRED=True), and
        - SMTP is configured (otherwise users could never receive the link).
        """
        return self.EMAIL_VERIFICATION_REQUIRED and self.is_smtp_configured


settings = Settings()
