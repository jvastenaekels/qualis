"""Error reporting stays in the operator's own logs.

Qualis ships no third-party telemetry SDK. Unhandled exceptions are logged
by the backend and, for browser errors, forwarded to the backend's own
`/api/logs` endpoint. The optional Sentry integration was removed in
wave 7: a research tool that handles participant data should not carry a
dependency whose default job is to ship stack traces, request context and
device metadata to an external SaaS, even behind an unset DSN.

This test keeps the removal from being undone by a well-meaning
dependency bump or a copied-in error boundary.
"""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

from app.core.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[5]
TELEMETRY_MARKERS = ("sentry", "bugsnag", "rollbar", "datadog")


def _direct_backend_dependencies() -> list[str]:
    data = tomllib.loads((REPO_ROOT / "src/backend/pyproject.toml").read_text())
    return [dep.lower() for dep in data["project"]["dependencies"]]


def _direct_frontend_dependencies() -> list[str]:
    data = json.loads((REPO_ROOT / "src/frontend/package.json").read_text())
    return [name.lower() for name in data.get("dependencies", {})]


def test_backend_declares_no_telemetry_sdk() -> None:
    offenders = [
        dep
        for dep in _direct_backend_dependencies()
        if any(marker in dep for marker in TELEMETRY_MARKERS)
    ]
    assert offenders == []


def test_frontend_declares_no_telemetry_sdk() -> None:
    offenders = [
        dep
        for dep in _direct_frontend_dependencies()
        if any(marker in dep for marker in TELEMETRY_MARKERS)
    ]
    assert offenders == []


def test_settings_has_no_telemetry_fields() -> None:
    offenders = [
        name
        for name in Settings.model_fields
        if any(marker in name.lower() for marker in TELEMETRY_MARKERS)
    ]
    assert offenders == []
