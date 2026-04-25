# Wave 1 Raw Outputs — Index

**Captured:** 2026-04-25, ~30 min wall clock
**Throwaway tools used:** `/tmp/audit-venv/`, `/tmp/audit-bin/`, `/tmp/audit-node/` (will be cleaned up at end of audit)

The actual files are gitignored (`docs/audits/*/.raw/`). This README is committed so the audit is auditable.

## Files captured

| File | Tool | Consumed by axis | Notes |
|------|------|-------------------|-------|
| `gitleaks-report.json` | gitleaks 8.18.4 | 01 security | 9 leaks found (likely false positives in docs/tests, needs triage) |
| `bandit-report.json` | bandit (existing) | 01 security | 0 high, 0 medium, 5 low |
| `npm-audit.json` | npm | 01 security | **11 critical + 8 high + 9 moderate + 3 low** |
| `pip-audit.json` | pip-audit (existing) | 01 security | **7 vulns: pyjwt (CVE-2026-32597 = JWS bypass), python-multipart, python-dotenv, requests, pygments, pip, pytest** |
| `radon-cc.json` | radon (existing) | 02 code-quality | Complexity per function |
| `madge-circular.json` | madge 8.0.0 | 03 architecture | **0 frontend circular deps** ✓ |
| `pydeps-graph.svg` | pydeps 3.0.6 | 03 architecture | Backend dep graph (may need graphviz to render) |
| `knip-report.json` | knip 6.6.3 | 02/03 | Dead exports frontend |
| `pytest-coverage.xml` | pytest --cov | 04 tests | Backend coverage XML, **70% total** (4665 stmts, 1405 missed); 297 tests passed |
| `pytest-output.log` | pytest | 04 tests | Test run summary |
| `vitest-coverage/` | vitest --coverage | 04 tests | Frontend coverage HTML+JSON dir |
| `vitest-output.log` | vitest | 04 tests | Test run summary |
| `alembic-check.log` | alembic | 05 data | **FAILED: Target DB not up to date** — needs investigation (dev DB drift or missing migration?) |
| `check-relationships.log` | scripts/check_relationships.py | 05 data | Relationship integrity |
| `qmethod-libre-q-*.json` (5 files) | custom driver | 06 q-method | Layer 1 reference runs on 4 valid datasets + 1 degenerate (lipset placeholder) |
| `qmethod-layer1-INVENTORY.md` | sub-agent F | 06 q-method | Entry point: `analysis_service.py:684 run_analysis()`. Intermediates captured: 14 per dataset. **Blockers: real Zabala lipset dataset missing; R unavailable for Layer 2 cross-tool comparison** |
| `qmethod-comparison-NOTE.txt` | sub-agent F | 06 q-method | Notes Layer 2 limitations |
| `interrogate-coverage.txt` | interrogate 1.7.0 | 10 docs | **81% docstring coverage** (passes 80% gate) |
| `lychee-links.json` | lychee 0.24.1 | 10 docs | Broken markdown links (offline mode) |
| `citation-validation.txt` | cffconvert 2.0.0 | 10/12 | **CITATION.cff valid** per schema 1.2.0 ✓ |
| `openapi-sync.log` | make check-api | 10 docs | OpenAPI client regen result |

## Deferred to Wave 2 (need running app)

These were planned for Wave 1 but require a running dev server. The corresponding axis sub-agents in Wave 2 will run them:

- `axe-{landing,admin,participant}.json` — axe-core a11y → axis 07
- `lighthouse-*.{desktop,mobile}.json` → axis 07/08
- `bundle-stats.html` (rollup-plugin-visualizer) → axis 08
- `sql-trace-*.log` (SQLAlchemy echo on representative endpoint) → axis 08
- `i18n-check.log` + identical-values check → axis 07
- `mutmut-results.txt` (analysis_service mutation testing) → axis 04
- `docker-build.log` + `docker-up.log` → axis 09
- `uv-lock-check.log` + `npm-ci-check.log` → axis 09
- `init-db-reset.log` + `seed-run.log` → axis 09
- WebFetch SoftwareX guide + JOSS criteria → axis 12

## Top signals (preliminary, before axis sub-agents do real analysis)

🚨 **Critical:**
- **PyJWT CVE-2026-32597** (JWS critical extension bypass) — directly affects Libre-Q auth, fix to 2.12.0
- **11 npm critical CVEs** — needs full triage in axis 01

⚠️ **Significant:**
- 8 npm high CVEs + 6 other pip CVEs (multipart DoS, dotenv symlink, requests, pygments, pip, pytest)
- Alembic check failing: "Target DB not up to date" — could be just dev DB needing migrate, or real drift
- Q-method Layer 2 (cross-tool comparison) blocked: real Zabala lipset dataset missing + R unavailable
- Q-method only varimax rotation exposed (no manual/judgmental) — relevant for critical Q

✅ **Healthy:**
- Bandit: 0 high/medium issues on 10k LOC
- Madge: 0 frontend circular deps
- CITATION.cff valid
- Backend coverage 70%, 297 tests pass
- Docstring coverage 81% (above 80% gate)

## Tools versions

- gitleaks 8.18.4
- lychee 0.24.1
- interrogate 1.7.0, mutmut, pydeps 3.0.6, cffconvert 2.0.0
- madge 8.0.0, knip 6.6.3, axe-core CLI 4.11.2, lighthouse 13.1.0
- bandit, deptry, pip-audit, ruff, mypy, radon, vulture (existing in backend venv)
- biome, vitest, tsc (existing in frontend deps)
