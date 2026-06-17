"""Regression test: assert the public security deliverables exist and contain
their expected sections.

The detailed audit dossiers are kept outside this repository; this guards the
two public-facing security documents that remain: SECURITY.md and the GDPR
memo for self-hosters.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3].parent

DELIVERABLES = {
    "gdpr_memo": (
        "docs/reference/gdpr-self-hosters.md",
        [
            "Roles",
            "Personal-data inventory",
            "Lawful-basis",
            "Subject-rights",
            "Art. 32",
            "Art. 30",
        ],
    ),
    "security_md": (
        "SECURITY.md",
        [
            "Reporting a vulnerability",
            "Disclosure scope",
            "Security-relevant practices",
            "Audit history",
            "2026-04-25",
            "2026-05-03",
        ],
    ),
}


def test_all_deliverables_exist() -> None:
    for name, (path, _) in DELIVERABLES.items():
        full = REPO_ROOT / path
        assert full.is_file(), f"Security deliverable missing: {name} at {path}"


def test_deliverables_contain_expected_sections() -> None:
    for name, (path, sections) in DELIVERABLES.items():
        full = REPO_ROOT / path
        content = full.read_text(encoding="utf-8")
        for section in sections:
            assert section in content, (
                f"{name} ({path}) missing expected substring: {section!r}"
            )
