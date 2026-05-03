# Action Backlog — 2026-05-03 Comprehensive Security Audit

Cumulative across all seven waves. Items move through:
`open` → `in-progress (wave N)` → `closed (PR #X)` or `deferred (rationale)`.

## Wave 1

- F-02-001 (severity=minor) — pygments 2.19.2 → 2.20.0 (CVE-2026-4539 ReDoS).
  **closed** in commit `b85e5c89` (bumped lockfile; regression test added in `265ef7b4`).
- F-02-002 (severity=minor) — python-dotenv 1.2.1 → 1.2.2 (CVE-2026-28684 symlink overwrite).
  **closed** in commit `5f9a58fa` (bumped lockfile; regression test added in `265ef7b4`).
- F-02-003 (severity=minor) — requests 2.32.5 → 2.33.1 (CVE-2026-25645 predictable temp file).
  **closed** in commit `5b06f3ea` (bumped lockfile; regression test added in `265ef7b4`).
- F-02-004 (severity=observation) — pip 26.0 (CVE-2026-3219 tar/zip confusion).
  **deferred** — no fix-version available upstream as of 2026-05-03. Revisit at Wave 6 dep audit.
- F-02-005 (severity=minor) — xlsx (Prototype Pollution / ReDoS — no fix available).
  **deferred** — accepted-risk per `SECURITY.md:25-29` (Qualis writes XLSX only, never parses untrusted input).
- F-02-008 (severity=observation) — semgrep `avoid-sqlalchemy-text` in `backend/app/routers/test.py` (env-gated test router).
  **deferred** — false positive; env-gated router uses hardcoded literals only, no untrusted input.
- F-02-009 (severity=observation) — semgrep `avoid-sqlalchemy-text` in operational migration scripts.
  **deferred** — false positive; migration scripts contain no untrusted input.

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
- F-01-002 partial-fix gap (carry-over from 2026-04-25, severity=observation) — gitleaks pre-commit hook /
  CI check was recommended but never implemented. Immediate credential-exposure threat is mitigated
  (`.env.example` shipped, history verified clean), but a defence-in-depth gate against future `.env`
  commits is missing. Scheduled for Wave 6. Source: `01-prior-findings-status.md#f-01-002`.
- F-02-006 (severity=minor) — Dockerfile missing `USER` directive (`backend/Dockerfile:16`).
  **deferred** to Wave 6 supply-chain hardening (operational hygiene). Source: `02-scanner-pass.md#f-02-006`.
- F-02-007 (severity=minor) — nginx forwards unvalidated `$host` header (`frontend/nginx.conf:10`).
  **deferred** to Wave 6 (host-header injection mitigation). Source: `02-scanner-pass.md#f-02-007`.
- NEW (severity=observation) — Add CI gate: `pip-audit` on every PR. Rationale: Wave 1 closed
  F-02-001/002/003 via lockfile-only bumps (pygments, python-dotenv, requests are transitive deps);
  without a CI gate a future `uv lock` could downgrade them if a transitive constraint loosens. Pairs
  naturally with the gitleaks pre-commit gate (F-01-002 partial-fix). Source: Wave 1 review note.
- NEW (severity=observation) — Consider promoting transitive CVE-fixed deps (pygments, python-dotenv,
  requests) to direct entries in `backend/pyproject.toml` with a `>=<fix-version>` floor. Defence-in-depth
  against transitive-constraint drift. Source: Wave 1 review note.

## Wave 7 — Deliverables
_pending Wave 7 plan._

## Deferred items

Items deferred indefinitely (no target wave scheduled yet, or no upstream fix available):

- F-02-004 (pip 26.0, CVE-2026-3219) — no upstream fix available as of 2026-05-03; see Wave 1 entry.
- F-02-005 (xlsx Prototype Pollution/ReDoS) — accepted-risk per `SECURITY.md:25-29`; see Wave 1 entry.
- F-02-008 (semgrep test-router false positive) — false positive, env-gated; see Wave 1 entry.
- F-02-009 (semgrep migration-script false positive) — false positive, no untrusted input; see Wave 1 entry.
