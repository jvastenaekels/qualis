# Wave 6 — Supply Chain

**Date:** 2026-05-03
**Auditor:** Claude Opus 4.7
**Codebase ref:** commit `e46a66f6` of `audit/6-supply-chain`

## Scope

Operational hardening across:
- CI workflows (gitleaks gate, pip-audit gate, npm-audit gate, semgrep)
- GitHub Actions third-party SHA pinning
- Dockerfile USER directive
- nginx `$host` validation
- CSP `style-src 'unsafe-inline'` tightening
- Direct-pin promotion of CVE-fixed transitive deps
- `consumed_email_tokens` cleanup scheduling
- `request.url`-in-loggers lint rule
- Dependabot / Renovate config

Wave 6 closes 9 carry-overs from prior waves. Uses **F-07-NNN** for any net-new findings.

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

_Per-task findings filed by Tasks 3-10._

## Carry-overs status

_Filled by Task 11 with closing SHAs:_
- F-01-002 partial-fix gap (gitleaks pre-commit/CI)
- F-01-013 (CSP style-src 'unsafe-inline')
- F-02-004 (pip 26.0 CVE — no fix yet)
- F-02-006 (Dockerfile USER)
- F-02-007 (nginx $host)
- F-03-003 (consumed_email_tokens cleanup not scheduled)
- pip-audit CI gate (NEW observation from Wave 1)
- direct-pin promotion (NEW observation from Wave 1)
- request.url-in-loggers lint (NEW observation from Wave 2)

## Resolved since prior

_Filled by Task 11._

## False positives — not filed
