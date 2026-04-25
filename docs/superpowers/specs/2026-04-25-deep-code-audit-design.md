# Deep code audit — design spec

**Date:** 2026-04-25
**Author:** J. Vastenaekels (with Claude as auditor)
**Status:** Draft for user approval
**Context:** SoftwareX submission sprint, target deadline ~2026-05-14

---

## 1. Purpose

Conduct a deep, multi-axis audit of the Qualis codebase covering three angles
simultaneously:

1. **SoftwareX submission readiness** — pass reviewers and avoid desk reject
2. **Production health** — robustness, security, RGPD, observability
3. **Long-term maintainability** — architecture, tests, documentation, dead weight

The audit is a **diagnostic**, not an implementation plan. Its output is a set of
prioritized findings and a sequenced backlog. Implementation of fixes happens in
separate sessions, each scoped to a small set of findings.

## 2. Deliverable architecture

All audit output lives in `docs/audits/2026-04-25-deep-audit/`:

```
docs/audits/2026-04-25-deep-audit/
├── 00-executive-summary.md        # Verdict by audience + top findings
├── 01-security.md                 # Authn, authz, RGPD, secrets, deps, exports
├── 02-code-quality.md             # Lint, types, complexity, dead code, smells
├── 03-architecture.md             # Couplings, boundaries, domain coherence
├── 04-tests.md                    # Real coverage, test quality, critical gaps
├── 05-data-and-migrations.md      # Schema, migrations, ORM↔DB coherence
├── 06-q-methodology-validity.md   # Critical Q literature alignment, algos
├── 07-frontend-ux.md              # Accessibility (axe), i18n, mobile a11y
├── 08-performance.md              # Backend queries, frontend bundle/render
├── 09-reproducibility.md          # Docker, deps pinning, seed, env, deploy
├── 10-documentation.md            # README, OpenAPI, CITATION, contributor docs
├── 11-observability.md            # Structured logs, error reporting, audit trail
├── 12-softwarex-compliance.md     # Software Quality Indicators checklist
├── 99-action-backlog.md           # All findings, sorted by severity, sprint-sequenced
└── .raw/                          # gitignored: raw tool outputs (timestamped)
```

### Finding format (uniform across files 01–12)

```markdown
### F-XX-NNN : Short title
- **Severity:** blocker | major | minor | observation
- **Audience:** [SoftwareX] [Prod] [Maintenance]   (multi-tag possible)
- **Location:** `path/to/file.py:123` (or "transverse")
- **Observation:** what was observed, with citation/extract/command
- **Impact:** why it matters for the tagged audiences
- **Recommendation:** concrete, actionable
- **Effort:** S (≤1h) | M (≤4h) | L (≤1d) | XL (>1d)
```

IDs are stable: `F-01-001`, `F-04-007`. Cross-references between exec summary,
backlog, and per-axis files use these IDs without duplicating content.

## 3. Methodology per axis

For each axis: **(a) automated tooling**, **(b) targeted manual review**,
**(c) external sources** (literature, journal specs, standards).

| # | Axis | (a) Automated | (b) Manual review | (c) External |
|---|------|---------------|-------------------|--------------|
| 01 | Security | `bandit`, `pip-audit`, `npm audit`, `gitleaks`, `safety` | Auth flows (JWT, 2FA, sessions, resume codes), authz per role, exports, audio uploads, CORS, rate limiting, CSRF, headers | OWASP Top 10 2021, RGPD art. 5/15/17/32 |
| 02 | Code quality | `ruff`, `mypy --strict`, `radon cc/mi`, `vulture`, `deptry`, `biome`, `tsc --strict`, `knip` | Top-20 complexity hotspots, duplications, naming, error handling | — |
| 03 | Architecture | `pydeps`, `madge`, coupling metrics | Routers/services/models boundaries, where business logic lives, Zustand store vs hooks vs API, schema coherence (Pydantic↔ORM↔TS) | Hex/Clean architecture refs, FastAPI best practices |
| 04 | Tests | `pytest --cov`, `vitest --coverage`, `mutmut` (sample on `factor_analysis_service.py`) | Read critical tests: factor analysis, Q-sort submission, auth, exports. Detect abusive mocks, no-op assertions, fragile fixtures | — |
| 05 | Data & migrations | Diff `models.py` ↔ DB ↔ Alembic, `check_relationships.py` | Migration chain idempotency, potential data loss, missing unique constraints | PostgreSQL best practices |
| 06 | Critical Q-methodology validity | See §3a below — multi-dataset comparison + intermediates + interpretive stability | Read factor analysis code (PCA, varimax, flagging, sign polarity, communalities); assess critical Q compatibility (manual rotation, transparency, voice) | papis library `q-methodology` (Sneegas 2020, Stainton Rogers 1997, Stenner 2011, Robbins & Krueger 2000, Watts & Stenner 2012) |
| 07 | Frontend / UX | `axe-core` automated scan, Lighthouse, extended `i18n-check` | Playwright manual journeys: admin onboarding, participant Q-sort mobile, recruitment | WCAG 2.1 AA |
| 08 | Performance | Query profiling (SQLAlchemy echo + EXPLAIN ANALYZE sample), `rollup-plugin-visualizer`, Lighthouse perf | N+1 detection in services, true async (no blocking calls), code splitting, React re-renders | — |
| 09 | Reproducibility | Build Docker from scratch, `uv lock --check`, `npm ci`, `make ci-full`, run seed, e2e Playwright | Env vars documented, secrets separated, `init_db --reset` clean, seed data coherent | SoftwareX repro requirements |
| 10 | Documentation | `interrogate` (docstring coverage), `lychee` (broken links), OpenAPI ↔ code conformance | README, CONTRIBUTING, tutorials, CITATION.cff, LICENSE headers, CLAUDE.md | SoftwareX manuscript template, JOSS criteria |
| 11 | Observability | grep `print(`, `console.log`, `logger.exception`, structured logs presence | Log coverage on critical paths, audit trail (who edited what), error reporting | 12-factor logs |
| 12 | Submission package + SoftwareX compliance | See §3b below — full submission-readiness checklist | Read SoftwareX Guide for Authors, compare with recently published articles, inspect repo as a reviewer would | SoftwareX Software Quality Indicators, JOSS review criteria |

### §3a — Axis 06 detailed methodology (Q-methodology validity)

Re-running on a single dataset is not enough. In Q, rotation and flagging can
change the narrative, not just decimals. The validation must cover three layers:

**Layer 1 — Multi-dataset coverage (canonical edge cases).**
Run Qualis's analysis on at least 4 datasets covering:
- Standard balanced case (forced distribution, ~30 statements, ~20 participants)
- Bipolar factor case (clear opposing perspectives → tests sign polarity)
- Confounded / non-significant Q-sorts (tests flagging robustness)
- Forced vs. unforced distribution variant of the same data (tests distribution
  handling)
- Varimax vs. judgmental rotation (if Qualis exposes manual rotation; otherwise
  document the limitation)
- Centroid vs. PCA extraction (if both supported)

Use `qmethod` (R) and PQMethod as reference implementations. Datasets sourced
from Zabala 2014 (R package examples), known published Q-studies with
reproducible data, and the Qualis seed.

**Layer 2 — Compare intermediates, not only final outputs.**
For each dataset, compare:
- Correlation matrix between Q-sorts
- Factor loadings (per participant, per factor)
- Flagging decisions (which Q-sorts load on which factor, at which threshold)
- Z-scores per statement per factor
- Factor scores (idealized Q-sorts per factor)
- Distinguishing statements per factor
- Consensus statements

A divergence at any intermediate stage is a finding, even if final factor
arrays look similar.

**Layer 3 — Interpretive stability test.**
For one dataset, vary one analytical choice at a time (rotation method,
flagging threshold, number of extracted factors) and assess whether the
resulting **interpretation** changes meaningfully. If yes, document this as a
limitation Qualis must surface to users (transparency requirement of critical
Q-methodology).

**Out of scope for axis 06:** re-implementing PQMethod from scratch, validating
factor analysis math itself (the underlying NumPy/SciPy primitives are
trusted), evaluating Q-methodology as a method (we audit the implementation,
not the method).

### §3b — Axis 12 detailed methodology (Submission package)

The audit treats SoftwareX submission as having two distinct concerns:
**compliance** (mechanical checklist) and **package readiness** (what an editor
sees when they open the repo).

**Compliance checklist (mechanical):**
- LICENSE file present, OSI-approved, headers in source files
- CITATION.cff valid (validate via `cffconvert`)
- README contains all SoftwareX-required sections (statement of need,
  installation, usage example, contribution, citation)
- Public GitHub repo, default branch protected
- Version tagged (e.g., `v0.1.0`) matching the manuscript
- Zenodo archive linked, DOI obtained
- OpenAPI / API docs published or linked

**Package readiness (reviewer-perspective):**
- Inspect the repo as a fresh reviewer: is the entry point obvious?
- Install from zero on a clean VM/container: does it actually work?
- Statement of need: clear, distinguishes Qualis from PQMethod, KADE, Ken-Q,
  qmethod-R (this is where critical Q orientation must be visible)
- Comparison to alternatives: explicit table or paragraph in README and
  manuscript
- Submitted version is **frozen** (tag, archive) — reviewer can pin the exact
  state they reviewed
- Reproducibility of any figure/result claimed in the manuscript: scripts +
  data accessible
- Test suite runs on the tagged version (CI green)

A red flag in package readiness is more dangerous than a red flag in compliance
— compliance can often be fixed in a day; package readiness reveals deeper
issues that the audit must surface early.

### New tools to install (Wave 1)

`gitleaks`, `interrogate`, `lychee`, `axe-core` CLI, `mutmut`, `knip`, `madge`,
`pydeps`, `rollup-plugin-visualizer`. Installed in a throwaway venv for the audit.
None added permanently to `pyproject.toml` / `package.json` without explicit
user approval per tool, at the end of the audit.

### External literature (papis library `q-methodology`)

Pre-populated with critical Q canon: Sneegas 2020 (foundational), Stainton Rogers
1997 ("Going Critical"), Stenner 2011 (Qualiquantology), Robbins & Krueger 2000,
Ormerod 2019 (application), Watts & Stenner 2005 + 2012, Zabala 2014 + 2016
(qmethod R), Ramlo 2025. The library will be expanded during Axis 06 as needed.

## 4. Pacing — 3 waves over ~4 days

The audit fits in the first ~1.5 weeks of the sprint, leaving ≥1.5 weeks for
remediation before the 2026-05-14 deadline.

### Wave 1 — Tooling and measurement (day 1, ~3-4h)

Tasks that run without human intervention. Output: raw data ready to analyze.

- Install missing tools in a throwaway venv
- Run in parallel: `make ci-full`, coverage backend+frontend, `gitleaks detect`
  (full git history), `axe-core` on key pages via Playwright, `lighthouse`
  desktop+mobile on 3 pages, bundle analyzer, `pydeps`/`madge`, ORM↔DB↔Alembic
  diff, `lychee` on all `.md`, `interrogate`, `mutmut` on
  `factor_analysis_service.py`
- Store outputs in `.raw/` (gitignored)

### Wave 2 — Per-axis qualitative review (days 2-3, ~6-8h)

Manual reading + raw data analysis + finding write-up, axis by axis. Each axis
can be dispatched as a parallel sub-agent when independent.

**Realism note.** 12 axes × ~2 days = mechanical risk of superficiality. To
avoid producing a thin pass on everything, axes are pre-classified into
**deep-pass** and **light-pass** by default:

- **Deep-pass (full automated + manual + external):** axes 01 (security), 04
  (tests), 06 (Q-methodology validity), 09 (reproducibility), 12 (submission
  package).
- **Light-pass (automated + minimal manual, ≤45min manual each):** axes 02
  (code quality manual), 08 (perf manual), 11 (observability).
- **Standard-pass (automated + targeted manual):** axes 03, 05, 07, 10.

Light-pass axes still produce their `0X-*.md` file with findings, but the
manual review is time-boxed and only flags structural issues, not nuanced
cases. This is a deliberate trade-off, not a regression — surfaced explicitly
in `00-executive-summary.md` so the user can decide if a deeper pass is
warranted.

**Priority order if further scope must be cut:**

1. Security + RGPD (axis 01) — blocking for prod AND SoftwareX
2. Critical Q-methodology validity (axis 06) — Qualis's scientific differentiator
3. Tests (axis 04) — directly scrutinized by SoftwareX reviewers
4. Reproducibility (axis 09) — explicit SoftwareX criterion
5. Submission package + documentation (axes 12 + 10) — desk-reject risk
6. Architecture, data, frontend/UX (3 standard-pass axes)
7. Code quality manual, perf manual, observability (3 light-pass axes — first
   to drop entirely if needed)

Each axis produces its full `01-*.md` to `12-*.md` file.

**Overrun probability acknowledged:** ~60-70% chance Wave 2 exceeds 8h given
the codebase size. Mitigation already baked in: light-pass classification (no
axis is silently downgraded mid-work) and the cuts list below. If overrun
happens despite this, drop light-pass axes entirely rather than degrade
deep-pass axes.

### Wave 3 — Synthesis, exec summary, backlog (day 4, ~2-3h)

- Cross-reading the 12 files; identify transverse findings
- Write `00-executive-summary.md`: verdict per audience (3 paragraphs), top 5
  findings per severity, cumulative effort vs. severity table
- Write `99-action-backlog.md`: findings reordered by severity, sequenced into
  remediation week 1 (blockers + priority majors), remediation week 2
  (remaining majors), pre-submission week (2026-05-10 → 2026-05-14),
  post-submission (minors + observations). Format pre-formatted for Todoist
  paste
- Final commit of `docs/audits/2026-04-25-deep-audit/`

### Cuts available under time pressure

- Skip `mutmut` mutation testing (-45min)
- Lighthouse desktop only (-30min)
- Skip axis 11 observability (-45min)
- Reduce axis 02 (code quality) to automated tools only, drop manual hotspot reading (-1h)

## 5. Findings scoping rules

To avoid producing 200 noisy findings.

### In scope (deserves a finding)

- SoftwareX desk-reject risk (LICENSE, README, CITATION, version tag, Zenodo,
  reproducibility)
- Application security (auth, injection, hardcoded secrets, CVE deps, leaky
  exports, RGPD)
- Data loss/corruption risk (migrations, transactions, missing constraints,
  race conditions)
- Scientific validity bugs (factor analysis correctness, sign polarity,
  flagging vs critical Q literature)
- Structural blocking debt (couplings preventing critical-module testability,
  god-objects, import cycles)
- WCAG AA violations on critical journeys (admin + participant Q-sort)
- Tests with no real assertions or mocking what they should test (not just low
  coverage %)
- Broken/inconsistent i18n on user-facing strings (fr/fi notably)
- Broken reproducibility (build fails from scratch, unpinned deps, broken seed)
- Missing documentation on public API or configuration surface (env vars, CLI
  scripts)

### Out of scope (NOT a finding, or observation at most)

- Stylistic preferences without measurable impact (unless Biome/Ruff already
  flag them)
- "Beauty" refactors without concrete testability/readability benefit
- Premature optimizations (no benchmark justifies)
- Feature suggestions (audit assesses what exists, not the roadmap)
- Inline TODO/FIXME unless they signal real debt (then → finding on the debt)
- Missing docstrings on trivial internal functions
- Missing comments (well-named code needs no comments)
- Coverage % as a goal in itself (90% with hollow mocks is worse than 70% with
  serious tests)
- Compliance with generic "best practices" not justified by concrete Qualis
  risk

### Severity calibration

| Severity | Operational definition |
|----------|------------------------|
| **blocker** | Prevents SoftwareX submission OR healthy prod deployment OR corrupts user data OR breaks scientific validity. Must be addressed before 2026-05-14. |
| **major** | Significantly weakens an audited dimension. Should be addressed before submission; if not, must appear as explicit limitation in manuscript. |
| **minor** | Slows maintenance, marginally degrades UX, or reduces reviewer confidence without breaking it. Address post-submission. |
| **observation** | FYI, interesting pattern, evolution suggestion. No action required. |

### Auditor anti-patterns explicitly avoided

- Bikeshedding (30 naming findings vs 3 security findings)
- Cargo-cult standards ("Hexagonal architecture demands…" without concrete
  cost demonstration)
- Findings without actionable recommendation
- **Causal double-counting** — same root cause counted in multiple axes
  inflates the report and dilutes priorities. Rule: one root cause = one
  parent finding (in its primary axis) + cross-references (`see F-XX-NNN`) in
  the other axes. Cross-references do not count as new findings.
- Recommendations that expand scope (rewriting 3 modules → look for a minimal
  variant or flag as "major structural to defer")
- AI-vibes suggestions without grounding in actual code (cite file:line or no
  finding)
- **Methodological-difference-as-defect** — classifying a defensible-but-
  different methodological choice as a "major" finding. If a Qualis
  algorithmic choice diverges from PQMethod/Ken-Q but is defensible in the
  critical Q literature, the finding belongs in `observation` (with
  literature citation), not `major`.

## 6. Verdict and audit closure

### Verdict per audience (in `00-executive-summary.md`)

**SoftwareX:**

- 🟢 Submission-ready — no blocker, ≤3 majors with workaround/in-progress fix
- 🟡 Submission-ready with conditions — 1-3 blockers traitable in <1 week, OR
  ≥4 majors needing explicit prioritization
- 🔴 Not ready — >3 blockers, or a blocker without clear solution

**Production:**

- 🟢 Prod-safe for research use (identified users, no massive PII, active
  monitoring)
- 🟡 Prod-safe with documented restrictions
- 🔴 Not ready for any external prod use

**Long-term maintenance** — qualitative scoring (1-5) on: Architecture,
Testability, Readability/coherence, Contributor documentation, Forecast
velocity. Plus a 3-4 sentence comment explaining the scores.

### Backlog format (`99-action-backlog.md`)

Sections by remediation period (week of 2026-04-27 → 2026-05-02, week of
2026-05-03 → 2026-05-09, pre-submission week 2026-05-10 → 2026-05-14,
post-submission). Each line copyable into Todoist:

```
- [ ] [F-01-003] Auth JWT secret rotation broken
      effort: M | axes: security, prod | owner: ?
```

### Definition of done

The audit is **complete** when:

1. The 14 files (`00` to `12` + `99`) exist and are committed in
   `docs/audits/2026-04-25-deep-audit/`
2. Each finding has: stable ID, severity, audience, location (file:line or
   "transverse"), observation, impact, recommendation, effort
3. No finding tagged "TBD" or "to investigate later"
4. Global verdict exists for the 3 audiences
5. Backlog is sequenced with effort estimates compatible with remaining sprint
6. Wave 1 throwaway tools do not pollute the repo (venv cleaned, or added to
   `pyproject.toml` / `package.json` only with explicit per-tool user approval)

### Out of scope (post-audit)

- User decides which findings to accept or contest
- Accepted findings are fixed in **separate sessions**, each with its own
  mini implementation plan
- This audit is not an implementation plan — fixes are downstream work
  sequenced via the backlog

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Audit produces too many findings to act on within sprint | Strict scoping rules (§5), severity calibration, backlog sequenced to leave only blockers + priority majors in the first remediation week |
| Wave 1 tools pollute the repo | Throwaway venv; explicit per-tool approval before any permanent install |
| Critical Q literature audit drifts into a literature review | Time-boxed to ~1.5h; only papers needed to validate or invalidate specific code decisions |
| Sub-agents diverge in finding format | Uniform finding template enforced (§2); cross-check during Wave 3 synthesis |
| Discovering blockers late in Wave 2 forces deadline rethink | Priority order in Wave 2 surfaces blockers first (security, validity, repro) |
| Audit duration exceeds 4 days | Scope cuts pre-identified (§4); axes 11 + axis 02 partial are first to drop |
