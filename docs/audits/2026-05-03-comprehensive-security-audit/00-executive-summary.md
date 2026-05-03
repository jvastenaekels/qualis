# Executive Summary — 2026-05-03 Comprehensive Security Audit

**Date:** 2026-05-03
**Codebase ref:** `f1b9cb97` (Wave 7 deliverables branch, post-Wave-6 merge).
**Methodology:** Static analysis + scanner battery + dynamic exploit scripts +
regression tests, organised in seven waves.
**Auditor:** Claude Opus 4.7 (under @jvastenaekels supervision).

## 1. Audit scope

The audit combined three modes:

1. **Refresh** of the 2026-04-25 pre-submission audit (14 prior findings,
   F-01-NNN). Verify each fix landed and stuck; flag regressions.
2. **Deep dive** across five axes, each shipped as its own wave with its
   own design + plan + PR:
   - Wave 2 — auth-email flows (login, password reset, email verify,
     2FA-email, email-change, register).
   - Wave 3 — multi-tenant isolation (89 admin routes; cross-project
     IDOR harness).
   - Wave 4 — consent and anonymisation pipeline (Art. 17, audio S3
     keys, lifecycle audit logging).
   - Wave 5 — business-logic abuse (resume-code, draft-responses,
     submission idempotency, audio upload abuse, register enumeration).
   - Wave 6 — supply-chain hardening (CI scanners, GHA SHA-pinning,
     Dependabot, Dockerfile/nginx, direct-pin promotion).
3. **Publishable artefacts** (Wave 7): SECURITY.md update, threat
   model, GDPR memo for self-hosters, this executive summary, and an
   updated action backlog.

A separate Wave 1 ran the scanner battery (gitleaks, pip-audit, bandit,
npm audit, semgrep) before any deep-dive work, to detect blind spots in
the prior audit's scope.

## 2. Severity counts

Cumulative across all 2026-05-03 findings (F-02-NNN through F-06-NNN),
plus the two carry-overs from the 2026-04-25 audit that remained open at
audit start (F-01-010, F-01-013). Source of truth:
[`99-action-backlog.md`](99-action-backlog.md).

| Severity    | Filed | Closed | Deferred |
|-------------|-------|--------|----------|
| blocker     | 0     | 0      | 0        |
| major       | 7     | 7      | 0        |
| minor       | 20    | 16     | 4        |
| observation | 19    | 13     | 6        |
| n/a         | 1     | 1      | 0        |
| **Total**   | **47**| **37** | **10**   |

The "deferred" column splits as follows:

- **Minor (4):** F-02-005 (xlsx accepted-risk; no upstream fix),
  F-04-006 (quota TOCTOU; default unlimited makes the race harmless on
  OSS), F-01-013 carry-over (CSP `style-src 'unsafe-inline'`; deferred
  to Wave 6b nonce work), F-01-010 carry-over (refresh-token rotation
  half — access-token half closed in Wave 2 via F-03-010; deferred to
  Wave 2b).
- **Observation (6):** F-02-004 (pip 26.0 CVE; no upstream fix),
  F-02-008 / F-02-009 (semgrep false positives), F-05-003
  (`card_comment` operator screening; not programmatically fixable),
  F-05-005 (S3 lifecycle = operator obligation), F-05-007
  (Art. 15 self-export portal; admin endpoints already cover the
  one-month window).

All 7 **major** findings closed. Zero blockers filed in this audit (the
2026-04-25 audit's three blockers were already fixed before this audit
started, verified in Wave 1).

## 3. Risk delta vs 2026-04-25

The prior audit filed **14 findings** (F-01-001 through F-01-014). After
Wave 1 verification + Wave 2 follow-up:

- **11 fixed** (F-01-001 through F-01-009, F-01-011, F-01-012). Verified
  twice — fix commit reachable from `main`, plus a current-state grep on
  the location cited in the original finding.
- **0 regressed.**
- **1 partial-fix carried into Wave 2** — F-01-010. The access-token
  invalidation half closed in Wave 2 via F-03-010 (commit `94d33870`:
  `iat` claim + `password_changed_at` check). The refresh-token rotation
  half deferred to Wave 2b (out of scope for the Wave 2 PR — would have
  doubled the diff).
- **1 still-open, deferred to Wave 6b** — F-01-013 (CSP
  `style-src 'unsafe-inline'`). 73 inline-style sites in the SPA,
  including ~6 framer-motion `MotionValue` props (`style={{ x, y, rotate }}`)
  that cannot move to Tailwind classes — they're imperative animation
  values. Fix requires per-request nonce wiring through Vite plugin +
  ASGI middleware + React context.
- **1 n/a** — F-01-014 (bandit low-severity findings; the original
  recommendation was "no action required", and the threshold-tuned
  `bandit -ll` run is now clean).

Summary line: **11 fixed / 0 regressed / 1 partial-fix (access-token
half closed in Wave 2) / 1 still-open (deferred Wave 6b) / 1 n/a**.

## 4. Top 5 residual risks

These are the items the audit did not fully close, ranked by likelihood ×
impact at the current commit. Each has a documented disposition; none
are open invitations to attack.

1. **F-01-013 — CSP `style-src 'unsafe-inline'`.** *Likelihood: low
   (DOMPurify pinned, `script-src 'self'` and `frame-ancestors 'none'`
   carry XSS resistance). Impact: medium-high in the worst-case nested
   XSS path.* Deferred to Wave 6b: nonce-based CSP needs build-time
   plugin + per-request middleware + React context — a dedicated PR.
   Revisit when nonce wiring is scoped.

2. **F-04-006 — Member-quota TOCTOU race.** *Likelihood: very low (default
   `MAX_MEMBERS_PER_PROJECT=0` = unlimited in OSS; only deployments with
   an explicit cap are exposed). Impact: low (over-fill is bounded,
   recoverable, no billing or security boundary crossed).* Deferred to
   the backlog. Recommended fix when revisited: `SELECT … FOR UPDATE` on
   the project sentinel row, or a DB-level cap constraint. Activate when
   billing/licensing makes the cap load-bearing.

3. **F-02-005 — `xlsx` Prototype Pollution / ReDoS.** *Likelihood: zero
   in current code (Qualis only writes XLSX, never parses untrusted
   input). Impact: high if reachability changes.* Accepted-risk per
   `SECURITY.md` (xlsx accepted-risk block). Mitigation plan documented:
   switch to ExcelJS or vendor SheetJS Pro if a future feature ingests
   user-supplied XLSX.

4. **F-02-004 — pip 26.0 CVE-2026-3219 (tar/zip confusion).** *Likelihood:
   low (Qualis does not pip-install at runtime). Impact: medium (build
   compromise).* Deferred indefinitely — no upstream fix-version
   available as of 2026-05-03. Tracked in Dependabot weekly cadence.

5. **F-03-008 frontend-half — register page UX copy after always-201
   redesign.** *Likelihood: medium (UX is technically inconsistent with
   backend contract, but the leak is bounded by always-201). Impact: low
   (information disclosure already neutralised at the API).* Backend
   half closed in Wave 5 by F-06-007 (commit `f60e754b`); frontend
   reformulation deferred to Wave 5b — needs en/fr/fi translation
   reformulation and a confirm-modal UX review.

For the full residual-risk inventory, see
[`08-threat-model.md` §5 top-10 risks](08-threat-model.md#5-top-10-ranked-risks).

## 5. Compliance posture

- **GDPR Art. 5 (data minimisation, integrity/confidentiality,
  accountability):** operator playbook in
  [`docs/reference/gdpr-self-hosters.md`](../../reference/gdpr-self-hosters.md).
  The Qualis maintainers ship the software as a data processor / vendor;
  the operator is the data controller. The memo enumerates 8 operator
  obligations covering log redaction, S3 bucket lifecycle, consumed-token
  cleanup scheduler, IP_HASH_SALT custody, MFA on the hosting console,
  free-text screening, and DPA / Art. 30 inventory templates.
- **GDPR Art. 32 (security of processing):** 14 application-layer
  controls mapped — see GDPR memo §7. Hashed IP / UA / audio-prefix,
  bcrypt cost-12 passwords, JWT signing key in env-only, CORS allow-list
  (no wildcard), `TRUSTED_PROXIES` for `X-Forwarded-For` evaluation,
  `app.audit` log stream on lifecycle mutations, lifecycle audit logging
  with mode discriminator (F-05-008), URL-token log scrubbing (F-03-013),
  pre-submission withdrawal (F-05-001), email-change dual-confirmation
  (F-03-011), access-token revocation on password change (F-03-010),
  bcrypt anti-enumeration pad (F-03-005/6/7 + F-06-007), OTP per-account
  brute-force cap (F-03-004), resume-code per-code lockout (F-06-001).
- **Art. 17 erasure:** anonymisation-as-erasure position documented
  (F-05-009) per Recital 26. Both participant self-service
  (`DELETE /api/study/{slug}/personal-data`) and admin-mediated
  (`DELETE /api/admin/studies/{slug}/participants/{participant_id}/personal-data`)
  endpoints exist; bulk anonymisation with cutoff-date retention.
- **Pseudonymisation as default.** IP, UA, and audio S3 prefixes are all
  SHA-256 hashed with per-deployment `IP_HASH_SALT`. The salt is
  documented as operator obligation #1 — rotation orphans every existing
  hash, so once-and-stable.

## 6. Methodology and tools

**Scanners (Wave 1 + Wave 6 CI gate):**

- gitleaks 8.18.4 — secret scan with `.gitleaksignore` for documented
  test/sample-data false positives.
- pip-audit 2.10.0 — Python advisory database (mirrors `ci.yml`
  backend-lint ignore list).
- bandit 1.9.3 — Python security linter at `-ll` threshold (low+ severity);
  three documented `# nosec` suppressions in `SECURITY.md`.
- npm audit (npm 11.12.1) — frontend advisories.
- semgrep 1.150.0 — OWASP Top Ten ruleset; two `avoid-sqlalchemy-text`
  false positives suppressed (env-gated test router and migration scripts).

**Custom CI lint** (Wave 6): `backend/scripts/lint_logger_urls.py` flags
any `logger.<level>(... .url ...)` outside the two loggers wired into
`app.middleware.log_scrub._TARGET_LOGGER_NAMES`. Pure-stdlib AST walker;
9 unit tests cover f-string, positional, %-format, kwarg, and
`self.logger` variants.

**Dynamic exploit scripts.** Archived under
`docs/audits/2026-05-03-comprehensive-security-audit/.raw/exploits/` for
the four findings that needed timing-difference measurements
(F-03-005/006/007/010). Each script reproduces the vulnerability against
a local dev server, prints the timing histogram, and the corresponding
regression test pins the post-fix mean delta.

**Regression tests.** 31 files under `backend/tests/security/wave_{1..7}/`
covering ~150 individual security cases. Every closed finding is pinned;
many are documented as no-code-change (the "verify the design contract")
pattern using the same harness.

**Plan-driven workflow.** Each wave shipped with its own
`docs/superpowers/plans/2026-05-03-audit-wave-N-*.md` design + plan PR,
followed by an implementation PR. Code-reviewer subagent (Opus) was
mandatory on cross-cutting waves (Waves 2, 3, 4) where call-site
propagation could mask regressions.

## 7. Wave-by-wave summary

### Wave 1 — Refresh + scanner pass — PR #108

Verified the 14 prior findings: 11 fixed, 1 partial-fix (F-01-010,
carry-over to Wave 2), 1 still-open (F-01-013, deferred to 6b), 1 n/a.
Ran the scanner battery and filed 8 new findings in the F-02-NNN range:
3 transitive CVE bumps (pygments, python-dotenv, requests — all closed
in commit `b85e5c89` / `5f9a58fa` / `5b06f3ea`), 2 documented accepted
risks (xlsx, pip 26.0), 2 semgrep false positives in env-gated code, and
2 Dockerfile / nginx hardening items (F-02-006/007 — closed in Wave 6
to consolidate the CI work). Wave 1 also formalised the audit-waves
pattern (numbered waves shipped as separate PRs; mid-wave backlog review).

### Wave 2 — Auth-email flows — PR #110

Closed all four major timing-enumeration findings (F-03-005/006/007 +
F-06-007 backend half via Wave 5) by hoisting the bcrypt anti-enum pad
out of `else` branches so both 401 arms spend a bcrypt cycle. Closed
F-03-004 (OTP per-account 24h cap of 30 wrong attempts → 0.003%/day
brute-force ceiling). Closed F-03-010 (access-token revocation on
password change via `iat` + `password_changed_at`). Closed F-03-011
(email-change dual-confirmation with `pending_email` parking).
Closed F-03-013 (broadened log-scrub regex to `(token|otp|code)` IGNORECASE,
attached the filter to `app.middleware.errors` and `app.routers.logs`
beyond the existing `uvicorn.access`). Closed F-03-012 (30s
`JWT_LEEWAY_SECONDS` for NTP drift). Refresh-token rotation deferred to
Wave 2b. Frontend `pending_email` UX deferred to Wave 2b.

### Wave 3 — Multi-tenant isolation — PR #116

Built a 95-case parametrised IDOR harness covering every admin endpoint
across two attack patterns (A_NO_HEADER and B_VALID_HEADER) and three
endpoint patterns (A: project-scoped via header/path, B: object-id
inline ownership check, C: top-level / superuser). Result: zero leakage
(F-04-001), retained as a CI regression guard. Verified
recruitment-token cross-study replay (F-04-002), audio upload
session-token binding (F-04-003), resume-code study-scoped lookup
(F-04-004), and bulk-export ownership filter chains (F-04-005). Filed
F-04-006 (member-quota TOCTOU) and deferred — default cap unlimited in
OSS makes the race harmless; revisit when billing activates.

### Wave 4 — Consent & anonymisation — PR #118

Closed F-05-001 (`DELETE /api/study/{slug}/draft` for pre-submission
withdrawal). Closed F-05-002 (`hash_user_agent` with `<device_class>:`
prefix). Closed F-05-004 (`_hashed_audio_prefix` for new audio uploads;
legacy keys still resolve via per-row `s3_key`). Closed F-05-006
(per-participant exports filter on `anonymised_at IS NULL`). Closed
F-05-008 (lifecycle audit logging with mode discriminator at five sites).
Closed F-05-010 (raw `request.client.host` hashed before
`frontend_error` log emission). Documented F-05-009 (anonymisation as
Art. 17 endpoint per Recital 26 — no code change). Three observations
deferred to operator obligations or future Wave 4b backlog (free-text
card_comment screening, S3 lifecycle policy, Art. 15 self-export portal).

### Wave 5 — Business-logic abuse — PR #120

Closed F-06-001 (per-`sha256(slug|code)` 10/hour rate-limit on resume
code; bounds 9M-entropy enumeration to ~100 years per code in addition
to the existing 30/min per-IP cap). Closed F-06-005 (audio upload abuse:
duration default reads `settings.AUDIO_MAX_DURATION_SECONDS` instead of
hard-coded 600s; sniffed-MIME persisted to S3 instead of
`UploadFile.content_type`). Closed F-06-007 (register always-201
contract closes Wave 2 carry-over F-03-008 backend half — out-of-band
recovery email, identical body shape, IntegrityError race-path folded
into anti-enum response). Verified F-06-002 (draft-responses
session-token bearer model — closed no-code-change), F-06-003
(recruitment capacity gate `SELECT FOR UPDATE`), F-06-006 (submission
idempotency via session_token unique + `SELECT FOR UPDATE`).
Identified F-06-004 (`is_test_run` already dropped — no surface).

### Wave 6 — Supply chain hardening — PR #122

Shipped `.github/workflows/security-scans.yml`: gitleaks, pip-audit,
npm-audit, semgrep, and the custom `lint_logger_urls.py` AST walker on
every PR. SHA-pinned third-party GHA actions
(`astral-sh/setup-uv@v5.4.2`, `lycheeverse/lychee-action`,
`googleapis/release-please-action`); pinning policy commented at the top
of both workflow files. Added `.github/dependabot.yml` covering pip / npm
/ github-actions on weekly cadence. Promoted Wave 1 transitive CVE-fixed
deps (`pygments>=2.20.0`, `python-dotenv>=1.2.2`, `requests>=2.33.0`) to
direct entries in `backend/pyproject.toml`. Closed F-02-006 (backend
Dockerfile non-root `app` user) and F-02-007 (nginx host-header
allowlist; 444 on probe). Operator-scheduled `consumed_email_tokens`
cleanup documented (F-03-003). CSP nonce work deferred to Wave 6b.

### Wave 7 — Deliverables — current PR

Threat model (`08-threat-model.md`): STRIDE per trust boundary across 6
boundaries (~37 entries; 28 mitigated, 6 partial, 1 deferred, 4
operator-side / N/A), top-10 ranked risks, attack tree for the worst-case
"exfiltrate participant data across all projects" scenario. GDPR memo
for self-hosters (`docs/reference/gdpr-self-hosters.md`): 12 sections
covering controller/processor split, lawful basis, data inventory,
retention, subject rights, technical and organisational measures, 8
operator obligations, DPA template, Art. 30 register template. SECURITY.md
extended (this file): disclosure scope, CVE coordination, 16 new
security-relevant practice bullets cross-referencing F-NN-NNN findings.
Action backlog finalised. This executive summary.

## 8. Pointers

- **Threat model:** [`08-threat-model.md`](08-threat-model.md)
- **GDPR memo for self-hosters:** [`../../reference/gdpr-self-hosters.md`](../../reference/gdpr-self-hosters.md)
- **SECURITY.md:** [`/SECURITY.md`](../../../SECURITY.md)
- **Action backlog:** [`99-action-backlog.md`](99-action-backlog.md)
- **Per-wave docs:**
  - [`01-prior-findings-status.md`](01-prior-findings-status.md) — Wave 1 refresh table
  - [`02-scanner-pass.md`](02-scanner-pass.md) — Wave 1 scanner pass
  - [`03-auth-email-flows.md`](03-auth-email-flows.md) — Wave 2
  - [`04-multi-tenant-isolation.md`](04-multi-tenant-isolation.md) — Wave 3
  - [`05-consent-anonymisation.md`](05-consent-anonymisation.md) — Wave 4
  - [`06-business-logic-abuse.md`](06-business-logic-abuse.md) — Wave 5
  - [`07-supply-chain.md`](07-supply-chain.md) — Wave 6
- **Plans:** `docs/superpowers/plans/2026-05-03-audit-wave-{1..7}-*.md`
- **Regression tests:** `backend/tests/security/wave_{1..6}/` (31 files,
  ~150 individual security cases).
- **Exploit scripts:** `.raw/exploits/F-03-005.py`, `F-03-006.py`,
  `F-03-007.py`, `F-03-010.py`.
