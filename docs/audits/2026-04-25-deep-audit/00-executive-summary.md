# Libre-Q Deep Code Audit — Executive Summary

**Date:** 2026-04-25
**Auditor:** Claude Opus 4.7 (controller) + Codex independent design review + 12 sub-agents per axis
**Spec:** `docs/superpowers/specs/2026-04-25-deep-code-audit-design.md`
**Plan:** `docs/superpowers/plans/2026-04-25-deep-code-audit.md`
**Wall clock:** ~2h actual (vs ~12h estimated — parallel sub-agent batching)
**Total findings:** 132 (6 blocker / 39 major / 54 minor / 33 observation)
**Total estimated effort:** 126.5h all severities — **3h for blockers alone**

## Verdict

### 🟡 SoftwareX submission (deadline 2026-05-14)

**Submission-ready with conditions.** Six blockers are all S-effort (≤1h each) and fixable in a single session totalling ~3h. Twenty-seven SoftwareX-tagged majors require attention before submission; most are S/M effort. The critical question is not the count but the **critical Q framing gap** (F-12-010, F-10-010, F-06-008): Libre-Q's positioning as a *critical* Q-methodology platform is invisible in README, documentation, and the audio↔factor linkage. This is the audit's most consequential finding for the SoftwareX manuscript itself.

Conditions to declare submission-ready:
1. Resolve all 6 blockers (~3h) — git tag, Zenodo, CI triggers, PyJWT bump, `.env.example`, test-router env gate
2. Address SoftwareX-flagged install path (F-09-002/003/004 + F-12-013) — reviewer must succeed at install
3. Add Statement of Need + Citation section to README (F-10-001, F-10-003)
4. Make critical Q orientation explicit in README and `q-methodology.md`
5. Update comparison table to include qmethod-R + KADE (F-12-011)
6. Decide which Q-methodology gaps (F-06-001 AnalysisRun model, F-06-002 manual rotation, F-06-008 audio↔factor) become limitations in the manuscript vs implemented before submission

### 🟡 Production deployment

**Prod-safe with restrictions.** Three security blockers are exploitable today (PyJWT crit bypass, leaked DB creds in `.env`, unauthenticated test endpoints when ENVIRONMENT unset). All have S-effort fixes. Beyond blockers, the absence of an error reporter (Sentry, etc.) and audit trail for admin operations means live research sessions would be invisible to the operator if they go wrong. Acceptable for closed-circle research deployment with named users; not acceptable for any open registration.

Required before any prod deployment:
- Apply 3 security blockers (3 × S effort)
- Wire error reporter (F-11-001, ~2h)
- Address F-01-005 (DOMPurify XSS CVEs) and F-01-006 (xlsx prototype pollution) — runtime deps with no fix available means evaluate replacement or vendor

Acceptable as ongoing work post-launch:
- Audit trail for admin ops (F-11-003)
- RGPD Art. 17 erasure endpoint (F-01-012 + F-05-004 cluster)

### Long-term maintainability

| Dimension | Score (1-5) | Brief |
|-----------|:-----------:|-------|
| Architecture | 4 | No import cycles, no circular frontend deps, service layer adopted for core Q flow. Five routers (auth, projects, invitations, audio, studies_import_export) bypass services — concentrated debt zone, not architectural rot. |
| Testability | 3 | Backend 70% coverage with 297 passing tests, but critical paths underweight: `submission_service` race conditions untested, `FactorArraysView`/`FactorCharacteristicsTable` at 0%, e2e for admin analysis missing entirely. |
| Readability / coherence | 4 | Ruff clean, mypy clean (non-strict), 81% docstring coverage. One known TS `any` cascade (159 suppressions) traces to a single untyped callback. |
| Contributor documentation | 3 | CLAUDE.md migration chain stale (6/15 documented), `agent-instructions.md` references deleted `schemas.py`. CONTRIBUTING and tutorials exist but participant-journey tutorial absent. |
| Forecast velocity | 3 | Future features in auth/admin will inherit the router-monolithic pattern (F-03-001) until refactored. Frontend bundle bloat (F-08-001/002/003) will degrade as features land unless lazy-load discipline is restored. |

---

## Top findings

### All 6 blockers (must fix before submission, ~3h total)

| ID | Effort | Title |
|----|:------:|-------|
| **F-01-001** | S | PyJWT CVE-2026-32597 — `crit` header bypass allows forged JWT acceptance (bump `pyjwt>=2.12.0`) |
| **F-01-002** | S | Local `.env` contains real DB credentials (`REDACTED-LOCAL-DEV-PW`); no `.env.example` template |
| **F-01-003** | S | Test-router endpoints (`/api/test/cleanup-all`, `/api/test/seed`) unauthenticated when `ENVIRONMENT` not set to "production" |
| **F-12-001** | S | No git tag — submitted version not frozen, Zenodo cannot archive |
| **F-12-002** | S | No `.zenodo.json`, no Zenodo DOI |
| **F-12-003** | S | CI not triggered on push/PR (only `workflow_dispatch:`); badge stale |

### Top 10 SoftwareX-tagged majors (priority for remediation week 1)

| ID | Effort | Axis | Title |
|----|:------:|:----:|-------|
| **F-09-002** | M | 09 | README Quick Start broken for fresh install (skips DATABASE_URL, migrate, init_db) |
| **F-09-003** | S | 09 | No `.env.example`; ALLOWED_ORIGINS bypasses Settings class |
| **F-12-013** | M | 12 | Quick Start setup gap = highest single-point-of-failure for reviewer install |
| **F-10-001** | M | 10 | No Statement of Need section in README — desk-reject trigger |
| **F-10-003** | S | 10 | No `## Citation` section in README |
| **F-12-010** | M | 12 | Critical Q orientation absent from README/CITATION/q-methodology.md |
| **F-12-011** | S | 12 | Comparison table omits qmethod-R (most-cited) and KADE |
| **F-06-001** | L | 06 | No `AnalysisRun` DB model — analytical choices transient, no audit trail (critical Q requirement) |
| **F-06-008** | L | 06 | Post-sort audio not linkable to factor membership (Sneegas 2020, Robbins & Krueger 2000 gap) |
| **F-04-007** | M | 04 | `FactorArraysView`/`FactorCharacteristicsTable` 0% coverage + recently modified (current WIP files) |

---

## Findings by axis

| Axis | Pass | Total | Blocker | Major | Minor | Obs |
|------|:----:|:-----:|:-------:|:-----:|:-----:|:---:|
| 01 Security & RGPD | deep | 14 | **3** | 6 | 3 | 2 |
| 02 Code Quality | light | 10 | 0 | 0 | 6 | 4 |
| 03 Architecture | std | 9 | 0 | 1 | 5 | 3 |
| 04 Tests | deep | 14 | 0 | 6 | 5 | 3 |
| 05 Data & Migrations | std | 9 | 0 | 1 | 4 | 4 |
| 06 Critical Q-methodology | deep | 14 | 0 | 5 | 6 | 3 |
| 07 Frontend / UX | std | 10 | 0 | 4 | 5 | 1 |
| 08 Performance | light | 5 | 0 | 0 | 3 | 2 |
| 09 Reproducibility | deep | 12 | 0 | 4 | 4 | 4 |
| 10 Documentation | std | 12 | 0 | 3 | 7 | 2 |
| 11 Observability | light | 5 | 0 | 2 | 1 | 2 |
| 12 Submission Package | deep | 18 | **3** | 7 | 5 | 3 |
| **Total** | — | **132** | **6** | **39** | **54** | **33** |

## Findings by audience (multi-tag)

| Audience | Total tagged |
|----------|:-----------:|
| Maintenance | 71 |
| SoftwareX | 61 |
| Prod | 57 |

## Effort summary

| Severity | Count | Cumulative effort |
|----------|:-----:|:----------------:|
| Blocker | 6 | 3.0h (all S) |
| Major | 39 | 53.0h (1 L, 20 M, 18 S) |
| Minor | 54 | 47.0h (1 L, 11 M, 42 S) |
| Observation | 33 | 23.5h |
| **Total** | **132** | **126.5h** |

Sprint capacity check: ~3 weeks remediation × ~30h/week = ~90h capacity → comfortable for blockers + all SoftwareX-tagged majors + selected SoftwareX-tagged minors.

---

## Transverse clusters (causal grouping for backlog)

These are root-cause groupings to remediate together rather than as separate findings:

### Cluster A — "Reviewer install fail" (high SoftwareX risk)
- **Root cause:** README Quick Start was written for someone with the dev environment already set up
- **Findings:** F-09-002 (Quick Start broken), F-09-003 (no `.env.example`), F-09-004 (`example-study.json` missing), F-12-013 (env var setup gap), F-10-001 (no Statement of Need)
- **Single fix session:** rewrite README install section + create `.env.example` + add `example-study.json` (~3h total)

### Cluster B — "Submission package not frozen"
- **Root cause:** No discipline yet around tagged releases + Zenodo archive
- **Findings:** F-12-001 (no tag), F-12-002 (no Zenodo), F-12-003 (CI not on push/PR), F-10-004 (CITATION.cff TODOs), F-10-003 (no Citation section in README)
- **Single fix session:** uncomment CI triggers + create `.zenodo.json` + cut `v0.1.0` tag + fill CITATION.cff TODOs + add README Citation section (~2h total)

### Cluster C — "Critical Q orientation invisible"
- **Root cause:** Codebase implements critical Q practices partially but doesn't *frame* itself that way; framing is implicit
- **Findings:** F-12-010 (README), F-10-010 (q-methodology.md doc), F-06-008 (audio not linkable to factors), F-06-002 (no manual rotation)
- **Decision required:** which gaps become implemented before submission vs explicit limitations in the manuscript?

### Cluster D — "RGPD erasure" (compliance gap)
- **Root cause:** Data model lacks `anonymised_at` column → no erasure endpoint can be safely built
- **Findings:** F-05-004 (data model gap, **the parent**), F-01-012 (missing endpoint, **downstream effect**)
- **Order of work:** migration first (F-05-004), then endpoint (F-01-012)

### Cluster E — "Auth/admin lacks observability"
- **Root cause:** `auth.py` is router-monolithic (no service layer) AND admin operations don't log actor identity
- **Findings:** F-03-001 (auth.py monolithic), F-04-008 (useAuthStore 13% test coverage), F-11-003 (no audit trail)
- **Sequence:** F-11-003 (audit trail) is the easy quick win; F-03-001 + F-04-008 are coupled and large

### Cluster F — "CLAUDE.md doc drift"
- **Root cause:** Migration documentation not updated when migrations 7-15 were added
- **Findings:** F-09-005 + F-10-005 (same finding from two angles)
- **Single 5-min fix:** update CLAUDE.md migration chain section

---

## Light-pass coverage notice

Per spec §4, three axes were pre-classified as **light-pass** (automated tools + minimal manual review, max ~30 min each, hard finding cap):
- **Axis 02 (Code Quality)** — manual hotspot reading reduced; all top complexity items still surfaced
- **Axis 08 (Performance)** — Lighthouse not run (chromedriver mismatch); bundle analyzer + static N+1 detection used instead
- **Axis 11 (Observability)** — sample-only review of critical services

Light-pass findings flag structural issues only; nuanced cases were intentionally not pursued. **Re-run any of these as deep-pass on request** if a finding warrants deeper investigation.

Other coverage gaps (Wave 1 deferred to specific axes that could not complete):
- **Axis 06 Layer 2** (cross-tool comparison vs `qmethod-R`) — degraded mode used (textbook reference instead). To complete: install R + `qmethod` package, re-run on real Zabala lipset dataset (F-06-009 documents this)
- **Axis 04 mutation testing** — `mutmut` 3.5.0 incompatible with `pytest-asyncio`+async SQLAlchemy. To complete: downgrade to mutmut 2.4.4 or switch to `pytest-mutagen` (F-04-012)
- **Axis 07 axe-core** — chromedriver version mismatch. To complete: `npx browser-driver-manager install chrome`
- **Axis 09 Docker build from zero** — `docker` binary absent on audit host; build tested in CI instead recommended (F-09-001)

---

## Methodology recap

- **12 axes** × 4 days planned, completed in ~2h actual via parallel sub-agent batching
- **5 deep-pass + 4 standard-pass + 3 light-pass** axes (per spec §4)
- **Tools used:** ruff, mypy, biome, tsc, bandit, pip-audit, npm audit, gitleaks, radon, vulture, pydeps, madge, knip, interrogate, lychee, cffconvert, mutmut (failed), axe-core (chromedriver issue), pytest --cov, vitest --coverage
- **External literature:** papis library `q-methodology` (10 references including critical Q canon: Sneegas 2020, Stainton Rogers 1997, Stenner 2011, Robbins & Krueger 2000, Watts & Stenner 2005+2012, Zabala 2014+2016, Ramlo 2025, Ormerod 2019)
- **Codex independent review** of the audit design before execution (4 amendments integrated)

## How to use this report

1. **For sprint planning:** open `99-action-backlog.md` — findings sequenced by remediation week, ready to paste into Todoist
2. **For triage decisions:** the 6 blockers above are non-negotiable; the 27 SoftwareX-tagged majors require explicit accept/defer decisions
3. **For deep dives:** each axis file (`01-security.md` through `12-submission-package.md`) contains the full findings with file:line citations and reproduction commands
4. **For commit messages:** every finding has a stable ID (`F-XX-NNN`); reference these in your commits and Todoist tasks for traceability

## Out of scope (post-audit)

This audit produced a diagnostic. Implementing fixes is downstream work, scoped via the action backlog and executed in separate focused sessions. No production code was modified by the audit itself.
