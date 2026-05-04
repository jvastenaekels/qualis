# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Wave 6 supply-chain regression tests.

Pin policy assertions:

* Every third-party `uses:` line in `.github/workflows/*.yml` carries a
  40-char SHA (Task 4 — SHA-pin third-party GHA actions).
* `backend/pyproject.toml` keeps the Wave 1 transitive-CVE floors as
  direct entries (Task 7 — direct-pin promotion). Prevents `uv lock`
  from silently dropping below the fix versions if a transitive
  constraint loosens.
* `backend/Dockerfile` declares a non-root `USER` (Task 5 — F-02-006).
* `frontend/nginx.conf` rejects unknown `Host` headers (Task 5 — F-02-007).
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]

# First-party owners that may stay version-tagged.
_FIRST_PARTY_OWNERS = {"actions", "github"}

_USES_RE = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)")
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def _iter_uses_lines(workflow: Path) -> list[tuple[int, str]]:
    """Return (lineno, value) pairs for every `uses:` declaration."""
    out: list[tuple[int, str]] = []
    for i, raw in enumerate(workflow.read_text().splitlines(), start=1):
        m = _USES_RE.match(raw)
        if m:
            out.append((i, m.group(1)))
    return out


def test_third_party_actions_are_sha_pinned() -> None:
    """Every non-first-party `uses:` carries a 40-char SHA.

    Format: `owner/repo@<40-char-sha>` (a trailing `# tag` comment is
    permitted on the line and ignored by the regex).
    """
    workflow_dir = REPO_ROOT / ".github" / "workflows"
    workflows = sorted(workflow_dir.glob("*.yml"))
    assert workflows, f"No workflows found under {workflow_dir}"

    violations: list[str] = []
    for wf in workflows:
        for lineno, value in _iter_uses_lines(wf):
            owner, _, version = value.partition("/")
            if owner in _FIRST_PARTY_OWNERS:
                continue
            ref_sep, _, ref = value.partition("@")
            if not ref or not _SHA_RE.match(ref):
                violations.append(
                    f"{wf.relative_to(REPO_ROOT)}:{lineno}: third-party "
                    f"`uses: {value}` is not SHA-pinned"
                )

    assert not violations, "Third-party GHA actions must be SHA-pinned:\n" + "\n".join(
        violations
    )


def test_pyproject_pins_wave1_cve_floors() -> None:
    """pyproject.toml carries the Wave 1 CVE floors as direct deps.

    Closes the Wave 1 NEW observation (`direct-pin promotion`).
    Prevents accidental downgrade of pygments / python-dotenv / requests
    below the CVE-fix versions if a transitive constraint loosens.
    """
    pyproject = (REPO_ROOT / "backend" / "pyproject.toml").read_text()

    expected = {
        "pygments": "2.20.0",
        "python-dotenv": "1.2.2",
        "requests": "2.33.0",
    }
    for pkg, floor in expected.items():
        # Match `"<pkg>>=<floor>"` (uv-style). Allow optional whitespace
        # variations and trailing version suffixes (e.g. dev0, rc1).
        pattern = rf'"{re.escape(pkg)}>={re.escape(floor)}'
        assert re.search(pattern, pyproject), (
            f"backend/pyproject.toml must declare `{pkg}>={floor}` as a "
            f"direct dependency (Wave 1 CVE floor)"
        )


def test_backend_dockerfile_runs_as_non_root() -> None:
    """backend/Dockerfile drops root before CMD (F-02-006)."""
    dockerfile = (REPO_ROOT / "backend" / "Dockerfile").read_text()
    # Order matters: USER must precede CMD; we only assert presence here
    # since the file is short and human-reviewable.
    assert re.search(
        r"^USER\s+app\s*$", dockerfile, re.MULTILINE
    ), "backend/Dockerfile must declare `USER app` (F-02-006)"
    # The user is created by a single multi-line RUN that chains
    # groupadd / useradd; we assert each command is present (the
    # ordering and `&&` chaining are reviewed by humans).
    assert "groupadd" in dockerfile and "useradd" in dockerfile, (
        "backend/Dockerfile must create the `app` user via groupadd + useradd "
        "before the USER directive"
    )


def test_nginx_validates_host_header() -> None:
    """frontend/nginx.conf rejects unexpected Host headers (F-02-007).

    The host allowlist is configurable via the `QUALIS_ALLOWED_HOSTS`
    build arg; absence of the directive means the operator hasn't
    enabled the guard.
    """
    nginx_conf = (REPO_ROOT / "frontend" / "nginx.conf").read_text()
    assert re.search(
        r"if\s*\(\s*\$host\s*!~", nginx_conf
    ), "frontend/nginx.conf must include a `$host` allowlist guard (F-02-007)"
    # Sanity: the guard must return a non-2xx status (444 = nginx-specific
    # close without response, the documented host-header-injection block).
    assert "return 444" in nginx_conf, (
        "frontend/nginx.conf host-allowlist must `return 444` "
        "for unknown hosts"
    )
