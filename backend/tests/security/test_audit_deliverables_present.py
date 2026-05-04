"""Wave 7 regression test: assert all audit deliverables exist and contain expected sections.

Pinned by the closing commit of the 2026-05-03 comprehensive security audit;
fails if a future cleanup deletes the threat model, GDPR memo, exec summary,
SECURITY.md extension, or audit-history index.
"""
from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2].parent

DELIVERABLES = {
    "threat_model": (
        "docs/audits/2026-05-03-comprehensive-security-audit/08-threat-model.md",
        ["STRIDE", "Top-10", "attack tree", "Trust boundaries"],
    ),
    "executive_summary": (
        "docs/audits/2026-05-03-comprehensive-security-audit/00-executive-summary.md",
        ["Audit scope", "Severity counts", "Risk delta", "Methodology"],
    ),
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
    "audits_index": (
        "docs/audits/README.md",
        ["2026-05-03", "2026-04-25", "Comprehensive security audit"],
    ),
    "action_backlog": (
        "docs/audits/2026-05-03-comprehensive-security-audit/99-action-backlog.md",
        ["Wave 1", "Wave 7", "Deferred items"],
    ),
}


def test_all_deliverables_exist() -> None:
    for name, (path, _) in DELIVERABLES.items():
        full = REPO_ROOT / path
        assert full.is_file(), f"Wave 7 deliverable missing: {name} at {path}"


def test_deliverables_contain_expected_sections() -> None:
    for name, (path, sections) in DELIVERABLES.items():
        full = REPO_ROOT / path
        content = full.read_text(encoding="utf-8")
        for section in sections:
            assert section in content, (
                f"{name} ({path}) missing expected substring: {section!r}"
            )
