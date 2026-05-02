"""Business exceptions for the service layer.

These exceptions decouple services from HTTP concerns. They are
converted to HTTP responses by the exception handlers registered
in main.py via middleware/errors.py.
"""


class ServiceError(Exception):
    """Base exception for all service-layer errors."""

    def __init__(self, message: str = "An error occurred"):
        self.message = message
        super().__init__(self.message)


class NotFoundError(ServiceError):
    """Raised when a requested resource does not exist."""

    def __init__(self, resource: str = "Resource", detail: str | None = None):
        self.resource = resource
        msg = detail or f"{resource} not found"
        super().__init__(msg)


class ValidationError(ServiceError):
    """Raised when business-rule validation fails (HTTP 400)."""


class ConflictError(ServiceError):
    """Raised when an operation conflicts with current state (HTTP 409)."""


class ForbiddenError(ServiceError):
    """Raised when an operation is not permitted (HTTP 403)."""


class ConcurrencyError(ServiceError):
    """Raised on race conditions or concurrency failures (HTTP 500)."""


class QuotaExceeded(Exception):
    """Raised when a deployment-level quota would be exceeded.

    `code` is a stable string used as the FastAPI `detail` field so the
    frontend can map it to a translation key.
    """

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)
