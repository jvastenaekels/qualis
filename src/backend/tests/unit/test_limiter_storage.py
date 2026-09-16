"""Rate-limiter storage selection.

The limiter has exactly two modes: disabled under the test suite, and
per-process in-memory counters everywhere else. A third `REDIS_URL` mode
was advertised in the docs until wave 7 but could never boot: the `redis`
package was not a dependency, so `limits` raised ``ConfigurationError`` at
import. Rather than add a service, the mode was removed and the docs now
state the per-process behaviour honestly.
"""

from __future__ import annotations

from pathlib import Path

from limits.storage import MemoryStorage

from app.limiter import build_limiter

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_default_limiter_uses_per_process_memory() -> None:
    limiter = build_limiter(testing=False)
    assert isinstance(limiter._storage, MemoryStorage)
    assert limiter.enabled is True


def test_testing_disables_limiting() -> None:
    limiter = build_limiter(testing=True)
    assert limiter.enabled is False


def test_no_redis_mode_is_advertised_anywhere() -> None:
    """The removed mode must not survive in code or in the docs that
    operators read; a stale promise here sends them provisioning a
    service the app cannot use."""
    offenders = []
    for rel in (
        "src/backend/app/limiter.py",
        "docs/reference/operations.md",
        "docs/reference/api.md",
        ".env.example",
    ):
        text = (REPO_ROOT / rel).read_text(encoding="utf-8")
        if "REDIS_URL" in text:
            offenders.append(rel)
    assert offenders == []
