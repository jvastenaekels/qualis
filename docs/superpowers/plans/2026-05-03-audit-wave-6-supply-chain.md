# Audit Wave 6 — Supply Chain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operational hardening across dependency pinning, CI gates, Dockerfile / nginx / Procfile hygiene, browser CSP, and the trust boundaries between deploy-time scripts and the running application. Closes the carry-over backlog from Waves 1-2 + Wave 4 + Wave 6 plan-time observations. No mandatory code-reviewer gate (Wave 6 not in spec's gate list).

**Architecture:** Per-axis fixes with regression tests where applicable. Many deliverables are CI workflow additions (gitleaks gate, pip-audit gate, npm-audit gate, semgrep on PR) rather than application-code changes. Each maps to a backlog entry that gets pinned to a closing commit.

**Tech Stack:** GitHub Actions, gitleaks, pip-audit, semgrep; existing Qualis CI at `.github/workflows/ci.yml`.

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-05-03-comprehensive-security-audit-design.md` (Wave 6 section).
- **Carry-overs:** every Wave 6 entry in `99-action-backlog.md` (read it first):
  - F-01-002 partial-fix gap (gitleaks pre-commit hook / CI check).
  - F-01-013 (CSP `style-src 'unsafe-inline'`).
  - F-02-004 (pip 26.0 CVE-2026-3219, no upstream fix as of 2026-05-03).
  - F-02-006 (Dockerfile missing `USER` directive).
  - F-02-007 (nginx forwards unvalidated `$host` header).
  - F-03-003 (`consumed_email_tokens` cleanup not auto-scheduled).
  - NEW (observation) — pip-audit CI gate.
  - NEW (observation) — direct-pin promotion for transitive CVE-fixed deps.
  - NEW (observation) — `request.url`-in-loggers lint rule.
- Wave 6 uses **F-07-NNN** ID space for any *new* findings surfaced; the 9 carry-overs keep their existing IDs.

## Wave 6 scope (from spec)

1. `uv.lock` and `package-lock.json` pin verification.
2. Top-blast-radius deps deep-look (pyjwt, fastapi, sqlalchemy, react, dnd-kit, react-i18next).
3. GitHub Actions third-party action SHA pinning.
4. `Procfile` release-phase + `scripts/migrate.py` trust boundary.
5. Docker / Scalingo build-time env.
6. Dependabot / Renovate config presence.
7. Output: maintenance recommendation block in `99-action-backlog.md`.

## File Structure

**Created:**
- `docs/audits/2026-05-03-comprehensive-security-audit/07-supply-chain.md` (wave doc).
- `.github/workflows/security-scans.yml` (NEW): pip-audit, npm-audit, gitleaks, semgrep on every PR.
- `.github/dependabot.yml` (if missing): Python + npm + GitHub Actions update cadence.
- `backend/scripts/cleanup_consumed_email_tokens.cron.sh` (or Procfile entry): F-03-003 fix.
- `backend/tests/security/wave_6/__init__.py`
- `backend/tests/security/wave_6/test_supply_chain_pinning.py` — assert all third-party GHA actions are SHA-pinned; assert no transitive CVE-fix dep got downgraded.

**Modified:**
- `.github/workflows/ci.yml` — pin third-party actions by SHA where they aren't.
- `backend/Dockerfile` — add `USER` directive (F-02-006).
- `frontend/nginx.conf` — validate `$host` (F-02-007).
- `backend/app/middleware/security.py` — tighten CSP `style-src` (F-01-013).
- `backend/pyproject.toml` — promote pygments / python-dotenv / requests to direct entries with `>=<fix-version>` floors.

**Branch:** `audit/6-supply-chain` off `main`.

---

## Task 1: Scaffold

Wave doc skeleton + tests dir + commit. Same pattern as prior waves.

---

## Task 2: Inventory the deploy / CI surface

**Files:**
- Modify: `07-supply-chain.md` Inventory section.

Capture:
- **CI workflows:** every action used in `.github/workflows/*.yml`. Which are first-party (`actions/checkout`, `actions/setup-python`)? Which are third-party? Are they SHA-pinned or version-tag-pinned?
- **Deploy:** `Procfile` postdeploy + web entries; `scripts/migrate.py` (and the other 4 migrate scripts in `backend/scripts/migrate_*.py`); `backend/Dockerfile` + `frontend/Dockerfile`; nginx config.
- **Dep update bots:** is there a `.github/dependabot.yml`? `renovate.json`? What's the cadence?
- **Top-blast-radius deps:** the 6 the spec calls out plus any others that warrant pinning policy.

Aim for 200-350 lines.

---

## Task 3: Add `.github/workflows/security-scans.yml`

**Closes:** F-01-002 partial-fix (gitleaks), pip-audit CI gate (NEW), npm-audit gate (NEW).

A new GHA workflow running on every PR + push to main:
- gitleaks (using `.gitleaksignore` already in repo)
- `uv run pip-audit` (failing if any vulnerable Python dep)
- `npm audit --audit-level=high` (frontend)
- semgrep with the OWASP Top 10 ruleset (matches Wave 1's scanner battery)

Each scanner step is non-blocking for low/moderate; fails the workflow only on high/critical.

Update `99-action-backlog.md` to mark the three relevant entries `closed in commit <sha>`.

---

## Task 4: Pin third-party GitHub Actions by SHA

**Closes:** Wave 6 plan-time observation (any third-party action not SHA-pinned).

Read `.github/workflows/ci.yml` and `.github/workflows/release-please.yml`. For each `uses: org/repo@version`:
- First-party (`actions/*`, `github/*`) → can stay version-tagged (GitHub-trusted).
- Third-party (any other org) → pin by full SHA, with a comment showing the human-readable tag for review.

Example:
```yaml
- uses: aquasecurity/trivy-action@29c4eddcb3a6e1ac1a7d3ea6e6f2e88e8c5e1e1e # v0.30.0
```

Add a comment block at the top of each workflow explaining the SHA-pinning policy.

If no third-party actions are used: file as observation (`current state already compliant`) and document the policy.

Add a regression test in `backend/tests/security/wave_6/test_supply_chain_pinning.py` that parses the workflows and asserts every non-`actions/*` `uses:` line carries a 40-char SHA.

---

## Task 5: Dockerfile USER + nginx host validation

**Closes:** F-02-006 (Dockerfile USER) + F-02-007 (nginx host).

### F-02-006 fix

Add to `backend/Dockerfile`:
```Dockerfile
RUN groupadd --system app && useradd --system --gid app --home /app --shell /usr/sbin/nologin app
USER app
```

Place after dependency install (so npm/pip can run as root) and before `CMD`.

Same pattern for `frontend/Dockerfile` if it has the same gap (verify; nginx images often run as `nginx` already).

### F-02-007 fix

`frontend/nginx.conf:10` uses raw `$host`. Add an explicit allowlist or use `$server_name` + `Host:` validation:

```nginx
# Reject requests with unexpected Host header (host-header injection mitigation)
if ($host !~ ^(qualis\.example\.org|localhost|127\.0\.0\.1)$) {
    return 444;
}
```

Or use the more idiomatic nginx pattern with `server_name`. Make the allowlist configurable via env / build arg so self-hosters can extend it.

Test in `backend/tests/security/wave_6/test_supply_chain_pinning.py` (or a new file): parse Dockerfile + nginx.conf and assert the new directives are present.

---

## Task 6: CSP style-src tightening (F-01-013)

`backend/app/middleware/security.py` ships a CSP with `style-src 'unsafe-inline'`. Goal: drop `'unsafe-inline'` from `style-src` (XSS hardening).

**Constraints:**
- React/Tailwind may inject inline styles; verify with browser test.
- If inline styles are unavoidable, use a nonce-based CSP: per-request nonce, attached to `<style nonce="…">` and `Content-Security-Policy: style-src 'self' 'nonce-…'`.

Implementation choice (low-risk):
- Audit current usage: `grep -rn 'style=' frontend/src/` — count inline styles. If <50, refactor to Tailwind classes; if many, ship the nonce-based CSP.
- The simpler ship: tighten `style-src 'self'` and discover broken UIs via e2e + manual smoke. If too brittle, keep `'unsafe-inline'` but file as **deferred** with rationale.

Severity: stays minor (XSS defence-in-depth; not an active vulnerability).

Test: backend test pins the CSP header value; e2e regression covers visible UI.

---

## Task 7: Direct-pin promotion + lockfile pin verification

**Closes:** Wave 1 NEW observation (transitive CVE-fixed deps direct-pin promotion).

Edit `backend/pyproject.toml` to add direct entries (not just lockfile bumps):
```python
"pygments>=2.20.0",       # CVE-2026-4539 floor
"python-dotenv>=1.2.2",   # CVE-2026-28684 floor
"requests>=2.33.0",       # CVE-2026-25645 floor
```

Then `cd backend && uv lock` to refresh. The `uv.lock` should be unchanged (already at fix versions per Wave 1) but the pyproject pin prevents future downgrade.

Test: parse `pyproject.toml` and assert each of the three has the expected floor.

---

## Task 8: F-03-003 `consumed_email_tokens` cleanup wiring

`cleanup_consumed_email_tokens.py` exists per Wave 2 but is not scheduled.

Two options:
- **Procfile entry:** add a `worker` line that runs the cleanup script periodically (every 24h).
- **Lazy-cleanup:** call `cleanup_consumed_email_tokens` from `auth.py` once per N consume operations.

Recommended: Procfile entry. Document in deploy guide.

If the deploy target is Scalingo (which Qualis uses per CLAUDE.md), check Scalingo cron / scheduler features; document the recommended cron config.

---

## Task 9: `request.url`-in-loggers lint rule

**Closes:** Wave 2 F-03-013 follow-up observation.

Add a CI lint step that flags any new `logger.\w+\(.*request\.url` outside `_TARGET_LOGGER_NAMES` in `app/middleware/log_scrub.py`.

Implementation: a custom semgrep rule, OR a custom AST-based check in `backend/scripts/lint_logger_urls.py`. Add to the new `security-scans.yml` workflow as a step.

---

## Task 10: Dependabot config

If `.github/dependabot.yml` is absent, add it:
```yaml
version: 2
updates:
  - package-ecosystem: "pip"  # or "uv" if supported
    directory: "/backend"
    schedule:
      interval: "weekly"
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

## Task 11: Update action backlog + final CI + push + PR

- Mark all carry-overs closed (or deferred) with their closing commits.
- Add Summary count table to wave doc.
- `make ci` green.
- Push branch.
- Open PR titled `audit(wave-6): supply chain hardening`.
- **No code-reviewer gate required** (Wave 6 not in spec).

---

## Per-task discipline

Each task ships: static analysis writeup → fix (or defer) → regression test where applicable → wave doc finding → backlog entry → commit.

## Stop criteria

- CSP nonce implementation is non-trivial (>1 day) → defer to Wave 6b backlog; ship just the inventory.
- Scalingo-specific scheduler config requires deployment access → document as operator obligation.

## Out of scope

- Wave 7 deliverables (threat model, SECURITY.md, GDPR memo).
- New non-supply-chain findings (defer to backlog).

---

## Self-Review

Spec coverage check:
- ✅ Lockfile pinning verification → Task 7.
- ✅ Top-blast-radius deps → Task 7 (with direct-pin promotion).
- ✅ GHA SHA pinning → Task 4.
- ✅ Procfile + migrate.py trust boundary → Task 2 (inventory) + Task 8 (operational additions).
- ✅ Docker/Scalingo build-time env → Task 5 + Task 8.
- ✅ Dependabot/Renovate → Task 10.
- ✅ CI gate suggestions → Task 3 (security-scans workflow).

Carry-over coverage:
- ✅ F-01-002 → Task 3.
- ✅ F-01-013 → Task 6.
- ✅ F-02-004 → defer (no upstream fix).
- ✅ F-02-006 → Task 5.
- ✅ F-02-007 → Task 5.
- ✅ F-03-003 → Task 8.
- ✅ pip-audit gate → Task 3.
- ✅ direct-pin promotion → Task 7.
- ✅ request.url lint → Task 9.

ID-space: F-07-NNN reserved for new findings (likely few or none).

## Execution Handoff

Plan complete. Subagent-driven recommended.
