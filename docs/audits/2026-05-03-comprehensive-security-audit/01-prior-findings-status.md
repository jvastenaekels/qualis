# Prior Findings Status — Refresh of 2026-04-25 Audit

**Refreshed at commit:** `bb3413d3`
**Method:** for each F-01-XXX, located fix (or its absence) via `git log -G '<sentinel>'`
plus a current-state grep on the file referenced in **Location**. Every "fixed"
classification is two-pronged: a fix commit reachable from `main` plus a
verification that the current source on `audit/1-refresh-scanners` (which is
branched from `main`) reflects the post-fix state.

## Status table

| ID | Title | Severity | Status | Fix commit | Notes |
|----|-------|----------|--------|------------|-------|
| F-01-001 | PyJWT CVE-2026-32597 crit-header bypass | blocker | fixed | `9e0c790c` | `pyjwt>=2.12.0` in `backend/pyproject.toml` |
| F-01-002 | Local `.env` file contains real database credentials | blocker | fixed | `8dbe635f` | `.env.example` committed at repo root; `.env` still gitignored; credential `REDACTED-LOCAL-DEV-PW` confirmed never in git history (`git log -S` on the password returns only the audit doc itself). Recommendation (3) — pre-commit gitleaks hook — only partially landed (`.gitleaksignore` exists but no `gitleaks` entry in `.pre-commit-config.yaml` or CI); see notes below. |
| F-01-003 | Unauthenticated test-router endpoints active in `development` env | blocker | fixed | `c7121213` | `Settings.ENVIRONMENT` default flipped from `"development"` to `"production"`; `Procfile` exports `ENVIRONMENT=${ENVIRONMENT:-production}`; `scalingo.json` declares `ENVIRONMENT=production`. Test router still gated only on env (no second `TESTING=true` gate as the original recommendation suggested), but the fail-closed default neutralises the blocker. |
| F-01-004 | Rate limiter X-Forwarded-For spoofable | major | fixed | `c943cc89` | New `Settings.TRUSTED_PROXIES` (default empty list = ignore the header). `_get_real_ip` in `backend/app/limiter.py:15-39` only honours `X-Forwarded-For` when the immediate TCP peer is in `trusted_proxies_list` or the operator sets `*`. |
| F-01-005 | `DOMPurify` XSS CVEs | major | fixed | `c943cc89` | `frontend/package.json` pins `"dompurify": "^3.4.1"` (≥ 3.4.0; covers all 7 advisories listed in the prior finding). |
| F-01-006 | `xlsx` prototype pollution + ReDoS (no fix available) | major | fixed (documented acceptance) | `c943cc89` | `SECURITY.md` documents the acceptance: `xlsx` is used only to write export files (`analysisXlsxExport.ts`), never to parse user input; CVEs require attacker-controlled XLSX parsing, not a reachable path. Mitigation plan documented (switch to ExcelJS if reachability changes). |
| F-01-007 | CORS `allow_headers: ["*"]` | major | fixed | `c943cc89` | `backend/app/main.py:154-161` now declares an explicit allow-list: `Authorization`, `Content-Type`, `Accept`, `Accept-Language`, `X-Project-ID`, `X-Requested-With`. |
| F-01-008 | `i18next-http-backend` path traversal CVE | major | fixed | `c943cc89` | `frontend/package.json` pins `"i18next-http-backend": "^3.0.6"` (≥ 3.0.5). |
| F-01-009 | `python-multipart` DoS (CVE-2026-40347) | minor | fixed | `728860de` | `backend/pyproject.toml` pins `"python-multipart>=0.0.26"`. |
| F-01-010 | JWT 8h lifetime, no refresh, no revocation on password change | minor | partial-fix | `94d33870` | F-03-010 closed access-token side; refresh-token rotation deferred to Wave 2b |
| F-01-011 | Gitleaks findings are documentation/test false positives | observation | fixed | `894d8a0e` | `.gitleaksignore` covers all 9 prior FPs (canonical AWS sample key + RFC-9562 sample UUIDs in tests/docs) and was extended in Task 4 to also cover the FPs surfaced by re-running gitleaks at the new commit. |
| F-01-012 | No RGPD Art. 17 individual erasure endpoint | major | fixed | `8678466e` | `DELETE /api/admin/studies/{slug}/participants/{participant_id}/personal-data` exists at `backend/app/routers/admin/studies_participants.py:179-225`, gated on `StudyRole.editor`, calls `StudyDataService.anonymise_participant` which nulls PII columns, deletes audio recordings from S3, rotates `session_token`, and stamps `anonymised_at`. The strategy is anonymisation-rather-than-hard-delete (Q-sort rankings preserved as anonymous research data) — explicitly justified in the docstring. Companion participant-initiated endpoint `DELETE /api/study/{slug}/personal-data` is also referenced. |
| F-01-013 | CSP `style-src 'unsafe-inline'` | minor | still-open | — | `backend/app/middleware/security.py:27` still emits `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;`. No nonce/hash strategy adopted. The original finding flagged this as a known trade-off (Tailwind utility classes); no remediation has been attempted. |
| F-01-014 | Bandit low-severity findings confirmed as non-issues | observation | n/a | — | The original finding's recommendation was "No action required". A current-state run of `uv run bandit -r app -ll` returns "No issues identified" at low+ severity (only 2 issues at strict undefined level, both `#nosec`-suppressed and unchanged); the finding's premise (5 low-sev confirmed-benign reports) is no longer reproducible at the configured threshold, but the underlying recommendation never required action. Treating as `n/a`. |

## Detailed verification per still-open / regressed finding

### F-01-010 — JWT access token lifetime is 8 hours with no refresh token mechanism

- **Status:** partial-fix
- **Access-token side (closed):** commit `94d33870` (Wave 2 F-03-010): `create_access_token`
  now embeds `iat`; `get_current_user` rejects tokens with `iat < int(user.password_changed_at.timestamp())`;
  `change_password` bumps `password_changed_at`. Tokens minted before a password change are
  now invalidated on the next request. See `99-action-backlog.md` Wave 2 entry for F-03-010.
- **Refresh-token side (deferred):** refresh_tokens table, /refresh + /logout endpoints,
  login response shape change, frontend auto-refresh, multi-device session tracking,
  JWT lifetime reduction (8h → 15min) — deferred to Wave 2b PR.
  See `99-action-backlog.md` Wave 2b section for the deferred work item.

### F-01-013 — CSP `style-src 'unsafe-inline'` reduces XSS protection

- **Status:** still-open
- **Evidence:**
  - `backend/app/middleware/security.py:25-29` —
    ```python
    self._csp = (
        f"default-src 'self'; script-src 'self'; "
        f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        ...
    )
    ```
    `'unsafe-inline'` is unchanged from the original finding. No nonce or hash-based mitigation present.
  - The recommendation explicitly noted this as "minor improvement, not an emergency". No remediation work has been attempted.
- **Plan:** scheduled for Wave 6 (axis: hardening — CSP/headers naturally fits the build-and-deploy hygiene cluster). An alternative home would be Wave 3 (admin-surface authz / multi-tenant) but the issue is browser-side and infra-flavoured; Wave 6 is the better fit.

## Summary

- fixed: 11
- partial-fix: 1
- regressed: 0
- still-open: 1
- n/a: 1

Total: 14.

## Notes on partial fixes

**F-01-002:** the third recommendation (pre-commit `gitleaks` hook or CI check
that blocks `.env` commits) was not implemented. `.gitleaksignore` exists at
the repo root and is consumed by ad-hoc gitleaks runs, but `.pre-commit-config.yaml`
has no `gitleaks` entry and `.github/workflows/ci.yml` does not invoke it. The
core blocker (real credentials in repo) is mitigated (gitignored, never in
history, `.env.example` provides safe template), so the finding is `fixed`,
but the secret-scanning-in-CI gap is folded into Wave 6 supply-chain work and
tracked in `99-action-backlog.md` as a Wave 1 follow-up note rather than a
re-opened finding.

**F-01-003:** the fix relies on the fail-closed default rather than the
recommended belt-and-braces second gate (`TESTING=true`). The blocker is
neutralised because production deployments now need to actively *opt in* to
`ENVIRONMENT=development` to expose the test router; the residual residual is
that a misconfigured developer setting `ENVIRONMENT=development` on a public
host would still expose unauthenticated endpoints. Acceptable: classification
is `fixed`, and any future hardening (the `TESTING=true` second gate) can be
opened as a fresh finding if Wave 3's authz pass surfaces it.
