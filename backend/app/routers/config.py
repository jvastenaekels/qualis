"""Public, unauthenticated bootstrap config endpoint."""

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.config import PublicConfig

router = APIRouter()


@router.get("/config", response_model=PublicConfig)
async def get_public_config() -> PublicConfig:
    """Return client bootstrap config. Unauthenticated by design — it
    exposes only the email-delivery mode, no secrets."""
    return PublicConfig(
        email_delivery="smtp" if settings.is_smtp_configured else "manual"
    )
