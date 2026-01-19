"""Application configuration."""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


class Settings(BaseSettings):
    """Application configuration."""

    API_V1_STR: str = "/api"
    PROJECT_NAME: str = "Open-Q API"
    ENVIRONMENT: str = "development"

    # Security
    SECRET_KEY: str = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours
    IP_HASH_SALT: str = "default-salt-allow-override-in-prod"

    # Database
    DATABASE_URL: str | None = None

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"

    # Mail
    SMTP_TLS: bool = True
    SMTP_PORT: int | None = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: str | None = None
    EMAILS_FROM_NAME: str | None = None

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_url(cls, v: str | None) -> str:
        """Assembles and validates the database URL."""
        if not v:
            # For static analysis, OpenAPI generation, and CI checks that don't need a real DB,
            # we provide a dummy PostgreSQL URL. Connection will fail later if actually needed.
            return "postgresql+asyncpg://localhost/open_q_dummy"

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
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def effective_emails_from_name(self) -> str:
        """Helper to get the email from name, falling back to project name."""
        return self.EMAILS_FROM_NAME or self.PROJECT_NAME


settings = Settings()
