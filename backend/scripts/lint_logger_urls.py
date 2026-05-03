# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Lint guard against bypass of `app.middleware.log_scrub`.

The token scrubber (`TokenLogScrubFilter`) attaches to a fixed list of
loggers (`_TARGET_LOGGER_NAMES`). Any `logger.<level>(... request.url ...)`
call from a file whose module-level logger is *not* in that list would
emit unscrubbed URLs to the access pipeline, defeating the F-03-013 fix.

This script AST-walks every `backend/app/**/*.py` file and fails on the
first such call site. New URL-emitting loggers must either:

* Be added to `_TARGET_LOGGER_NAMES` in `app/middleware/log_scrub.py`
  (with a documented rationale), or
* Stop logging `request.url` / `request.query_string`.

Wired into `.github/workflows/security-scans.yml`. Closes the Wave 2
NEW observation `request.url-in-loggers lint`.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

# Files in the codebase whose module-level logger is in `_TARGET_LOGGER_NAMES`.
# Kept as relative paths under `backend/app/`.
_ALLOWED_FILES = frozenset(
    {
        # `uvicorn.access` is configured by uvicorn itself; no app-side file
        # owns the logger but pre-existing call sites in `app.middleware.errors`
        # and `app.routers.logs` are explicitly covered below.
        "middleware/errors.py",
        "routers/logs.py",
    }
)

# Logger method names we audit.
_LOGGER_LEVELS = frozenset({"info", "warning", "error", "exception", "debug", "critical"})

# Sensitive expressions we forbid as positional / kwargs args to logger calls
# from non-allowlisted files. (We match the dotted form, not the bare name —
# `url` alone is too noisy.)
_SENSITIVE_ATTRS = frozenset({"url", "query_string"})


def _is_logger_call(node: ast.Call) -> bool:
    """Return True if the call is `<something>.<level>(…)` with a
    likely-logger receiver.

    We accept any `<expr>.<level>(…)` to be conservative — the real
    filter is the sensitive-arg check below. False positives are
    cheap (rename the variable away from `logger`) and false
    negatives are expensive (silent token leak).
    """
    if not isinstance(node.func, ast.Attribute):
        return False
    if node.func.attr not in _LOGGER_LEVELS:
        return False
    # Receiver must be a Name (e.g. `logger`, `log`) or another Attribute
    # (e.g. `self.logger`). Anything else is unlikely to be a logger.
    receiver = node.func.value
    return isinstance(receiver, (ast.Name, ast.Attribute))


def _refers_to_sensitive_attr(node: ast.AST) -> bool:
    """Walk an arg subtree looking for `.url` or `.query_string` access.

    Catches:
      logger.error("path %s", request.url)             # positional
      logger.error(f"... {request.url} ...")           # f-string
      logger.error("path " + str(request.url))         # concat
      logger.error("path %s" % request.url)            # %-format
      logger.error("path", url=request.url)            # kwarg (caller side)

    We don't try to verify the receiver is `request` — `.url` on any
    object in a logger call is suspicious enough to flag.
    """
    for child in ast.walk(node):
        if isinstance(child, ast.Attribute) and child.attr in _SENSITIVE_ATTRS:
            return True
    return False


def _check_file(path: Path, repo_root: Path) -> list[str]:
    """Return a list of human-readable violations found in `path`."""
    rel = path.relative_to(repo_root / "backend" / "app").as_posix()
    if rel in _ALLOWED_FILES:
        return []

    try:
        tree = ast.parse(path.read_text(), filename=str(path))
    except SyntaxError as exc:
        return [f"{path}: failed to parse ({exc})"]

    violations: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not _is_logger_call(node):
            continue
        # Inspect every positional and every keyword value.
        suspect_args = [a for a in node.args if _refers_to_sensitive_attr(a)]
        suspect_kwargs = [
            k for k in node.keywords if k.value and _refers_to_sensitive_attr(k.value)
        ]
        if suspect_args or suspect_kwargs:
            violations.append(
                f"{path.relative_to(repo_root)}:{node.lineno}: "
                f"logger.{node.func.attr}() called with `.url` / "
                f"`.query_string` from a file not in "
                f"`app.middleware.log_scrub._TARGET_LOGGER_NAMES`. "
                f"Add the file's logger to the target list (with a "
                f"documented rationale) or stop emitting the URL."
            )
    return violations


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    app_dir = repo_root / "backend" / "app"
    if not app_dir.is_dir():
        print(f"error: {app_dir} not found", file=sys.stderr)
        return 2

    violations: list[str] = []
    for py in sorted(app_dir.rglob("*.py")):
        violations.extend(_check_file(py, repo_root))

    if violations:
        print("Logger-URL lint failed:", file=sys.stderr)
        for v in violations:
            print(f"  {v}", file=sys.stderr)
        print(
            "\nSee app/middleware/log_scrub.py for the canonical list of "
            "URL-emitting loggers (`_TARGET_LOGGER_NAMES`).",
            file=sys.stderr,
        )
        return 1

    print(f"Logger-URL lint: OK ({sum(1 for _ in app_dir.rglob('*.py'))} files scanned).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
