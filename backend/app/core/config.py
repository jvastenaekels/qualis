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
    # Clock-skew tolerance for JWT validation (F-03-012). Applied to all
    # `jwt.decode` paths (access JWT, email-link JWTs, invitation JWT). 30s
    # is tight enough to bound the post-`exp` replay window and absorb
    # normal NTP drift between issuer/verifier; raise only if you observe
    # legitimate validation failures attributable to clock skew.
    JWT_LEEWAY_SECONDS: int = 30

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
    # Browser-reachable object-storage host used *only* to mint presigned
    # URLs, when it differs from the internal upload endpoint. The classic
    # case is MinIO in docker-compose: the backend uploads via the internal
    # service hostname (http://minio:9000) but the participant's browser
    # must fetch playback URLs from a host-published address
    # (http://localhost:9000). Presigning is an offline SigV4 operation, so
    # a client pointed at this endpoint mints valid URLs without connecting.
    # Leave unset for normal deployments where one endpoint serves both.
    S3_PUBLIC_ENDPOINT_URL: str | None = None
    S3_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str | None = None
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None

    # 2FA — Email OTP channel
    TWOFA_EMAIL_OTP_EXPIRE_MINUTES: int = 5
    TWOFA_EMAIL_OTP_RESEND_COOLDOWN_SECONDS: int = 30
    # Per-account brute-force ceiling: total wrong OTP attempts allowed
    # in a rolling 24h window before verification is locked out for the
    # account. 30 wrong / day caps the daily brute-force success
    # probability at 30 / 10^6 = 0.003 %. The window is rolling — once
    # the oldest contributing rows pass 24h the user can verify again,
    # no admin intervention required.
    TWOFA_OTP_WRONG_ATTEMPT_CAP_24H: int = Field(default=30, ge=1)

    # Email verification & password-reset token lifetimes
    EMAIL_VERIFICATION_REQUIRED: bool = True
    EMAIL_VERIFY_TOKEN_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_TOKEN_EXPIRE_HOURS: int = 1
    TWOFA_DISABLE_TOKEN_EXPIRE_MINUTES: int = 15
    # Email-change dual-confirmation flow (F-03-011). The confirmation
    # link goes to the new address and must be short-lived (an attacker
    # who briefly accesses the new mailbox should not get a multi-day
    # window). The cancellation link goes to the old address and is
    # given a longer window so a legitimate owner who is travelling
    # still has time to react.
    EMAIL_CHANGE_CONFIRM_TOKEN_EXPIRE_HOURS: int = 1
    EMAIL_CHANGE_CANCEL_TOKEN_EXPIRE_HOURS: int = 24

    # Audio Recording Limits
    AUDIO_MAX_FILE_SIZE_MB: int = 10
    AUDIO_MAX_DURATION_SECONDS: int = 300  # 5 minutes
    AUDIO_ALLOWED_MIME_TYPES: list[str] = Field(
        default=["audio/webm", "video/webm", "audio/mp4", "audio/mpeg"]
    )

    # Project quotas — see docs/superpowers/specs/2026-05-02-project-roles-refactor-design.md §5.
    # 0 means "unlimited"; opt in by setting a positive integer.
    MAX_MEMBERS_PER_PROJECT: int = Field(default=0, ge=0)
    MAX_PROJECTS_AS_OWNER: int = Field(default=0, ge=0)

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
    def is_s3_configured(self) -> bool:
        """True iff all four S3/object-storage credentials are populated.

        When False, Qualis runs in STORAGE-OPTIONAL mode: the audio
        subsystem is unavailable. Studies with audio enabled silently
        degrade to text-only responses (no audio captured, no error
        shown to participants); see docs/guides/running-without-s3.md.
        The audio router uses this to return a clean 503 instead of an
        AttributeError if it is ever reached.
        """
        return bool(
            self.S3_ENDPOINT_URL
            and self.S3_BUCKET_NAME
            and self.S3_ACCESS_KEY_ID
            and self.S3_SECRET_ACCESS_KEY
        )

    @property
    def email_verification_active(self) -> bool:
        """The verification gate only fires when both:
        - the operator opted in (EMAIL_VERIFICATION_REQUIRED=True), and
        - SMTP is configured (otherwise users could never receive the link).
        """
        return self.EMAIL_VERIFICATION_REQUIRED and self.is_smtp_configured


settings = Settings()
