# Security policy

## Reporting a vulnerability

Please email the maintainer (see [`CITATION.cff`](CITATION.cff)) rather than opening a public GitHub issue. We aim to acknowledge reports within 5 working days and to ship a fix or mitigation within 30 days for high-severity issues.

## Supported versions

We patch the latest tagged release. Older releases are best-effort.

## Known dependency-level findings (deliberate acceptance)

Dependencies surface CVEs that we have evaluated and chose not to fix because the affected code paths are not reachable in Qualis's usage.

### Bandit suppressions

`bandit -ll` (run by `make check`) flags a small number of patterns where the static heuristic does not match the actual semantics. Each suppression is annotated inline with `# nosec <test-id>` and the rationale lives next to the code:

- `app/routers/auth.py:103` — `# nosec B106`. The string `"bearer"` is the OAuth2 token-type literal returned to the client, not a credential.
- `app/services/study_service.py` (~line 503) — `# nosec B311`. `random.Random` is used to produce a deterministic per-session statement-shuffle for Q-methodology reproducibility; it is not security-sensitive. The seed is derived from the session token.
- `app/services/study_service.py` (~line 542) — `# nosec B105`. The dict key `requires_password` is a payload field name; the value is the literal `False`. Bandit pattern-matches the key and flags the entry. The suppression is hoisted to a single-line local assignment to keep the AST attribution scoped.

Last reviewed: 2026-05-01.

### `xlsx` (SheetJS Community Edition)

[GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) (prototype pollution) and [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) (ReDoS) require **attacker-controlled XLSX inputs to be parsed**. Qualis only **writes** XLSX files for export (`frontend/src/utils/analysisXlsxExport.ts`); it never parses untrusted XLSX. The test suite parses XLSX but only data it just wrote.

Mitigation if reachability changes (e.g. import-from-XLSX is added): switch to ExcelJS or vendor SheetJS Pro from the official CDN.

Last reviewed: 2026-04-25.

## Security-relevant practices in Qualis

These are not a guarantee of security but document the design choices reviewers commonly verify:

- **Authentication.** JWT bearer tokens (`pyjwt >= 2.12.0`, patched against [CVE-2026-32597](https://github.com/advisories/GHSA-752w-5fwx-jx9f)). 2FA via TOTP for researcher accounts.
- **Test endpoints.** `/api/test/*` is wired only when `ENVIRONMENT in ("test", "development")`; the default is `"production"` (fail-closed). `Procfile` and `scalingo.json` set `ENVIRONMENT=production` explicitly.
- **CORS.** Origin allow-list (no wildcard) + explicit allow-headers.
- **Rate limiting.** Trust X-Forwarded-For only when the immediate TCP peer is in `TRUSTED_PROXIES` (default empty = ignore the header).
- **Participant IPs.** Hashed with a configurable salt (`IP_HASH_SALT`) before any storage.
- **GDPR Art. 17 erasure.** Both participant self-service (session-token-bound) and admin-mediated. Bulk anonymisation with cutoff date for retention enforcement. Audit-trail logging.
- **Audit trail.** `app.audit` logger emits structured entries for security-relevant admin mutations (user CRUD, role change, project-member management, study state transitions, study delete, bulk anonymisation).
- **Error reporting.** Optional Sentry integration (`SENTRY_DSN`) with `send_default_pii=False`.
- **Security headers.** CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy via custom middleware.
- **Self-hosted by design.** Operators choose their data residency; no third-party SaaS in the request path.

## Audit history

A multi-axis pre-submission code audit was conducted on 2026-04-25. Findings are at `docs/audits/2026-04-25-deep-audit/` for reviewers who want to see what was examined and what was deferred.
