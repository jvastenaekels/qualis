# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Unit tests for the request.url-in-loggers lint script.

The script lives at `backend/scripts/lint_logger_urls.py` (Wave 6 Task 9).
Tests exercise the AST walker on synthetic source snippets to keep the
rule honest — adding a new logger.<level>(... .url ...) call site from
a non-allowlisted file must be caught at CI time.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

# Add scripts/ to sys.path so we can import the module under test.
_SCRIPTS_DIR = Path(__file__).resolve().parents[3] / "scripts"
sys.path.insert(0, str(_SCRIPTS_DIR))

from lint_logger_urls import (  # noqa: E402
    _is_logger_call,
    _refers_to_sensitive_attr,
)


def _first_call(src: str) -> ast.Call:
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            return node
    raise AssertionError("no Call node in snippet")


def test_logger_call_recognised_simple() -> None:
    """logger.error("...") is treated as a logger call."""
    call = _first_call('logger.error("hello")')
    assert _is_logger_call(call)


def test_logger_call_recognised_self_attr() -> None:
    """self.logger.warning(...) is also a logger call."""
    call = _first_call('self.logger.warning("hello")')
    assert _is_logger_call(call)


def test_non_logger_call_skipped() -> None:
    """logger.foobar(...) is NOT a logger call (foobar is not a level)."""
    call = _first_call('logger.foobar("hello")')
    assert not _is_logger_call(call)


def test_request_url_in_fstring_is_flagged() -> None:
    """f-string with request.url trips the sensitive-attr walker."""
    call = _first_call('logger.error(f"path {request.url}")')
    assert any(_refers_to_sensitive_attr(a) for a in call.args)


def test_request_url_positional_is_flagged() -> None:
    """Positional arg `request.url` after a format template is flagged."""
    call = _first_call('logger.error("path %s", request.url)')
    assert any(_refers_to_sensitive_attr(a) for a in call.args)


def test_request_query_string_is_flagged() -> None:
    """request.query_string is also in the sensitive set."""
    call = _first_call('logger.error(f"q={request.query_string}")')
    assert any(_refers_to_sensitive_attr(a) for a in call.args)


def test_request_url_kwarg_is_flagged() -> None:
    """Keyword arg `extra={'url': request.url}` reaches via ast.walk."""
    call = _first_call('logger.error("msg", extra={"url": request.url})')
    flagged = any(_refers_to_sensitive_attr(k.value) for k in call.keywords)
    assert flagged


def test_plain_url_variable_not_flagged() -> None:
    """A bare `url` variable (no attribute) does NOT trip the rule.

    The rule is dotted-attribute only — `request.url` /
    `request.query_string`. A local `url = scrub(...)` then
    `logger.error(url)` is allowed (the local binding is the
    contributor's responsibility).
    """
    call = _first_call('logger.error(url)')
    assert not any(_refers_to_sensitive_attr(a) for a in call.args)


def test_app_tree_currently_clean() -> None:
    """End-to-end: running the script on backend/app/ exits 0 today.

    Regression: a future contributor who adds an unscrubbed
    `request.url` log call from a non-allowlisted file will fail CI.
    """
    import importlib

    # The module exposes main(); reload to reset module-level state.
    mod = importlib.import_module("lint_logger_urls")
    importlib.reload(mod)
    assert mod.main() == 0
