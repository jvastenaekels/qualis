"""Regression tests pinned to CVEs fixed in Wave 1 of the 2026-05-03 audit.

For each fixed CVE, either:
  (a) write a test that exercises the formerly-vulnerable code path through
      Qualis's actual API, asserting safe behaviour, OR
  (b) skip with a docstring explaining why the CVE is not reachable from
      Qualis's call sites (so the test file documents the assessment).
"""
from __future__ import annotations

import pytest


def test_pyjwt_rejects_unknown_crit_header() -> None:
    """F-01-001 (CVE-2026-32597, pyjwt 2.12.0): unknown 'crit' extension must
    be rejected. Already pinned in pyproject.toml; this test guards against
    a future downgrade.
    """
    import base64
    import hmac
    import hashlib
    import json
    import jwt

    installed = tuple(int(x) for x in jwt.__version__.split(".")[:2])
    assert installed >= (2, 12), (
        f"pyjwt {jwt.__version__} predates the CVE-2026-32597 fix (≥2.12.0). "
        "Run `uv sync` to pull the locked version."
    )

    secret = "test-secret"
    header = {"alg": "HS256", "crit": ["x-custom-policy"], "x-custom-policy": "x"}
    payload = {"sub": "attacker"}

    def b64url(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

    h = b64url(json.dumps(header, separators=(",", ":")).encode())
    p = b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = b64url(
        hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    )
    token = f"{h}.{p}.{sig}"

    with pytest.raises(jwt.InvalidTokenError):
        jwt.decode(token, secret, algorithms=["HS256"])


@pytest.mark.skip(
    reason="F-02-001 / CVE-2026-4539 (pygments AdlLexer ReDoS): Qualis does not "
    "parse Adl input. Verified 2026-05-03 by `grep -rn 'AdlLexer\\|pygments.*adl' "
    "backend/` — no matches. Pygments is used only via dev tooling (bandit, "
    "pip-audit reports). Bumping pyproject.toml floor would prevent regression; "
    "tracked in 99-action-backlog.md."
)
def test_pygments_adl_redos_not_reachable() -> None:
    pass


@pytest.mark.skip(
    reason="F-02-002 / CVE-2026-28684 (python-dotenv set_key symlink overwrite): "
    "Qualis only calls `load_dotenv()` (in tests/conftest.py, scripts/create_bucket.py). "
    "Verified 2026-05-03 by `grep -rn 'set_key\\|unset_key' backend/` — no matches."
)
def test_python_dotenv_set_key_symlink_not_reachable() -> None:
    pass


@pytest.mark.skip(
    reason="F-02-003 / CVE-2026-25645 (requests extract_zipped_paths predictable "
    "temp file): Qualis does not call extract_zipped_paths. Verified 2026-05-03 "
    "by `grep -rn 'extract_zipped_paths' backend/` — no matches. The function is "
    "an obscure utility unused by typical requests consumers."
)
def test_requests_extract_zipped_paths_not_reachable() -> None:
    pass
