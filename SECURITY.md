# Security policy

## Reporting a vulnerability

Please email the maintainer (see [`CITATION.cff`](CITATION.cff)) rather than opening a public GitHub issue. We aim to acknowledge reports within 5 working days and to ship a fix or mitigation within 30 days for high-severity issues.

## Disclosure scope

In-scope:
- Latest tagged release of Qualis.
- The reference deployment (if any) operated by Qualis maintainers.

Out-of-scope:
- Dev branches.
- Denial-of-service attacks against rate-limited endpoints (the limits are documented).
- Social engineering of project maintainers.
- Operator-side misconfigurations (see `docs/reference/gdpr-self-hosters.md` for the operator playbook).

CVE coordination: please use a CVSS 3.1 score in the initial report. We
respect a 90-day embargo by default and will coordinate publication with
the reporter.

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
- **Access-token revocation on password change** (F-03-010, 2026-05-03 audit). JWT tokens carry `iat`; `get_current_user` rejects tokens issued before `user.password_changed_at` advances. The `change_password` self-serve flow bumps `password_changed_at` so all in-flight tokens for that user are immediately invalidated.
- **JWT clock-skew leeway** (F-03-012). All `jwt.decode` call sites go through one of three wrapper functions (`decode_access_token`, `decode_email_token`, `decode_invitation_token`) that pass `leeway=settings.JWT_LEEWAY_SECONDS` (default 30s) to absorb NTP drift without widening the replay window.
- **URL-token log scrubbing** (F-03-013). The `TokenLogScrubFilter` rewrites query-string secrets (`token` / `otp` / `code`, case-insensitive) to `REDACTED` on three loggers: `uvicorn.access`, `app.middleware.errors`, `app.routers.logs`. Filter handles both `record.args` and `record.msg` (the latter for f-string log calls).
- **Pre-submission withdrawal** (F-05-001). Participants can call `DELETE /api/study/{slug}/draft` (session-token-bound) to clear in-progress data before submission, fulfilling the consent text's "no partial data retained on withdrawal" promise.
- **User-agent hashing** (F-05-002). UA strings are hashed at write time with `hash_user_agent` (same `IP_HASH_SALT`), preserving a `<device_class>:` prefix for analytics.
- **Audio S3 keys hashed-prefix** (F-05-004). New audio uploads use `audio/<sha256(slug|token|salt)[:32]>/...`; legacy keys still resolve via per-row `s3_key`. Bucket-list does not expose participant-token correlations.
- **Email-change confirmation flow** (F-05-011). `PATCH /me` no longer writes the email field directly; it parks the new address on `users.pending_email` and emails confirm-link (NEW) + cancel-link (OLD).
- **Lifecycle audit logging** (F-05-008). Discard / undiscard / per-participant erase / clear_all_participants / participant self-erase emit `log_admin_action` rows with mode discriminator (`admin_mediated`, `participant_self`, `bulk_anonymise`).
- **Bcrypt anti-enumeration pad** (F-03-005/006/007 + F-06-007). Login (`/api/token`), email-verify-resend, 2FA-disable-request, and registration all run a bcrypt cycle on the unknown-user arm against a fixed decoy hash, eliminating timing-based email enumeration.
- **OTP per-account brute-force cap** (F-03-004). 6-digit email OTP allows at most 30 wrong attempts per user in a 24h rolling window before HTTP 429 (`twofa_locked`).
- **Resume-code lockout** (F-06-001). Per-`sha256(slug|code)` rate limit (10/hour) on `GET /api/study/{slug}/resume/{code}` complements the existing 30/min per-IP limit.
- **Security-scans CI gate**. `.github/workflows/security-scans.yml` runs gitleaks, pip-audit, npm-audit, semgrep (OWASP Top Ten), and a custom `request.url`-in-loggers lint on every PR. Third-party GitHub Actions are SHA-pinned. Dependabot ships weekly Python / npm / GHA updates.
- **Dockerfile + nginx hardening** (F-02-006/007). Backend runs as non-root `app` user; nginx rejects unexpected `Host` headers (default allowlist; operator can extend via `NGINX_HOST_ALLOWLIST` build arg).
- **Direct dependency floors** (Wave 6 from 2026-05-03 audit). pygments, python-dotenv, requests pinned in `pyproject.toml` to their CVE-fix versions to prevent transitive-constraint drift.
- **Cross-tenant access regression suite** (F-04-001). 95-case IDOR harness (`backend/tests/security/wave_3/test_admin_idor_harness.py`) tests every admin endpoint for cross-project access denial; runs on every PR via `make ci`.

## Audit history

A multi-axis pre-submission code audit was conducted on **2026-04-25**.
Findings at `docs/audits/2026-04-25-deep-audit/`.

A seven-wave **comprehensive security audit** was conducted on
**2026-05-03**, refreshing the prior audit and adding deep dives across
auth-email flows, multi-tenant isolation, the consent and anonymisation
pipeline, business-logic abuse, and supply chain. The audit also
produced this SECURITY.md update, a threat model, an executive summary,
and a GDPR memo for self-hosters. Materials at
`docs/audits/2026-05-03-comprehensive-security-audit/`. Executive
summary: `00-executive-summary.md`.

## Related documentation

- **Threat model:** `docs/audits/2026-05-03-comprehensive-security-audit/08-threat-model.md`
- **GDPR memo for self-hosters:** `docs/reference/gdpr-self-hosters.md`
- **Action backlog:** `docs/audits/2026-05-03-comprehensive-security-audit/99-action-backlog.md`
