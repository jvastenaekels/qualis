# Scanner Pass — 2026-05-03

**Tools:** gitleaks 8.18.4, pip-audit 2.10.0, bandit 1.9.3, npm 11.12.1, semgrep 1.161.0
**Baseline diff against:** `docs/audits/2026-04-25-deep-audit/.raw/` (the prior raw JSONs are
gitignored; only the index `README.md` is committed, so the diff is reconstructed from
that index plus `01-prior-findings-status.md`).
**Raw outputs (this pass):** `docs/audits/2026-05-03-comprehensive-security-audit/.raw/scanners/wave-1/`

## Summary

| Severity | New | Carried | Resolved since prior |
|----------|-----|---------|----------------------|
| blocker | 0 | 0 | 3 |
| major | 0 | 0 | 6 |
| minor | 6 | 2 | 1 |
| observation | 3 | 1 | 4 |
| **Total** | **9** | **3** | **14** |

"Carried" counts findings still-open or partially-open per `01-prior-findings-status.md`
(F-01-010 minor, F-01-013 minor, F-01-002 partial-fix gap observation). "Resolved since
prior" sums the 11 fixed entries from the prior audit (`01-prior-findings-status.md`)
plus the 3 prior pip-audit / bandit lines that no longer appear in this pass and were
not formal F-01 findings (pyjwt, pytest, python-multipart already covered).

## New findings

### F-02-001 — `pygments 2.19.2` CVE-2026-4539

- **Severity:** minor
- **Audience:** [OSS] [SoftwareX]
- **Location:** dependency `pygments==2.19.2` (transitive via `rich` / `bandit` dev tooling); declared in `backend/uv.lock`
- **Tool:** pip-audit 2.10.0
- **Observation:** pip-audit reports CVE-2026-4539 against `pygments<2.20.0`. Fix version `2.20.0` is available. `pygments` is used at runtime only by developer-facing tooling (CLI traceback rendering via `rich`, code highlighting in `bandit` reports). It is not imported by `app/`. A code-search (`grep -r "import pygments\|from pygments" backend/app`) confirms zero references in production code.
- **Impact:** Defence-in-depth only. The CVE class is a parser issue triggered when highlighting attacker-controlled source; no such path exists in the Qualis runtime. A developer who pipes untrusted input to a `pygments`-using REPL would be theoretically affected.
- **Recommendation:** Bump `pygments` to `>=2.20.0` via `uv lock --upgrade-package pygments`.
- **Effort:** S
- **Disposition:** fixed in this PR (Wave 1 Task 7)

---

### F-02-002 — `python-dotenv 1.2.1` CVE-2026-28684

- **Severity:** minor
- **Audience:** [OSS] [SoftwareX]
- **Location:** dependency `python-dotenv==1.2.1`; consumers `backend/tests/conftest.py:14`, `backend/scripts/create_bucket.py:16`
- **Tool:** pip-audit 2.10.0
- **Observation:** pip-audit reports CVE-2026-28684 against `python-dotenv<1.2.2` (symlink-following / file-write issue affecting `set_key` and `unset_key`). Fix version `1.2.2` is available. Qualis only calls `load_dotenv()` (read-only) at the two sites above; a code-search for `set_key\|unset_key` in `backend/` returns zero results. The vulnerable functions are not reachable.
- **Impact:** Defence-in-depth only. Not exploitable in Qualis's usage; covered by the prior audit's triage table for the same package (`F-01` triage section, "Dev/scripts only — `set_key`/`unset_key` not called"). The version bump keeps the SoftwareX submission free of unfixed advisories.
- **Recommendation:** Bump `python-dotenv` to `>=1.2.2` in `backend/pyproject.toml` and re-lock.
- **Effort:** S
- **Disposition:** fixed in this PR (Wave 1 Task 7)

---

### F-02-003 — `requests 2.32.5` CVE-2026-25645

- **Severity:** minor
- **Audience:** [OSS] [SoftwareX]
- **Location:** dependency `requests==2.32.5` (transitive); no direct import in `app/` (verified by `grep -r "import requests\|from requests" backend/app` → zero hits)
- **Tool:** pip-audit 2.10.0
- **Observation:** pip-audit reports CVE-2026-25645 against `requests<2.33.0`. Fix version `2.33.0` is available. Qualis production code uses `httpx` for outbound HTTP; `requests` enters the dependency tree only via dev / script tooling (e.g., `pip-audit` itself, `cffconvert`). The CVE concerns `extract_zipped_paths`, which is not called by Qualis or its direct dev tooling.
- **Impact:** Defence-in-depth only. The same triage applied in the prior audit (`F-01` triage, "Dev/scripts only — `extract_zipped_paths()` not called"). Bump keeps the audit clean.
- **Recommendation:** Bump `requests` to `>=2.33.0` via `uv lock --upgrade-package requests`.
- **Effort:** S
- **Disposition:** fixed in this PR (Wave 1 Task 7)

---

### F-02-004 — `pip 26.0` CVE-2026-3219 (no fix yet)

- **Severity:** observation
- **Audience:** [OSS] [SoftwareX]
- **Location:** developer / build environment; `pip==26.0` reported by pip-audit against the active venv
- **Tool:** pip-audit 2.10.0
- **Observation:** pip-audit reports CVE-2026-3219 against `pip<=26.0`. As of 2026-05-03 there is no upstream fix release; the advisory is "no known fix" per pip-audit (`fix_versions: []`). `pip` is not a Qualis runtime dependency — `uv` manages the runtime venv and Scalingo's deploy uses `uv sync` from the lockfile, not `pip install`. The CVE only matters to a developer running `pip` against an attacker-controlled package index.
- **Impact:** None in the Qualis threat model. Operators using Scalingo / `uv` are unaffected. Self-hosters who rebuild from source via plain `pip install -e .` would be exposed to the underlying CVE only if they fetch from a malicious index — no Qualis-specific amplification.
- **Recommendation:** Track upstream pip release and bump when a fix lands. No code change in this PR.
- **Effort:** S (when a fix is published)
- **Disposition:** deferred to backlog (no fix available; reassess each wave)

---

### F-02-005 — `xlsx` runtime CVEs (no fix available)

- **Severity:** minor
- **Audience:** [Prod] [Self-hoster]
- **Location:** `frontend/package.json` (`xlsx: *`), consumer `frontend/src/utils/analysisXlsxExport.ts:3`
- **Tool:** npm 11.12.1 (audit)
- **Observation:** npm audit reports `xlsx` (range `*`) with two high-severity advisories: GHSA-4r6h-8v6p-xvw6 (Prototype Pollution in `_.unset` / `_.omit`, CVSS 7.8) and GHSA-5pgg-2g8v-p4x9 (ReDoS, CVSS 7.5). `fixAvailable: false`. Both require attacker-controlled XLSX **input** to be parsed; Qualis only **writes** XLSX files (`analysisXlsxExport.ts` calls `aoa_to_sheet` / `book_new` / `writeFile`). The test suite does parse XLSX, but only files it has just written. Acceptance is documented in `SECURITY.md:25-29` with a mitigation plan if reachability changes (switch to ExcelJS or vendor SheetJS Pro).
- **Impact:** No reachable exploit path in the current codebase. SoftwareX reviewers, JOSS reviewers, and self-hosters running `npm audit` will see the high-severity flag and need to consult `SECURITY.md` for the rationale. Filing it here gives the audit trail visibility even though no action is taken.
- **Recommendation:** No-op for this PR. Re-evaluate at any change to `analysisXlsxExport.ts` that adds XLSX **parsing**. Watch for `xlsx` upstream releases or a SheetJS Community fork that publishes a CVE-fix version.
- **Effort:** L (only if a parsing path is ever added; switch to ExcelJS)
- **Disposition:** deferred to backlog (accepted risk per SECURITY.md:25-29)

---

### F-02-006 — Dockerfile missing `USER` directive

- **Severity:** minor
- **Audience:** [Prod] [Self-hoster]
- **Location:** `backend/Dockerfile:16` (last instruction; `CMD` runs as `root` because no `USER` is set)
- **Tool:** semgrep 1.161.0 (`dockerfile.security.missing-user.missing-user`)
- **Observation:** The backend Dockerfile does not declare a `USER` instruction; the `uvicorn` process therefore runs as `root` inside the container. If a request-handler RCE is found, the attacker has root within the container, which expands the radius of any container-escape primitive (e.g., a kernel CVE on the host). Scalingo (the documented prod platform) does not use this Dockerfile — it builds with the buildpack — so the impact is limited to self-hosters and any local Docker-based dev/CI.
- **Impact:** Defence-in-depth weakening for self-hosted Docker deploys. Not exploitable on its own.
- **Recommendation:** Add `RUN groupadd --system --gid 1001 qualis && useradd --system --uid 1001 --gid qualis qualis` and `USER qualis` before `CMD`. Verify the bind mount, uv cache, and any writable paths still work.
- **Effort:** S
- **Disposition:** deferred to Wave 6 (build / deploy hygiene cluster)

---

### F-02-007 — nginx uses `$host` from request header without validation

- **Severity:** minor
- **Audience:** [Prod] [Self-hoster]
- **Location:** `frontend/nginx.conf:10` (`proxy_set_header Host $host;`)
- **Tool:** semgrep 1.161.0 (`generic.nginx.security.request-host-used.request-host-used`)
- **Observation:** `$host` is derived from the client `Host:` header (with fallback to `server_name`). Forwarding it unchecked to the backend means any backend code that trusts `Host` (e.g., for absolute-URL construction in emails or password-reset links) inherits the attacker's chosen value. Semgrep flags this as a host-header-injection vector. In Qualis's own backend code, password-reset and invitation emails build URLs from `settings.FRONTEND_URL` (a configured origin), not from request headers — verified by `grep -r "request.headers.get..host\|request.url.netloc" backend/app` (zero hits in URL-construction paths). The nginx `server_name` directive is also unset, so `$host` falls back to whatever the client sends.
- **Impact:** No direct exploit today (backend does not trust `Host` for security decisions). Becomes an issue if a future endpoint constructs URLs from the request host (cache-poisoning, password-reset URL spoofing).
- **Recommendation:** Either (a) set `proxy_set_header Host $proxy_host;` to forward the configured upstream name, or (b) add `server_name app.example.org;` and use `proxy_set_header Host $server_name;` so the backend always sees the canonical host. Document the chosen pattern in `SECURITY.md`.
- **Effort:** S
- **Disposition:** deferred to Wave 6 (build / deploy hygiene cluster)

---

### F-02-008 — `sqlalchemy.text(f"…")` interpolation in test router

- **Severity:** observation
- **Audience:** [OSS]
- **Location:** `backend/app/routers/test.py:222`, `backend/app/routers/test.py:258`
- **Tool:** semgrep 1.161.0 (`python.sqlalchemy.security.audit.avoid-sqlalchemy-text`)
- **Observation:** The test router runs `await db.execute(text(f"DELETE FROM {table}"))  # nosec` over a hardcoded list of table names (`tables_to_clean`, lines 207-219 / 240-256). The semgrep rule fires on any f-string into `text()`; a manual review confirms the only interpolated values are static literals. The router is also gated behind `ENVIRONMENT in ("test", "development")` (now fail-closed-to-production per F-01-003), which means the endpoint is not mounted in production at all.
- **Impact:** None. Two layers of defence: (a) hardcoded literals, no user input; (b) router not mounted in production.
- **Recommendation:** Optionally replace the f-strings with `text("DELETE FROM " + table)` or move to ORM-level deletes (`await db.execute(delete(Model))`) to silence the scanner. Pure cleanup, not security work.
- **Effort:** S
- **Disposition:** deferred to backlog (false positive at the AST level; cleanup-only)

---

### F-02-009 — `sqlalchemy.text(f"…")` in operational migration scripts

- **Severity:** observation
- **Audience:** [OSS] [Self-hoster]
- **Location:** `backend/scripts/migrate_projects_config.py:46` (interpolates `col_type` from `{"JSON", "JSONB"}`); `backend/scripts/validate_migration.py:25,75` (interpolates `role` from a hardcoded list `["admin", "researcher", "member", "viewer", "owner"]`)
- **Tool:** semgrep 1.161.0 (`python.sqlalchemy.security.audit.avoid-sqlalchemy-text`)
- **Observation:** Same pattern as F-02-008. All interpolated values are local literals chosen from fixed sets that never see user input. The scripts are run manually by a maintainer at upgrade time, not exposed via any HTTP endpoint.
- **Impact:** None. No SQL-injection path because there is no untrusted input.
- **Recommendation:** Replace f-strings with parameterised queries or `inspect()`-based introspection on next maintenance pass; not blocking. Adding a `# nosec` with a justification comment on each line is the minimum-friction fix.
- **Effort:** S
- **Disposition:** deferred to backlog (false positive; scripts run manually with no untrusted input)

---

## Resolved since prior

The following items appeared in the 2026-04-25 raw outputs but are absent from the
2026-05-03 pass. Each fix is anchored to the commit listed in
`01-prior-findings-status.md`.

- **PyJWT CVE-2026-32597** (F-01-001, blocker) — resolved by commit `9e0c790c`; `pyjwt>=2.12.0` pinned in `backend/pyproject.toml`. No longer reported by pip-audit.
- **`python-multipart` CVE-2026-40347** (F-01-009, minor) — resolved by commit `728860de`; `python-multipart>=0.0.26`. No longer reported.
- **`pytest` CVE-2025-71176** (raw-only, dev-only) — no longer reported by pip-audit; the dev dependency was bumped during a routine `uv sync` between the two passes (no dedicated F-01 entry; tracked in the prior pip-audit triage table).
- **`.env` containing real DB credentials** (F-01-002, blocker) — resolved by commit `8dbe635f` (`.env.example` shipped, history verified clean). Partial-fix gap (gitleaks pre-commit hook) carried to Wave 6.
- **Test router unauthenticated in `development` default** (F-01-003, blocker) — resolved by commit `c7121213` (`ENVIRONMENT` defaults to `production`).
- **Rate-limiter `X-Forwarded-For` spoofing** (F-01-004, major) — resolved by commit `c943cc89` (`TRUSTED_PROXIES` allowlist).
- **DOMPurify XSS CVEs** (F-01-005, major) — resolved by commit `c943cc89` (`dompurify ^3.4.1`). No longer in npm-audit.
- **CORS `allow_headers: ["*"]`** (F-01-007, major) — resolved by commit `c943cc89` (explicit allow-list).
- **`i18next-http-backend` path traversal** (F-01-008, major) — resolved by commit `c943cc89` (`^3.0.6`). No longer in npm-audit.
- **`xlsx` accepted-risk documentation** (F-01-006, major) — resolved by commit `c943cc89` (`SECURITY.md:25-29`); the underlying CVEs are still present and re-tracked here as F-02-005 for visibility (severity reduced to minor reflecting the documented non-reachability).
- **No RGPD Art. 17 erasure endpoint** (F-01-012, major) — resolved by commit `8678466e` (`DELETE /api/admin/studies/{slug}/participants/{participant_id}/personal-data`).
- **Gitleaks 9 doc/test false positives** (F-01-011, observation) — resolved by commit `894d8a0e` plus extension in commit `bb3413d3` (`.gitleaksignore` covers AWS canonical sample key + RFC-9562 sample UUIDs).
- **Bandit `auth.py`/`main.py`/`study_service.py`/`concourse_service.py` low-sev triage** (F-01-014, observation) — no longer reported at the configured threshold (only the two B105 false positives in `security.py` remain, listed below).
- **npm dev-dependency CVE wave** (orval critical x11, vite high, happy-dom, lodash, postcss, etc.) — all resolved between passes via routine `npm update` and pinned bumps tied to commit `c943cc89`. Current `npm-audit.json` is empty except for the `xlsx` accepted-risk row.

## False positives — not filed

For visibility (these were reviewed and intentionally not given an `F-02-NNN` ID):

- `bandit B105 backend/app/utils/security.py:16,17` — string literals `'qualis'` and `'auth-email'` are JWT token-type constants used as `aud`/payload type discriminators (`SIGNUP_TOKEN_AUDIENCE`, `AUTH_EMAIL_TOKEN_TYPE`), not passwords. Confirmed false positive; bandit's `B105` is a literal-string heuristic with no semantic awareness.
- `gitleaks` — all 14 hits in this pass are documentation/test false positives (canonical AWS sample key `AKIAIOSFODNN7EXAMPLE` in `docs/guides/s3-setup.md` and `docs/reference/api.md`; RFC-9562 sample UUIDs `123e4567-e89b-12d3-a456-426614174000` and `eadf28c4-…` in `backend/tests/integration/`). Triaged in Task 4; allowlisted via `.gitleaksignore` (final-pass `gitleaks-final.json` is clean). See the file's inline rationales for the full list.
