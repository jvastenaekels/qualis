# Wave 5 — Business-Logic Abuse

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `bde2496a` of `audit/5-business-logic-abuse`

## Scope

Per-flow audits across:
- Resume-code brute-force / cross-study replay / TOFU
- Draft-responses isolation under shared-device scenarios
- Recruitment capacity race
- `is_test_run` flag tampering
- Audio upload abuse (size / MIME / filename traversal)
- Submission idempotency (double-submit, submit-on-behalf)
- F-03-008 carry-over (`/api/register` body+status enumeration redesign)

Wave 5 uses **F-06-NNN** ID space.

No mandatory code-reviewer gate per spec.

## Inventory

_Filled by Task 2._

## Summary

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 0 |
| minor | 0 |
| observation | 0 |

## Findings

_Populated by Tasks 3-9._

## Resolved since prior

_Listed by Task 10 if any prior business-logic findings closed since Wave 2/3/4._

## False positives — not filed
