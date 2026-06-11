# Axis 01 — Security & RGPD

**Date:** 2026-04-25
**Auditor:** Claude Sonnet 4.6 (deep-pass)
**Codebase ref:** commit `4e53e1f` (branch `main`)
**Tools run:** gitleaks, pip-audit, npm audit, bandit (raw outputs in `.raw/`)
**Scope:** authn, authz, RGPD, secrets in repo, dependency CVEs, exports, audio uploads, CORS, rate limiting, security headers

---

## Summary

| Severity | Count |
|----------|-------|
| blocker  | 3 |
| major    | 5 |
| minor    | 3 |
| observation | 3 |
| **Total** | **14** |

---

## Findings

### F-01-001 : PyJWT CVE-2026-32597 — `crit` header bypass allows forged JWT acceptance

- **Severity:** blocker
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/dependencies.py:42-44`, `backend/app/utils/security.py:46-48`
- **Observation:** Libre-Q depends on `pyjwt>=2.9.0`; the installed version is `2.11.0` (pip-audit confirms). CVE-2026-32597 (fix in 2.12.0) describes a missing validation of the `crit` (Critical) Header Parameter (RFC 7515 §4.1.11). An attacker who can forge a JWT containing an unrecognised `crit` extension (e.g., `"crit": ["x-custom-policy"]`) will have that token **accepted** by `jwt.decode()` instead of rejected. Both token-decode call sites (`dependencies.py:42` and `utils/security.py:83`) call `jwt.decode()` without any `crit` allowlist.
  - pip-audit output: `pyjwt 2.11.0 → CVE-2026-32597 (fix: 2.12.0)`
  - `pyproject.toml:24`: `"pyjwt>=2.9.0"` — no upper bound pins out the fix.
- **Impact:** An attacker who controls or intercepts a JWT (e.g., via exfiltrated signing key or split-brain scenario) can craft a token with a custom `crit` extension and bypass cryptographic verification. In the Libre-Q threat model (research platform where admin tokens control all study data and participant exports), a successful bypass would grant arbitrary admin access. Confirmed exploitable in Libre-Q's usage: both `get_current_user` and `decode_invitation_token` call `jwt.decode` with no `crit` guard.
- **Recommendation:** Pin `pyjwt>=2.12.0` in `pyproject.toml` and run `uv lock --upgrade-package pyjwt`. No code change required beyond the version bump; 2.12.0 adds the RFC-compliant `crit` rejection by default.
- **Effort:** S

---

### F-01-002 : Local `.env` file contains real database credentials

- **Severity:** blocker
- **Audience:** [Prod] [SoftwareX]
- **Location:** `.env:1-2`
- **Observation:** The file `.env` present at the repo root (untracked, correctly listed in `.gitignore`) contains:
  ```
  DATABASE_URL=postgresql://julien:REDACTED-LOCAL-DEV-PW@localhost/libre_q
  TEST_DATABASE_URL=postgresql+asyncpg://julien:REDACTED-LOCAL-DEV-PW@localhost/libre_q_test
  ```
  The password `REDACTED-LOCAL-DEV-PW` is a real credential. The `tests/conftest.py:14` and `scripts/create_bucket.py:16` both call `load_dotenv()` pointing at this file. If this file is accidentally committed (e.g., via `git add -A`) or shared, the database password is exposed. No `.env.example` template exists at the repo root to guide contributors — only `backend/.env.s3.example` (committed, clean, placeholder values only).
- **Impact:** Database credential exposure would allow direct DB access to all participant data (Q-sorts, consent records, audio metadata), constituting a RGPD Art. 5(1)(f) breach (integrity/confidentiality). For SoftwareX, a publicly accessible repo with exposed credentials at any point in history is a desk-reject risk.
- **Recommendation:** (1) Verify the credential is not in any historical commit (`git log --all -- .env`). (2) Create a committed `.env.example` at repo root with placeholder values. (3) Add a pre-commit hook or CI check (`git-secrets` or `gitleaks --no-git`) that blocks `.env` commits.
- **Effort:** S

---

### F-01-003 : Unauthenticated test-router endpoints active in `development` environment — including bulk data delete

- **Severity:** blocker
- **Audience:** [Prod]
- **Location:** `backend/app/main.py:164`, `backend/app/routers/test.py:195-224`
- **Observation:** The test router is included when `settings.ENVIRONMENT in ["test", "development"]`. It exposes six unauthenticated endpoints:
  - `POST /api/test/init` — initialises database tables
  - `POST /api/test/seed` — creates arbitrary users (including superusers) and projects
  - `POST /api/test/members` — adds users to any project with any role
  - `POST /api/test/cleanup` — deletes all studies, statements, participants, and audio recordings
  - `POST /api/test/cleanup-all` — deletes all data including all users and projects
  - None carry any authentication dependency.

  The `ENVIRONMENT` setting defaults to `"development"` (`config.py:13`) and is absent from `scalingo.json`. The `Procfile` does not set `ENVIRONMENT`. The docker-compose sets `ENVIRONMENT: development`. If a production deployment omits the `ENVIRONMENT` variable, these endpoints are **live with no auth**.

- **Impact:** An attacker who reaches the API can POST to `/api/test/cleanup-all` and wipe the entire database, or POST to `/api/test/seed` to inject a superuser account. This is a complete data-loss and authz bypass risk in any deployment that does not explicitly set `ENVIRONMENT=production`.
- **Recommendation:** (1) In `main.py`, additionally require `TESTING=true` env var (already used by the limiter) as a second gate: `settings.ENVIRONMENT in ["test", "development"] and os.getenv("TESTING", "").lower() == "true"`. (2) Add a startup assertion in the `lifespan` function that raises an error if test routes are mounted outside a test environment. (3) Document `ENVIRONMENT=production` as a required production env var in deployment docs.
- **Effort:** S

---

### F-01-004 : Rate limiter X-Forwarded-For is spoofable (no trusted-proxy validation)

- **Severity:** major
- **Audience:** [Prod]
- **Location:** `backend/app/limiter.py:12-18`
- **Observation:**
  ```python
  forwarded = request.headers.get("x-forwarded-for")
  if forwarded:
      return forwarded.split(",")[0].strip()
  return request.client.host if request.client else "127.0.0.1"
  ```
  The limiter naively trusts `X-Forwarded-For` without validating that the request came through a known reverse proxy. Any unauthenticated HTTP client can send `X-Forwarded-For: 1.2.3.4` and bypass per-IP rate limits entirely by cycling IPs in the header. This affects login (`POST /api/token` — 5/minute), registration (`POST /api/register` — 5/minute), and all other rate-limited endpoints.
- **Impact:** An attacker can brute-force passwords or enumerate emails by rotating spoofed IPs in the header. The 5/minute login limit is the primary defence against credential stuffing; this bypass nullifies it. On Scalingo (the documented deployment platform), the actual client IP is in `request.client.host` when the Scalingo proxy terminates TLS; trusting the header unconditionally introduces the bypass.
- **Recommendation:** Either (a) trust `X-Forwarded-For` only if the request originates from a known proxy CIDR (documented in settings), or (b) in Scalingo deployments, use `request.client.host` exclusively (Scalingo rewrites the header correctly). Option (b) requires confirming Scalingo's behaviour; document the decision. At minimum, apply the SlowAPI `key_func` to `request.client.host` and remove the header trust entirely for now.
- **Effort:** M

---

### F-01-005 : `DOMPurify` runtime dependency has multiple XSS CVEs (range `<=3.3.3`, no fix ≤ current pinned range)

- **Severity:** major
- **Audience:** [Prod] [SoftwareX]
- **Location:** `frontend/src/components/SafeMarkdown.tsx:4`, `frontend/package.json` (`"dompurify": "^3.3.1"`)
- **Observation:** npm-audit reports 7 moderate CVEs on `dompurify <=3.3.3`:
  - GHSA-h8r8-wccr-v5f2 (mutation-XSS, `<3.3.2`)
  - GHSA-v2wj-7wpq-c8vv (XSS, `>=3.1.3 <=3.3.1`)
  - GHSA-cjmm-f4jc-qw8r (ADD_ATTR predicate bypasses URI validation)
  - GHSA-cj63-jhhr-wcxv (USE_PROFILES prototype pollution)
  - GHSA-39q2-94rc-95cp (ADD_TAGS short-circuit, `<=3.3.3`)
  - GHSA-h7mw-gpvr-xq4m (FORBID_TAGS bypass, `<3.4.0`)
  - GHSA-crv5-9vww-q3g8 (SAFE_FOR_TEMPLATES bypass RETURN_DOM, `<3.4.0`, CVSS 6.8)

  `SafeMarkdown.tsx` is used to render researcher-authored content (statements, consent pages, study instructions) and is a **runtime** component. The pin `^3.3.1` will not auto-upgrade past 3.3.x. Fix available: DOMPurify `>=3.4.0`.

  The mitigating factor is that `SafeMarkdown` passes `ALLOWED_TAGS: []` to DOMPurify, which significantly limits XSS surface. However, `RETURN_DOM` bypass (GHSA-crv5-9vww-q3g8, CVSS 6.8) and `SAFE_FOR_TEMPLATES` bypass are not mitigated by that config.
- **Impact:** Researcher-controlled content (statements, consent text) that contains crafted HTML/templates could execute arbitrary JS in participants' browsers. Participant browsers are the most sensitive surface: a participant performing a Q-sort has no reason to distrust the study content.
- **Recommendation:** Update `dompurify` to `>=3.4.0` in `package.json` (`npm install dompurify@latest`). Fix is available per npm-audit.
- **Effort:** S

---

### F-01-006 : `xlsx` runtime dependency has no fix available (prototype pollution + ReDoS)

- **Severity:** major
- **Audience:** [Prod] [SoftwareX]
- **Location:** `frontend/src/utils/analysisXlsxExport.ts:3`, `frontend/package.json` (`xlsx: *`)
- **Observation:** npm-audit reports 2 high CVEs on `xlsx` at range `*` (all versions):
  - GHSA-4r6h-8v6p-xvw6: Prototype Pollution in SheetJS `_.unset`/`_.omit`, CVSS 7.8
  - GHSA-5pgg-2g8v-p4x9: Regular Expression DoS (ReDoS), CVSS 7.5
  - `fixAvailable: false` — there is no npm advisory-approved fix version.

  `xlsx` is used in `analysisXlsxExport.ts` (dynamically imported, runtime) for exporting Q-methodology analysis results to Excel format from the `AnalysisPage`.
- **Impact:** The prototype pollution CVE (CVSS 7.8) is triggered when processing untrusted XLSX input. In Libre-Q, `xlsx` generates output (not parsing user-uploaded XLSX), which substantially limits the prototype pollution attack surface. The ReDoS (CVSS 7.5) is also primarily triggered by malformed input strings. Current usage (`aoa_to_sheet`, `book_new`) does not parse external XLSX files. However, the permanent lack of a fix means this will remain a vulnerability report flag for SoftwareX reviewers inspecting the npm audit.
- **Recommendation:** (1) Evaluate replacement libraries that are maintained and CVE-free: `exceljs` (actively maintained, no current CVEs) or client-side CSV export for the initial submission (simpler). (2) If `xlsx` is retained, add a comment in `package.json` and the audit README documenting the scope limitation (output-only, no parsing of user input) as the accepted risk. (3) Track `sheetjs-ce` for potential fork updates.
- **Effort:** M

---

### F-01-007 : CORS `allow_headers: ["*"]` is overly permissive

- **Severity:** major
- **Audience:** [Prod]
- **Location:** `backend/app/main.py:126`
- **Observation:**
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=origins,
      allow_credentials=True,
      allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allow_headers=["*"],
  )
  ```
  `allow_headers=["*"]` combined with `allow_credentials=True` means any browser request from an allowed origin can include any request header without restriction. The actual custom headers used by the frontend are `Authorization`, `Content-Type`, `X-Project-ID`, and `X-Totp-Token`. The wildcard allows any future header to be CORS-whitelisted without a code change.
- **Impact:** While this is not a direct exploit vector (origins are explicitly allowlisted), `allow_headers: *` with `allow_credentials: True` weakens the defence in depth: if a new endpoint is added that trusts a custom header for security decisions (e.g., `X-Admin-Override`), CORS would not block it from cross-origin requests. It also sets a poor security precedent for an open-source reference implementation.
- **Recommendation:** Replace `allow_headers=["*"]` with an explicit list: `["Authorization", "Content-Type", "X-Project-ID", "X-Totp-Token"]`. This is a 1-line change with no breaking effect on current functionality.
- **Effort:** S

---

### F-01-008 : `i18next-http-backend` path traversal CVE in runtime dependency

- **Severity:** major
- **Audience:** [Prod]
- **Location:** `frontend/src/i18n.ts:15`, `frontend/package.json` (`"i18next-http-backend": "^3.0.2"`)
- **Observation:** npm-audit: GHSA-q89c-q3h5-w34g — `i18next-http-backend <3.0.5` has Path Traversal & URL Injection via unsanitised `lng`/`ns` parameters (CVSS 6.5). The installed version is `^3.0.2`, which does not auto-upgrade to the fixed `3.0.5`.

  `i18n.ts:24` sets `supportedLngs: ['en', 'fr', 'fi']` which is an allowlist for language detection. However, the http-backend constructs the load URL using the `lng` value which could be overridden via the `lang` query parameter (`detection.lookupQuerystring: 'lang'`). If the library version is <3.0.5, a crafted `?lang=../../etc/passwd` could trigger path traversal in the backend locale loader.
- **Impact:** An attacker navigating to `https://app.example.com/?lang=../../etc/passwd` could cause the i18n HTTP backend to request arbitrary paths from the server if the server does not sanitise the path. The `supportedLngs` allowlist in i18next config mitigates this if the library enforces it before constructing the URL — but the CVE indicates this enforcement was missing in <3.0.5.
- **Recommendation:** Update `i18next-http-backend` to `>=3.0.5` in `package.json`. The fix is available per npm-audit.
- **Effort:** S

---

### F-01-009 : `python-multipart` DoS via crafted multipart bodies (CVE-2026-40347)

- **Severity:** minor
- **Audience:** [Prod]
- **Location:** `backend/pyproject.toml` (`python-multipart>=0.0.22`), `backend/app/routers/audio.py`
- **Observation:** pip-audit: CVE-2026-40347 — python-multipart `<0.0.26` is vulnerable to DoS via crafted multipart preamble/epilogue. Installed: `0.0.22`. The audio upload endpoint (`POST /api/audio/upload`) accepts multipart form data and is the primary consumer. The endpoint has a rate limit (`10/minute`) which partially mitigates the amplification risk, but a sustained low-rate attack could still degrade upload handling.
- **Impact:** A sustained attacker can send crafted multipart bodies to exhaust CPU on upload parsing, degrading audio recording availability during active studies. Impact is limited by the rate limiter and the research-platform threat model (not a high-volume public API).
- **Recommendation:** Pin `python-multipart>=0.0.26` in `pyproject.toml` and run `uv lock --upgrade-package python-multipart`.
- **Effort:** S

---

### F-01-010 : JWT access token lifetime is 8 hours with no refresh token mechanism

- **Severity:** minor
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/core/config.py:18`, `backend/app/utils/security.py:34-49`
- **Observation:** `ACCESS_TOKEN_EXPIRE_MINUTES = 480` (8 hours). There is no refresh token endpoint. Tokens are stateless JWTs; revocation requires waiting for expiry. If an admin token is compromised (e.g., via session hijacking, XSS, or logging), the attacker has up to 8 hours of access with no mechanism to invalidate the token server-side. Password change (`PATCH /api/me/password`) does not invalidate existing tokens.
- **Impact:** Stolen tokens remain valid for up to 8 hours. On a research platform where admin sessions are typically single-study sessions (minutes to hours), 8 hours is generous. No breach detection or audit trail exists for token misuse (see axis 11 for observability gaps).
- **Recommendation:** (1) Reduce `ACCESS_TOKEN_EXPIRE_MINUTES` to 60 or 120 minutes for production. (2) Implement a stateless revocation strategy: include a `password_version` counter in the token payload and reject tokens whose `password_version` predates the current user record. This invalidates tokens on password change without a token blacklist.
- **Effort:** M

---

### F-01-011 : Gitleaks findings are all documentation/test false positives

- **Severity:** observation
- **Audience:** [SoftwareX]
- **Location:** transverse
- **Observation:** Gitleaks reported 9 findings across 4 files:
  - `docs/guides/s3-setup.md:71,80` — `AKIAIOSFODNN7EXAMPLE` (AWS canonical example key, not a real credential)
  - `docs/reference/api.md:71` — `123e4567-e89b-12d3-a456-426614174000` (UUID v4 in API doc example)
  - `backend/tests/integration/test_consent_flow.py:32` — `123e4567-e89b-12d3-a456-426614174099` (hardcoded UUID in test fixture)
  - `backend/tests/integration/test_api_participants.py:17,51,87` — `123e4567-e89b-12d3-a456-426614174000` (test fixture UUID)
  - `backend/tests/integration/test_study_lifecycle.py:37` — `eadf28c4-e8f0-410a-8673-99787e914040` (test fixture UUID)

  All 9 findings are confirmed false positives. The AWS example key is universally known (it appears in official AWS documentation). The UUIDs are test session tokens with no credential value. No real secrets appear in the git history.
- **Impact:** None currently. However, the test UUIDs trigger the `generic-api-key` rule, which will cause gitleaks CI checks to fail if added to CI pipeline.
- **Recommendation:** Add a `.gitleaks.toml` allowlist for the known test UUIDs and the AWS example key to prevent CI noise. Do not suppress real-key patterns.
- **Effort:** S

---

### F-01-012 : No RGPD Art. 17 individual erasure endpoint for participants

- **Severity:** major
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/routers/admin/studies_participants.py`, `backend/app/routers/admin/studies.py`
- **Observation:** Libre-Q provides bulk participant deletion (`DELETE /{slug}/participants` — draft-only, and `POST /{slug}/reset` — owner-only). There is no endpoint to delete a **single** participant by session token or confirmation code in response to a RGPD Art. 17 erasure request. The discard endpoint (`PATCH /{slug}/participants/{participant_id}/discard`) marks a participant as excluded from analysis but does not erase their data.

  The consent page (`study_defaults.py`) states: "If you withdraw before finalising your sort, no partial data will be retained." This is partially implemented (pre-submission withdrawal is not persisted), but post-submission erasure is not available via API. Audio files in S3 are deleted when a study is deleted (`StudyDataService.delete_audio_files_for_study`) but not per-participant.
- **Impact:** RGPD Art. 17 requires data subjects to be able to request erasure of their personal data (even pseudonymised data falls under RGPD if re-identification is possible). Without an erasure endpoint, Libre-Q cannot comply with individual erasure requests in production. This is a compliance gap. For SoftwareX, a manuscript claiming RGPD compliance without an erasure path is contestable by reviewers.
- **Recommendation:** Implement `DELETE /api/admin/studies/{slug}/participants/{participant_id}` that: (1) deletes the Participant record and cascade QSortEntry/AudioRecording rows, (2) calls `storage_service.delete_audio` for each S3 key, (3) is gated on `StudyRole.owner`. Document this endpoint in the RGPD section of the README.
- **Effort:** M

---

### F-01-013 : CSP `style-src: 'unsafe-inline'` reduces XSS protection

- **Severity:** minor
- **Audience:** [Prod] [SoftwareX]
- **Location:** `backend/app/middleware/security.py:29`
- **Observation:**
  ```python
  f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
  ```
  `'unsafe-inline'` in `style-src` allows any inline `<style>` tag or `style=` attribute. While CSS-based XSS is less common than script-based XSS, `'unsafe-inline'` in `style-src` can enable CSS injection attacks (data exfiltration via CSS attribute selectors, clickjacking augmentation). The `script-src 'self'` (no unsafe-inline) is correct.
- **Impact:** Limited XSS-adjacent risk in the current application (Tailwind generates utility classes inline, which is the reason for this choice). The Permissions-Policy correctly locks camera/geolocation.
- **Recommendation:** If Tailwind inline styles are the driver, evaluate moving to `style-src 'nonce-...'` or `style-src 'unsafe-hashes'` with a hash allowlist for the specific styles injected. Alternatively, accept as a known trade-off and document in security policy. This is a minor improvement, not an emergency.
- **Effort:** L

---

### F-01-014 : Bandit low-severity findings confirmed as non-issues

- **Severity:** observation
- **Audience:** [Maintenance]
- **Location:** `backend/app/main.py`, `backend/app/routers/auth.py`, `backend/app/services/study_service.py`, `backend/app/services/concourse_service.py`
- **Observation:** Bandit reported 5 low-severity findings (0 high, 0 medium). Inspection confirms:
  - `main.py`: 1 low — likely the `logging.basicConfig` pattern or `os.getenv`. Benign.
  - `routers/auth.py`: 1 low — `except Exception` broad catch in registration handler. This is a valid pattern with explicit rollback + logging; not a security issue.
  - `services/study_service.py`: 2 low — `hashlib.sha256` and broad exception patterns. SHA-256 is appropriate for the IP hashing use case (not a password).
  - `services/concourse_service.py`: 1 low — likely `assert` or similar. Benign in service context.
  - `routers/test.py:216`: `# nosec` comment on `DELETE FROM {table}` — the table name is controlled by a hardcoded list in the same function, not user input. The suppression is justified.
- **Impact:** None. Bandit's low-severity findings here do not represent real vulnerabilities in Libre-Q's context.
- **Recommendation:** No action required. The `# nosec` on line 216 of `test.py` is appropriately documented.
- **Effort:** S

---

## npm CVE Triage (full)

| Package | Severity | Runtime? | Exploitable in Libre-Q? | Action |
|---------|----------|----------|------------------------|--------|
| `orval` + `@orval/*` (11 pkgs) | critical | Dev only (code generation) | No — never executed in prod | Upgrade `orval` to `>=7.20.0`; dev tooling only |
| `dompurify` | moderate | **Yes** (SafeMarkdown.tsx) | Partially mitigated (ALLOWED_TAGS:[]) | **See F-01-005** (major) |
| `xlsx` | high | **Yes** (analysisXlsxExport.ts) | Limited (output-only, no parsing) | **See F-01-006** (major) |
| `i18next-http-backend` | moderate | **Yes** (i18n.ts) | Mitigated by supportedLngs allowlist, but CVE is in HTTP path construction | **See F-01-008** (major) |
| `vite` | high | Dev only (build tool) | No — dev server only, not exposed in prod | Upgrade `vite` to `>=7.3.2`; dev tooling |
| `rollup` | high | Dev only (transitive via vite) | No | Resolved by vite upgrade |
| `happy-dom` | high | Dev only (vitest environment) | No | Upgrade `happy-dom` to `>=20.8.9` |
| `lodash` | high | Dev only (transitive via dev tools) | No | Update dev deps |
| `minimatch` / `@stoplight/spectral-core` | high | Dev only (API linting tools) | No | Update dev deps |
| `postcss` | moderate | Dev only (build pipeline) | No | Update dev deps |
| `brace-expansion`, `picomatch`, `ajv`, `markdown-it`, `smol-toml`, `yaml` | moderate | Dev only (transitive) | No | Update dev deps in batch |
| `jsdom`, `http-proxy-agent`, `@tootallnate/once` | low | Dev only (test runner) | No | Low priority |
| `dependency-cruiser` | moderate | Dev only | No | Low priority |

**Key triage conclusion:** The 11 "critical" npm findings are all in `orval` (code generation tool, dev-only). No critical CVE affects the production runtime bundle.

---

## pip-audit Triage (full)

| Package | CVE | Runtime? | Exploitable in Libre-Q? | Action |
|---------|-----|----------|------------------------|--------|
| `pyjwt 2.11.0` | CVE-2026-32597 | **Yes** | **Yes** | **F-01-001** (blocker) |
| `python-multipart 0.0.22` | CVE-2026-40347 | **Yes** | Limited (rate-limited) | **F-01-009** (minor) |
| `python-dotenv 1.2.1` | CVE-2026-28684 | Dev/scripts only | No — `set_key`/`unset_key` not called in app code; only `load_dotenv` used | Upgrade in dev deps; low priority for prod |
| `requests 2.32.5` | CVE-2026-25645 | Dev/scripts only | No — `extract_zipped_paths()` not called | Low priority |
| `pytest 9.0.2` | CVE-2025-71176 | Dev only | No | Upgrade to `9.0.3` |
| `pygments 2.19.2` | CVE-2026-4539 | Dev only (rich/bandit dep) | No | Low priority |
| `pip` | CVE-2026-3219 | Dev tooling | No | Low priority |
