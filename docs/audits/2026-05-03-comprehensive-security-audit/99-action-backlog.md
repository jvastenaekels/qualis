# Action Backlog — 2026-05-03 Comprehensive Security Audit

Cumulative across all seven waves. Items move through:
`open` → `in-progress (wave N)` → `closed (PR #X)` or `deferred (rationale)`.

## Wave 1

_No items yet — populated by Tasks 5, 6, 7, 8._

## Wave 2 — Auth-email flows

- F-01-010 (carry-over from 2026-04-25, severity=minor) — JWT access token lifetime is 8h with no refresh / no revocation on password change.
  Scheduled for Wave 2. Source: `01-prior-findings-status.md#f-01-010`.

## Wave 3 — Multi-tenant isolation
_pending Wave 3 plan._

## Wave 4 — Consent & anonymisation pipeline
_pending Wave 4 plan._

## Wave 5 — Business-logic abuse
_pending Wave 5 plan._

## Wave 6 — Supply chain

- F-01-013 (carry-over from 2026-04-25, severity=minor) — CSP `style-src 'unsafe-inline'` reduces XSS protection.
  Scheduled for Wave 6 (browser-side hardening fits the build/deploy hygiene cluster; Wave 3 is an alternative home).
  Source: `01-prior-findings-status.md#f-01-013`.

## Wave 7 — Deliverables
_pending Wave 7 plan._

## Deferred items
_None yet._
