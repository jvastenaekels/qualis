# Wave 4 — Consent & Anonymisation Pipeline

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `ed4b0488` of `audit/4-consent-anonymisation`

## Scope

Files audited:
- `backend/app/routers/participants.py` (`record_consent`, submit, drafts)
- `backend/app/services/submission_service.py`
- `backend/app/services/storage_service.py`
- `backend/app/services/export_service.py`
- `backend/app/routers/audio.py`
- `backend/app/routers/admin/lifecycle.py` (`is_discarded`, `anonymised_at`)
- `backend/app/models/participant.py`, `backend/app/models/study.py` (consent fields)

No carry-overs. Wave 4 uses `F-05-NNN` ID space.

## Inventory

_Filled by Task 2._

## Data lifecycle map

_Filled by Task 2._

## Summary

| Severity | Count |
|----------|-------|
| blocker | 0 |
| major | 0 |
| minor | 0 |
| observation | 0 |

## Findings

_Populated as findings are filed by Tasks 3-9._

## GDPR-memo material (load-bearing for Wave 7)

_Filled by Task 2 step 2.5._

## Resolved since prior

_Listed by Task 10 if any prior consent-related findings were closed._

## False positives — not filed
