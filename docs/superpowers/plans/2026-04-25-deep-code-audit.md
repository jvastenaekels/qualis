# Deep Code Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute a 12-axis deep audit of Qualis producing 14 markdown deliverables in `docs/audits/2026-04-25-deep-audit/`, ready to drive remediation work before the SoftwareX submission deadline (2026-05-14).

**Architecture:** Three-wave execution: (1) automated tool runs (parallel where possible) producing raw outputs in `.raw/`, (2) per-axis qualitative analysis (12 sub-agents in parallel where independent), (3) cross-axis synthesis producing executive summary + sequenced backlog. Each axis classified deep/standard/light-pass per the spec.

**Tech Stack:** Python (uv), Node.js (npm), Playwright, axe-core, Lighthouse, gitleaks, mutmut, lychee, interrogate, knip, madge, pydeps, papis (q-methodology library), mcp-pub, sub-agents via Agent tool.

**Spec reference:** `docs/superpowers/specs/2026-04-25-deep-code-audit-design.md` — read this first before starting any task. All terminology (deep/standard/light-pass, finding format, severity) is defined there.

---

## Reference: Finding Format

Every finding in any `0X-*.md` file MUST follow this format. IDs are stable
across the entire audit (`F-01-001` is unique, no re-use across axes).

```markdown
### F-XX-NNN : Short title

- **Severity:** blocker | major | minor | observation
- **Audience:** [SoftwareX] [Prod] [Maintenance]
- **Location:** `path/to/file.py:123` (or "transverse")
- **Observation:** what was observed (with command output, code excerpt, or citation)
- **Impact:** why it matters for the tagged audiences
- **Recommendation:** concrete, actionable
- **Effort:** S (≤1h) | M (≤4h) | L (≤1d) | XL (>1d)
```

**Numbering convention:** axis number (01-12) + sequential number per axis,
zero-padded to 3 digits. First security finding = `F-01-001`. First Q-methodology
finding = `F-06-001`.

---

## Reference: Sub-Agent Dispatch Pattern (Wave 2)

For Wave 2, each axis can be dispatched to a sub-agent (`general-purpose`)
running independently. The prompt template:

```
You are auditing axis NN ({axis name}) of the Qualis codebase as part of a
deep code audit. Your output is the file
`docs/audits/2026-04-25-deep-audit/0N-{axis-slug}.md`.

CONTEXT:
- Read `docs/superpowers/specs/2026-04-25-deep-code-audit-design.md` sections
  §3 (methodology), §3a/§3b if relevant to your axis, §5 (scoping rules,
  in/out, severity, anti-patterns).
- Read raw tool outputs in `docs/audits/2026-04-25-deep-audit/.raw/` relevant
  to your axis: {list specific files}.
- Pass: {deep | standard | light}
- Time budget: {minutes}

YOUR TASK:
1. Review raw outputs.
2. Conduct the manual review described in the spec for this axis.
3. Produce the finding file using the exact finding format in the audit
   plan §"Finding Format". Use IDs F-NN-001, F-NN-002, ...
4. Apply the scoping rules and severity calibration from the spec rigorously.
5. If a finding has a root cause that crosses axes, write the parent finding
   in the most-applicable axis and add a `[parent: F-XX-NNN]` note in your
   finding only as cross-reference (cross-references do not consume new IDs).
6. Commit the finding file with message:
   `audit(NN-{axis}): {N} findings, {breakdown by severity}`

OUT OF SCOPE FOR YOU:
- Do not produce findings for axes other than NN.
- Do not run new tools beyond what the spec lists for your axis.
- Do not propose fixes — recommendations should be concrete but not
  implemented.
- Do not edit any code outside `docs/audits/2026-04-25-deep-audit/`.

REPORT BACK:
A short summary (≤200 words): finding count by severity, the 2-3 most
significant findings, and any blockers discovered that should change the
audit's pacing.
```

---

## File Structure

**Created by this plan:**

```
docs/audits/2026-04-25-deep-audit/
├── 00-executive-summary.md          (Wave 3)
├── 01-security.md                    (Wave 2, deep)
├── 02-code-quality.md                (Wave 2, light)
├── 03-architecture.md                (Wave 2, standard)
├── 04-tests.md                       (Wave 2, deep)
├── 05-data-and-migrations.md         (Wave 2, standard)
├── 06-q-methodology-validity.md      (Wave 2, deep)
├── 07-frontend-ux.md                 (Wave 2, standard)
├── 08-performance.md                 (Wave 2, light)
├── 09-reproducibility.md             (Wave 2, deep)
├── 10-documentation.md               (Wave 2, standard)
├── 11-observability.md               (Wave 2, light)
├── 12-submission-package.md          (Wave 2, deep)
├── 99-action-backlog.md              (Wave 3)
└── .raw/                             (Wave 1, gitignored)
    ├── ci-full-output.log
    ├── pytest-coverage.xml
    ├── vitest-coverage/
    ├── gitleaks-report.json
    ├── npm-audit.json
    ├── pip-audit.json
    ├── axe-{page}.json
    ├── lighthouse-{page}.{desktop,mobile}.json
    ├── bundle-stats.html
    ├── pydeps-graph.svg
    ├── madge-circular.json
    ├── mutmut-results.txt
    ├── lychee-broken-links.json
    ├── interrogate-coverage.txt
    ├── orm-db-diff.txt
    └── (per-tool timestamped outputs)
```

**Modified:**
- `.gitignore` (add `docs/audits/*/.raw/` and audit venv path)

---

## Task 1: Audit Workspace Setup

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/.raw/`
- Modify: `.gitignore`
- Throwaway: `/tmp/audit-venv/` (Python tools), `/tmp/audit-node/` (Node tools)

- [ ] **Step 1: Verify clean working tree (audit edits should not mix with WIP)**

```bash
git -C /home/julien/libre-q status --short
```

Expected: only frontend WIP files (`FactorArraysView.tsx`, `FactorCharacteristicsTable.tsx`) and untracked `CITATION.cff`. If anything else appears unexpected, stop and ask user.

- [ ] **Step 2: Create audit directory structure**

```bash
mkdir -p /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw
```

- [ ] **Step 3: Add `.raw/` and audit venvs to `.gitignore`**

Append to `/home/julien/libre-q/.gitignore`:

```
# Audit artifacts (raw tool outputs, not for git)
docs/audits/*/.raw/
```

- [ ] **Step 4: Create throwaway Python venv and install audit tools**

```bash
python3 -m venv /tmp/audit-venv
/tmp/audit-venv/bin/pip install --quiet \
    gitleaks-py interrogate mutmut deptry pydeps cffconvert
```

(Note: `gitleaks` itself is a Go binary — install separately below if not already installed.)

- [ ] **Step 5: Install gitleaks if missing**

```bash
which gitleaks || (
    cd /tmp && \
    wget -q https://github.com/gitleaks/gitleaks/releases/download/v8.18.4/gitleaks_8.18.4_linux_x64.tar.gz && \
    tar -xzf gitleaks_8.18.4_linux_x64.tar.gz && \
    mkdir -p /tmp/audit-bin && \
    mv gitleaks /tmp/audit-bin/
)
export PATH="/tmp/audit-bin:$PATH"
gitleaks version
```

- [ ] **Step 6: Install Node-based tools in throwaway location**

```bash
mkdir -p /tmp/audit-node
cd /tmp/audit-node && npm init -y --silent && \
    npm install --silent --save-dev \
        knip \
        madge \
        @axe-core/cli \
        lighthouse \
        rollup-plugin-visualizer
```

- [ ] **Step 7: Install lychee (link checker)**

```bash
which lychee || cargo install --quiet lychee || (
    cd /tmp && \
    wget -q https://github.com/lycheeverse/lychee/releases/download/lychee-v0.15.1/lychee-x86_64-unknown-linux-gnu.tar.gz && \
    tar -xzf lychee-x86_64-unknown-linux-gnu.tar.gz && \
    mv lychee /tmp/audit-bin/
)
lychee --version
```

- [ ] **Step 8: Verify all tools available**

```bash
echo "=== Python tools ==="
/tmp/audit-venv/bin/interrogate --version
/tmp/audit-venv/bin/mutmut --help | head -1
/tmp/audit-venv/bin/pydeps --version
/tmp/audit-venv/bin/cffconvert --version
echo "=== Binary tools ==="
gitleaks version
lychee --version
echo "=== Node tools ==="
/tmp/audit-node/node_modules/.bin/knip --version
/tmp/audit-node/node_modules/.bin/madge --version
/tmp/audit-node/node_modules/.bin/axe --version
/tmp/audit-node/node_modules/.bin/lighthouse --version
```

Expected: every command prints a version, no `command not found`. If any fails, stop and resolve before continuing.

- [ ] **Step 9: Commit workspace setup**

```bash
cd /home/julien/libre-q
git add .gitignore
git commit -m "audit(setup): create deep-audit workspace and gitignore raw outputs"
```

---

## Task 2: Wave 1 — Automated Tool Runs (Parallel)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/.raw/*` (multiple raw outputs)

This task launches 6 parallel sub-agents, one per tool category. Each sub-agent
runs its tools, captures output to `.raw/`, and reports a 1-line summary.

- [ ] **Step 1: Pre-flight — verify backend venv and frontend deps are installed**

```bash
cd /home/julien/libre-q
ls backend/.venv/bin/pytest && ls frontend/node_modules/.bin/vitest
```

Expected: both paths exist. If not, run `make install` first.

- [ ] **Step 2: Dispatch 6 parallel sub-agents for Wave 1**

In a single message, send 6 Agent tool calls in parallel (`subagent_type:
general-purpose`) with the prompts below. Each agent runs only its tool group
and writes to `.raw/`.

**Sub-agent A — Existing CI suite + coverage:**

```
Run /home/julien/libre-q/Makefile target `ci-full` and capture output to
/home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/ci-full-output.log.
Then run backend coverage to .raw/pytest-coverage.xml (use
`backend/.venv/bin/pytest --cov=backend/app --cov-report=xml:docs/audits/2026-04-25-deep-audit/.raw/pytest-coverage.xml`)
and frontend coverage (use
`cd frontend && npm run test -- --run --coverage --reporter=json
--outputFile=../docs/audits/2026-04-25-deep-audit/.raw/vitest-results.json`).
Report: ci-full pass/fail, backend coverage %, frontend coverage %.
```

**Sub-agent B — Security scans:**

```
Run gitleaks on full git history, capture to .raw/gitleaks-report.json:
`gitleaks detect --source /home/julien/libre-q --report-path
docs/audits/2026-04-25-deep-audit/.raw/gitleaks-report.json
--report-format json --no-banner`.
Run npm audit: `cd frontend && npm audit --json >
../docs/audits/2026-04-25-deep-audit/.raw/npm-audit.json` (ignore exit code).
Run pip-audit on backend: `backend/.venv/bin/pip-audit --format json >
docs/audits/2026-04-25-deep-audit/.raw/pip-audit.json`.
Run bandit (already in CI but capture JSON):
`backend/.venv/bin/bandit -r backend/app -f json -o
docs/audits/2026-04-25-deep-audit/.raw/bandit-report.json -ll || true`.
Report: count of leaks, count of high/critical CVEs (npm + pip), bandit
high-severity count.
```

**Sub-agent C — Code structure metrics:**

```
Run madge for circular deps in frontend:
`/tmp/audit-node/node_modules/.bin/madge --circular --json
/home/julien/libre-q/frontend/src >
/home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/madge-circular.json`.
Run pydeps for backend dep graph:
`/tmp/audit-venv/bin/pydeps /home/julien/libre-q/backend/app --max-bacon=2
--cluster --noshow -o
/home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/pydeps-graph.svg
|| true`.
Run knip for dead exports:
`cd /home/julien/libre-q/frontend &&
/tmp/audit-node/node_modules/.bin/knip --reporter json >
../docs/audits/2026-04-25-deep-audit/.raw/knip-report.json || true`.
Run radon (already in CI, capture json):
`backend/.venv/bin/radon cc backend/app -j >
docs/audits/2026-04-25-deep-audit/.raw/radon-cc.json`.
Report: circular deps count, top-5 highest-complexity functions, knip dead
export count.
```

**Sub-agent D — Documentation & links:**

```
Run interrogate on backend:
`/tmp/audit-venv/bin/interrogate -v backend/app >
docs/audits/2026-04-25-deep-audit/.raw/interrogate-coverage.txt`.
Run lychee on all .md files (excluding library/, node_modules/, .venv/):
`lychee --no-progress --format json
$(find /home/julien/libre-q -name "*.md" -not -path "*/node_modules/*"
-not -path "*/.venv/*" -not -path "*/library/*") >
/home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/lychee-links.json
|| true`.
Validate CITATION.cff if present:
`/tmp/audit-venv/bin/cffconvert --validate -i /home/julien/libre-q/CITATION.cff >
docs/audits/2026-04-25-deep-audit/.raw/citation-validation.txt 2>&1 || echo
"CITATION.cff missing or invalid" >>
docs/audits/2026-04-25-deep-audit/.raw/citation-validation.txt`.
Report: docstring coverage %, broken links count, citation valid yes/no.
```

**Sub-agent E — Frontend a11y + perf (requires browser):**

```
Start the dev server: `cd /home/julien/libre-q && make run-frontend &` and
wait for http://localhost:5173 to respond (max 30s).
Run axe-core on 3 key pages (landing, /admin, sample participant Q-sort URL
from seed):
`/tmp/audit-node/node_modules/.bin/axe http://localhost:5173 --save
/home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/axe-landing.json`
(repeat for each URL with appropriate filenames).
Run lighthouse on the same 3 pages, both desktop and mobile:
`/tmp/audit-node/node_modules/.bin/lighthouse <url> --output=json
--output-path=docs/audits/2026-04-25-deep-audit/.raw/lighthouse-{page}.{form-factor}.json
--quiet --chrome-flags="--headless"`.
Stop the dev server.
Report: axe violation count per page (critical only), lighthouse
performance/a11y/best-practices scores per page.
```

**Sub-agent F — Q-methodology Layer 1 reference run:**

```
This is the first part of axis 06's deep validation. Identify Qualis's
factor analysis entry point in
`backend/app/services/analysis_service.py`. Locate the seed dataset(s) under
`backend/seed*` or `data/`. For each available dataset, run Qualis's analysis
and capture full intermediate state (correlation matrix, loadings, flagging,
z-scores, factor scores, distinguishing/consensus statements) to JSON in
`.raw/qmethod-libre-q-{dataset}.json`.

If R + qmethod package is available locally, run Zabala's qmethod on the same
dataset and capture intermediates to `.raw/qmethod-zabala-{dataset}.json`. If
not, document the gap in `.raw/qmethod-comparison-NOTE.txt` and stop after
the Qualis run. Do not attempt to install R if not present.

Report: which datasets were available, which intermediates were captured,
whether qmethod-R was available for comparison.
```

- [ ] **Step 3: Wait for all 6 sub-agents to complete**

(Parallel agent dispatch returns when all complete. Aggregate the 6 reports.)

- [ ] **Step 4: Verify expected raw outputs exist**

```bash
ls -la /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/ | wc -l
ls /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/
```

Expected: ≥15 files. If any sub-agent reported missing tool, install and re-run that agent.

- [ ] **Step 5: Write `.raw/README.md` index of raw outputs**

Document each file: which axis(es) consume it, which command produced it,
when it was generated. Format: small table.

- [ ] **Step 6: Commit Wave 1 completion marker**

```bash
cd /home/julien/libre-q
git add docs/audits/2026-04-25-deep-audit/.raw/README.md
git commit -m "audit(wave1): tool outputs captured to .raw (gitignored), index committed"
```

(The `.raw/` directory itself is gitignored; only the README index is committed
so the user can see what was captured.)

---

## Task 3: Axis 01 — Security (deep-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/01-security.md`
- Read: `.raw/gitleaks-report.json`, `.raw/npm-audit.json`, `.raw/pip-audit.json`, `.raw/bandit-report.json`
- Read: `backend/app/auth.py`, `backend/app/routers/auth.py`, `backend/app/middleware/`, `backend/app/services/export_service.py`, `backend/app/services/storage_service.py`, `backend/app/limiter.py`

- [ ] **Step 1: Dispatch security audit sub-agent (deep-pass, 90min budget)**

Use the sub-agent dispatch pattern with these axis-specific instructions:

```
Axis NN = 01, name = "Security & RGPD", pass = deep, budget = 90 minutes.

RAW INPUTS:
- .raw/gitleaks-report.json (secrets in git history)
- .raw/npm-audit.json, .raw/pip-audit.json (dependency CVEs)
- .raw/bandit-report.json (Python static security analysis)

MANUAL REVIEW (read these files top-to-bottom):
1. backend/app/auth.py — JWT generation, refresh, secret rotation
2. backend/app/routers/auth.py — login flow, 2FA, resume codes
3. backend/app/dependencies.py — auth dependencies, role checks
4. backend/app/limiter.py — rate limiting setup
5. backend/app/middleware/ — all files (CORS, headers, etc.)
6. backend/app/routers/admin/ — authz per role on admin endpoints
7. backend/app/services/export_service.py — what fields go into exports;
   does it leak PII or other-user data?
8. backend/app/services/storage_service.py + audio.py — upload validation,
   path traversal, content-type checks

CHECKS TO PERFORM:
- Secrets: any in git history (gitleaks), in current code (`grep -r
  "password\|secret\|api_key\|token"` excluding .venv, node_modules), in env
  templates committed
- Auth: JWT secret source (env? hardcoded fallback?), expiration, refresh
  semantics, 2FA bypass paths, resume code unguessability (entropy)
- Authz: every admin/* endpoint requires admin role? participant endpoints
  scoped to participant?
- CORS: allow-list explicit, no wildcard in prod
- Rate limiting: applied to login, password reset, registration?
- Exports: does the GET /exports endpoint leak across studies/users? Audio
  exports — signed URLs or raw S3?
- RGPD: data subject access (art. 15), erasure (art. 17), retention policy,
  breach detection
- Headers: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
  HSTS (in prod config)
- Dependencies: any high/critical CVE in npm-audit or pip-audit

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/01-security.md

FORMAT: per the audit plan §"Finding Format". Start IDs at F-01-001.

Severity guidance for this axis:
- blocker: hardcoded prod secret, broken authz, RGPD non-compliance, data
  leak in exports, critical CVE in deployed code
- major: missing rate limit on auth, CORS wildcard, exploitable input
  validation gap, high CVE not mitigated
- minor: missing security header in non-critical context, deprecated dep
  with low CVE
- observation: defense-in-depth gap with no current exploit
```

- [ ] **Step 2: Wait for sub-agent and verify output file exists**

```bash
ls -la /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/01-security.md
```

- [ ] **Step 3: Sanity-check the file (count findings by severity)**

```bash
grep -c "Severity: blocker" docs/audits/2026-04-25-deep-audit/01-security.md
grep -c "Severity: major"   docs/audits/2026-04-25-deep-audit/01-security.md
grep -c "Severity: minor"   docs/audits/2026-04-25-deep-audit/01-security.md
```

- [ ] **Step 4: If any blocker found, surface it now (do not wait until Wave 3)**

If `Severity: blocker` count > 0, print the blocker titles and IDs to the
user and ask whether to continue Wave 2 or pause for immediate triage.

- [ ] **Step 5: Commit axis 01 output**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/01-security.md
git -C /home/julien/libre-q commit -m "audit(01-security): {N} findings ({A} blocker, {B} major, {C} minor)"
```

---

## Task 4: Axis 02 — Code Quality (light-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/02-code-quality.md`
- Read: `.raw/ci-full-output.log` (ruff, mypy sections), `.raw/radon-cc.json`, `.raw/knip-report.json`

- [ ] **Step 1: Dispatch code quality sub-agent (light-pass, 30min budget)**

```
Axis NN = 02, name = "Code Quality", pass = light, budget = 30 minutes.

RAW INPUTS:
- .raw/ci-full-output.log (ruff, mypy, biome, tsc sections)
- .raw/radon-cc.json (cyclomatic complexity)
- .raw/knip-report.json (dead exports frontend)

MANUAL REVIEW (light — only structural issues):
- Top 5 functions by complexity in radon-cc.json: are they essential
  complexity (e.g., factor analysis algorithm) or accidental? Read each
  briefly.
- Knip top dead exports: are they truly unused or used dynamically?
- mypy/tsc errors: count, severity grouping (any `Any` proliferation in
  TypeScript despite the project rule?)

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/02-code-quality.md

FORMAT: per the audit plan §"Finding Format". Start IDs at F-02-001.

Severity guidance:
- blocker: none expected for this axis (escalate to F-03 if structural)
- major: top complexity hotspot in critical path with no tests
- minor: dead exports, lint warnings clusters
- observation: stylistic patterns

LIGHT-PASS LIMIT: do not produce more than 10 findings. If you would
produce more, group into thematic findings instead.
```

- [ ] **Step 2: Verify output and commit**

```bash
ls docs/audits/2026-04-25-deep-audit/02-code-quality.md
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/02-code-quality.md
git -C /home/julien/libre-q commit -m "audit(02-code-quality): {N} findings (light-pass)"
```

---

## Task 5: Axis 03 — Architecture (standard-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/03-architecture.md`
- Read: `.raw/pydeps-graph.svg`, `.raw/madge-circular.json`
- Read: `backend/app/main.py`, `backend/app/routers/*`, `backend/app/services/*`, `backend/app/models.py`, `backend/app/schemas/`, `frontend/src/store/`, `frontend/src/api/generated.ts` (just structure), `frontend/src/components/admin/`, `frontend/src/components/participant/` (if exists)

- [ ] **Step 1: Dispatch architecture sub-agent (standard-pass, 60min budget)**

```
Axis NN = 03, name = "Architecture", pass = standard, budget = 60 minutes.

RAW INPUTS:
- .raw/pydeps-graph.svg (backend module dependency graph)
- .raw/madge-circular.json (frontend circular deps)

MANUAL REVIEW:
1. Backend layering: read backend/app/main.py and trace one request through
   router → service → model. Are layers respected? Or do routers bypass
   services to call models directly?
2. Service granularity: read each service in backend/app/services/. Single
   responsibility? Or some are "god services" doing many things (e.g.,
   study_service handles everything study-related)?
3. Schema coherence: pick 3 core entities (Study, Statement, Submission).
   Compare backend/app/models.py ↔ backend/app/schemas/ ↔
   frontend/src/api/generated.ts. Field names consistent? Optionals match?
4. Frontend state: walk frontend/src/store/. Is Zustand store organized
   per domain or as one big store? How do hooks interact with store and
   API?
5. Cross-cutting concerns (logging, error handling, transactions): one
   pattern or many?

CHECKS TO PERFORM:
- Circular deps in frontend (madge-circular.json) — count + locations
- Backend import cycles — read pydeps output
- Routers calling models directly (skipping service layer) — grep for
  this pattern
- Services importing each other — note cross-service deps
- Schema drift between backend Pydantic and frontend TS

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/03-architecture.md

FORMAT: per the audit plan §"Finding Format". Start IDs at F-03-001.

Severity guidance:
- blocker: import cycle that breaks deployment
- major: god-object service that prevents testability of critical features
- minor: layering violation in non-critical path
- observation: pattern that could be improved post-submission

Apply the causal grouping rule: if architecture causes a tests problem and
a perf problem, the parent finding is in F-03 (architecture); F-04 and F-08
get cross-references only.
```

- [ ] **Step 2: Verify and commit**

```bash
ls docs/audits/2026-04-25-deep-audit/03-architecture.md
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/03-architecture.md
git -C /home/julien/libre-q commit -m "audit(03-architecture): {N} findings"
```

---

## Task 6: Axis 04 — Tests (deep-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/04-tests.md`
- Read: `.raw/pytest-coverage.xml`, `.raw/vitest-results.json`, `.raw/mutmut-results.txt` (will be generated in Step 1)
- Read: `backend/tests/` (all files), `frontend/src/**/*.test.{ts,tsx}` (sample critical ones)

- [ ] **Step 1: Run mutmut on the analysis service (Wave 1 may not have completed it)**

```bash
cd /home/julien/libre-q/backend && \
/tmp/audit-venv/bin/mutmut run \
  --paths-to-mutate=app/services/analysis_service.py \
  --runner="../backend/.venv/bin/pytest tests/" \
  --no-progress 2>&1 | tee \
  /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/mutmut-results.txt
```

If mutmut takes >15min, kill it (`Ctrl-C`) and capture the partial results
— a partial mutation score is still informative.

- [ ] **Step 2: Dispatch tests audit sub-agent (deep-pass, 90min budget)**

```
Axis NN = 04, name = "Tests", pass = deep, budget = 90 minutes.

RAW INPUTS:
- .raw/pytest-coverage.xml (backend coverage by file)
- .raw/vitest-results.json (frontend coverage)
- .raw/mutmut-results.txt (mutation score for analysis_service.py)

MANUAL REVIEW (deep — read tests, do not just measure):
1. Backend critical-path tests (verified locations):
   - backend/tests/unit/test_analysis_service.py
   - backend/tests/integration/test_analysis.py
   - backend/tests/ (search for test_auth*, test_submission*,
     test_export* — exact subdirs may vary)
   For each: do the assertions check actual values, or just "no exception"?
   Are mocks used to mock the thing being tested (anti-pattern)?
2. Frontend critical components: tests for participant Q-sort interaction,
   factor display, admin study editor.
3. e2e: are there Playwright tests for the participant flow? For admin
   onboarding?
4. Test fragility: count of tests using `time.sleep`, hardcoded ports, mock
   patches at suspicious depths (e.g., patching `service.method` instead
   of `service.dependency`).

CHECKS TO PERFORM:
- Coverage % per critical file (analysis_service, submission_service,
  auth.py, export_service)
- Files with <50% coverage that are in critical path
- Mutation score on analysis_service from mutmut
- Mocks of the unit under test (search for patterns like
  `mock.patch.object(analysis_service, 'analyze')`)
- Tests that assert nothing (search for `def test_` followed by no
  `assert`)
- Coverage of e2e for participant flow

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/04-tests.md

FORMAT: per the audit plan §"Finding Format". Start IDs at F-04-001.

Severity guidance:
- blocker: critical-path file at <30% coverage, OR mutation score
  <40% on analysis service, OR mocks-the-unit-under-test in critical
  service test
- major: critical-path coverage 30-60%, fragile e2e, missing test for a
  documented feature
- minor: medium-path coverage gap, fragile unit test
- observation: coverage gaps in non-critical utilities
```

- [ ] **Step 3: Verify and commit**

```bash
ls docs/audits/2026-04-25-deep-audit/04-tests.md
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/04-tests.md
git -C /home/julien/libre-q commit -m "audit(04-tests): {N} findings ({A} blocker, {B} major)"
```

---

## Task 7: Axis 05 — Data & Migrations (standard-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/05-data-and-migrations.md`
- Read: `backend/app/models.py`, `backend/alembic/versions/*` (full chain), `backend/scripts/check_relationships.py`

- [ ] **Step 1: Generate ORM ↔ DB ↔ Alembic diff to .raw**

```bash
cd /home/julien/libre-q/backend && \
.venv/bin/alembic check 2>&1 | tee \
  /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/alembic-check.log
.venv/bin/python scripts/check_relationships.py 2>&1 | tee \
  /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/check-relationships.log
```

- [ ] **Step 2: Dispatch data & migrations sub-agent (standard, 60min)**

```
Axis NN = 05, name = "Data & Migrations", pass = standard, budget = 60 min.

RAW INPUTS:
- .raw/alembic-check.log (model ↔ migration drift)
- .raw/check-relationships.log (orphans, FK integrity)

MANUAL REVIEW:
1. Read backend/app/models.py end to end. Note every foreign key, unique
   constraint, index, cascade behavior, nullable+default combinations.
2. Walk the Alembic migration chain (already documented in CLAUDE.md):
   initial_schema → rename_randomize → remove_consent_buttons →
   add_pre_instruction → add_is_test_run → add_audio_recordings_table.
   For each: any data-loss risk (column drops without backup, constraint
   tightening on existing data)?
3. Check seed (backend/seed.py or seed*.py): does it produce a coherent
   state matching current models?
4. Check init_db.py reset path: idempotent? safe to re-run?

CHECKS TO PERFORM:
- Drift between models.py and migrations (alembic check output)
- Orphan rows possible? (check_relationships.py)
- Missing unique constraints on natural keys (e.g., study slug, user
  email)
- Missing indexes on FK columns used in joins
- Cascade behavior consistent with intent (delete vs set-null vs
  restrict)
- Migration chain idempotency (re-running initial_schema doesn't break)

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/05-data-and-migrations.md
IDs from F-05-001.

Severity:
- blocker: data loss risk in deployed migration, broken FK in production
- major: missing unique constraint causing semantic ambiguity, missing
  cascade causing leaks
- minor: missing index, suboptimal default
- observation: schema evolution opportunity
```

- [ ] **Step 3: Verify and commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/05-data-and-migrations.md
git -C /home/julien/libre-q commit -m "audit(05-data): {N} findings"
```

---

## Task 8: Axis 06 — Critical Q-Methodology Validity (deep-pass, longest)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/06-q-methodology-validity.md`
- Read: `backend/app/services/analysis_service.py` (full file, multiple times)
- Read: `.raw/qmethod-libre-q-*.json`, `.raw/qmethod-zabala-*.json` (if available)
- Reference: papis library `q-methodology` (use papis tools to read papers)

- [ ] **Step 1: Verify Wave 1 sub-agent F produced the Layer 1 outputs**

```bash
ls /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/qmethod-*
cat /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/qmethod-comparison-NOTE.txt 2>/dev/null
```

If qmethod-zabala-*.json missing (R not available), document this in the
finding file as a limitation (cannot do Layer 2 cross-tool comparison) but
do not block the rest.

- [ ] **Step 2: Generate edge-case datasets if not in seed**

If the seed lacks bipolar / confounded / forced-vs-unforced variants,
construct minimal synthetic ones (8-15 statements, 6-10 participants) and
save to `.raw/synthetic-datasets/{case}.csv`. Document the construction.

- [ ] **Step 3: Run Qualis analysis on each synthetic dataset, capture intermediates**

```bash
cd /home/julien/libre-q/backend && \
for case in bipolar confounded forced unforced; do
    .venv/bin/python -c "
from app.services.analysis_service import {entry_point};
import json;
result = {entry_point}(load('../docs/audits/2026-04-25-deep-audit/.raw/synthetic-datasets/${case}.csv'));
json.dump(result.full_intermediates(), open(
    '../docs/audits/2026-04-25-deep-audit/.raw/qmethod-libre-q-${case}.json',
    'w'
), default=str, indent=2)
"
done
```

(Pseudocode — adapt to actual entry point signature in
analysis_service.py. The sub-agent may need to write a small driver
script first.)

- [ ] **Step 4: Dispatch Q-methodology audit sub-agent (deep-pass, 120min)**

```
Axis NN = 06, name = "Critical Q-Methodology Validity", pass = deep,
budget = 120 minutes.

CONTEXT: Read spec §3a in
docs/superpowers/specs/2026-04-25-deep-code-audit-design.md before starting.
This axis uses three layers: (1) multi-dataset coverage, (2) intermediates
comparison, (3) interpretive stability test. Qualis's positioning is
critical Q-methodology, not classical Q — see
~/.claude/projects/-home-julien-libre-q/memory/project_critical_q_orientation.md.

RAW INPUTS:
- .raw/qmethod-libre-q-{case}.json for each case (correlations, loadings,
  flagging, z-scores, factor scores, distinguishing/consensus)
- .raw/qmethod-zabala-{case}.json if available (R reference)
- .raw/synthetic-datasets/{case}.csv

EXTERNAL LITERATURE (already in papis library `q-methodology`):
- Sneegas 2020 — Making the Case for Critical Q Methodology
- Stainton Rogers 1997 — Going Critical
- Stenner 2011 — Qualiquantology
- Watts & Stenner 2012 — Doing Q Methodological Research (book)
- Robbins & Krueger 2000 — Beyond Bias?
Use papis tools to read these as needed:
`papis -l q-methodology list 'critical-Q'` to find them, then
`papis -l q-methodology open <ref>` to read.

MANUAL REVIEW:
1. Read backend/app/services/analysis_service.py end to end. Identify:
   - Extraction method (PCA? centroid? both exposed?)
   - Rotation method (varimax fixed? manual rotation supported?)
   - Flagging logic (significance threshold? automatic vs manual?)
   - Sign polarity convention (how sign of factor scores is decided post-
     rotation)
   - Computed intermediates exposed to caller / DB / API
2. For each layer:
   - Layer 1: For each dataset, does Qualis produce a coherent result?
     Run completes, intermediates make sense (correlations bounded
     [-1, 1], loadings, z-scores normalized)?
   - Layer 2: Compare Qualis intermediates to qmethod-R per dataset.
     Tolerances: correlations ±0.001, loadings ±0.01 after sign
     alignment, z-scores ±0.01, flagging decisions ≥95% agreement.
     ANY divergence → finding (severity depends on magnitude and
     downstream impact).
   - Layer 3: For one dataset, vary flagging threshold (0.30 / 0.40 / 0.50)
     and re-run. Do distinguishing statements change? If yes → not a bug
     but a transparency requirement: Qualis must surface this to user.
3. Critical Q compatibility check:
   - Is manual rotation supported? If only varimax, this is a major
     finding for critical Q practice.
   - Is the factor-naming step transparent (researcher sees and edits)?
   - Are post-sort interview / audio recording features integrated with
     analysis (linkable to factors)?
   - Does the export expose all intermediates a critical Q researcher
     would want to discuss in their methods section (loadings table,
     flagging table, z-scores)?

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/06-q-methodology-validity.md
IDs from F-06-001.

Severity:
- blocker: incorrect factor analysis output (numerically wrong vs
  qmethod-R beyond tolerance), missing critical-Q-essential feature
  (e.g., no transparency on flagging decisions in admin UI/export)
- major: divergence from reference at acceptable tolerance but unflagged
  to user, missing manual rotation, missing audit trail for analytical
  choices
- minor: cosmetic differences in output, non-critical option missing
- observation: critical Q literature suggests evolution path

Anti-pattern reminder: do not classify "Qualis does X differently from
PQMethod" as major if the difference is defensible in critical Q
literature. Cite the literature.
```

- [ ] **Step 5: Verify, surface any blocker immediately**

```bash
ls docs/audits/2026-04-25-deep-audit/06-q-methodology-validity.md
grep "Severity: blocker" docs/audits/2026-04-25-deep-audit/06-q-methodology-validity.md
```

If a blocker is found, this is the most critical type for SoftwareX —
report to user immediately with full finding text.

- [ ] **Step 6: Commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/06-q-methodology-validity.md
git -C /home/julien/libre-q commit -m "audit(06-qmethod): {N} findings ({A} blocker, {B} major) — Layer 1/2/3 validation"
```

---

## Task 9: Axis 07 — Frontend / UX (standard-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/07-frontend-ux.md`
- Read: `.raw/axe-*.json`, `.raw/lighthouse-*.{desktop,mobile}.json`, `frontend/public/locales/{en,fr,fi}/*.json`

- [ ] **Step 1: Run i18n-check extended scan**

```bash
cd /home/julien/libre-q/frontend && \
npm run i18n-check 2>&1 | tee \
  ../docs/audits/2026-04-25-deep-audit/.raw/i18n-check.log
```

Then a quick custom check for "values identical across locales" (a
common bug — fr keys with English values):

```bash
python3 - <<'EOF' > /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/i18n-identical-values.txt
import json, glob
locales = {}
for path in glob.glob('/home/julien/libre-q/frontend/public/locales/*/'):
    locale = path.rstrip('/').split('/')[-1]
    locales[locale] = {}
    for f in glob.glob(path + '*.json'):
        ns = f.split('/')[-1].replace('.json','')
        locales[locale][ns] = json.load(open(f))

def flat(d, prefix=''):
    out = {}
    for k, v in d.items():
        full = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict): out.update(flat(v, full))
        else: out[full] = v
    return out

en_flat = {ns: flat(d) for ns, d in locales['en'].items()}
fr_flat = {ns: flat(d) for ns, d in locales.get('fr', {}).items()}
print("=== Keys with identical en/fr values (suspicious) ===")
for ns in en_flat:
    if ns not in fr_flat: continue
    for k, v in en_flat[ns].items():
        if k in fr_flat[ns] and v == fr_flat[ns][k] and len(str(v)) > 3:
            print(f"  {ns}.{k}: {v!r}")
EOF
```

- [ ] **Step 2: Dispatch frontend/UX sub-agent (standard, 60min)**

```
Axis NN = 07, name = "Frontend / UX", pass = standard, budget = 60 min.

RAW INPUTS:
- .raw/axe-{landing,admin,participant}.json (a11y violations)
- .raw/lighthouse-*.{desktop,mobile}.json (perf, a11y, best-practices)
- .raw/i18n-check.log
- .raw/i18n-identical-values.txt (suspicious i18n entries)

MANUAL REVIEW:
1. Use Playwright (already in project) to walk these journeys and note
   issues:
   - Admin onboarding: create study → add concourse → invite participant
   - Participant Q-sort on mobile viewport (375x667): can complete?
     Drag works? Edge scrolling? Statements readable?
   - Recruitment funnel: link generation → participant lands → consent →
     start
2. For each axe violation flagged "critical" or "serious": does it
   block keyboard or screen-reader access on the critical journey?
3. For Lighthouse mobile perf: any score <80 on critical pages?
4. i18n: any user-facing strings hardcoded (grep frontend/src for
   strings outside `t('...')` or `useTranslation`)?

CHECKS TO PERFORM:
- WCAG AA on admin + participant Q-sort (critical, must pass)
- Mobile perf (LCP <4s, CLS <0.1, INP <500ms on participant Q-sort)
- i18n parity en/fr/fi: missing keys per locale
- i18n suspicious identical values (en==fr beyond stop-words)
- Hardcoded user-facing strings outside t() calls

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/07-frontend-ux.md
IDs from F-07-001.

Severity:
- blocker: critical journey unusable on mobile, WCAG AA failure on
  participant Q-sort
- major: WCAG AA failure on admin, perf score <50 mobile, missing i18n
  keys causing fallback to English in fr locale
- minor: WCAG AA failure on non-critical page, perf 50-79
- observation: minor UX friction
```

- [ ] **Step 3: Verify and commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/07-frontend-ux.md
git -C /home/julien/libre-q commit -m "audit(07-frontend-ux): {N} findings"
```

---

## Task 10: Axis 08 — Performance (light-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/08-performance.md`
- Read: `.raw/lighthouse-*.{desktop,mobile}.json`, `.raw/bundle-stats.html` (if produced)

- [ ] **Step 1: Capture backend query profile (light)**

Run the seed setup, then a representative endpoint with SQL echo:

```bash
cd /home/julien/libre-q/backend && \
SQLALCHEMY_ECHO=1 .venv/bin/python -m pytest \
  tests/unit/test_analysis_service.py -v -s 2>&1 | \
  grep -E "SELECT|INSERT|UPDATE" | head -100 > \
  /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/sql-trace-analysis.log
```

(Adapt the test path to one that exercises a realistic flow.)

- [ ] **Step 2: Generate bundle analyzer report**

```bash
cd /home/julien/libre-q/frontend && \
ROLLUP_VISUALIZE=1 npm run build 2>&1 | tail -30 > \
  ../docs/audits/2026-04-25-deep-audit/.raw/build-output.log
mv stats.html ../docs/audits/2026-04-25-deep-audit/.raw/bundle-stats.html 2>/dev/null
```

(If the project doesn't have rollup-plugin-visualizer wired up, skip this
step and note in the finding file that bundle analysis was not available.)

- [ ] **Step 3: Dispatch perf sub-agent (light, 30min)**

```
Axis NN = 08, name = "Performance", pass = light, budget = 30 minutes.

RAW INPUTS:
- .raw/lighthouse-*.{desktop,mobile}.json (perf scores per page)
- .raw/sql-trace-analysis.log (SQL queries during a service call)
- .raw/bundle-stats.html (if available)

LIGHT-PASS LIMIT: max 8 findings. Group by theme (e.g., "N+1 queries in
analysis flow") rather than per-query.

CHECKS TO PERFORM:
- N+1 patterns in SQL trace (same query repeated with different IDs)
- Lighthouse perf score <80 on any critical page
- Bundle size: any chunk >500KB unminified, any vendor lib >200KB
- Code splitting: is admin route lazy-loaded? Participant route lazy-
  loaded?

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/08-performance.md
IDs from F-08-001.

Severity:
- blocker: none expected (perf rarely blocks SoftwareX)
- major: N+1 in analysis pipeline blocking realistic dataset size
- minor: bundle bloat, missing lazy-load
- observation: optimization opportunity
```

- [ ] **Step 4: Verify and commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/08-performance.md
git -C /home/julien/libre-q commit -m "audit(08-performance): {N} findings (light-pass)"
```

---

## Task 11: Axis 09 — Reproducibility (deep-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/09-reproducibility.md`
- Read: `Procfile`, `scalingo.json`, `docker-compose.yml`, `pyproject.toml`, `package.json`, `package-lock.json`, `backend/uv.lock`, `backend/init_db.py`, `backend/scripts/migrate.py`, `Makefile`

- [ ] **Step 1: Test build-from-zero in fresh container**

```bash
cd /home/julien/libre-q && \
docker compose down -v 2>/dev/null; \
docker compose build --no-cache 2>&1 | tee \
  docs/audits/2026-04-25-deep-audit/.raw/docker-build.log
docker compose up -d 2>&1 | tee \
  docs/audits/2026-04-25-deep-audit/.raw/docker-up.log
sleep 30
docker compose ps > docs/audits/2026-04-25-deep-audit/.raw/docker-ps.log
docker compose logs --tail=200 > docs/audits/2026-04-25-deep-audit/.raw/docker-logs.log
docker compose down -v
```

Capture pass/fail clearly.

- [ ] **Step 2: Verify lockfile integrity**

```bash
cd /home/julien/libre-q/backend && \
.venv/bin/uv lock --check 2>&1 | tee \
  ../docs/audits/2026-04-25-deep-audit/.raw/uv-lock-check.log
cd /home/julien/libre-q/frontend && \
npm ci --dry-run 2>&1 | tee \
  ../docs/audits/2026-04-25-deep-audit/.raw/npm-ci-check.log
```

- [ ] **Step 3: Test seed + init_db reset**

```bash
cd /home/julien/libre-q/backend && \
.venv/bin/python init_db.py --reset 2>&1 | tee \
  ../docs/audits/2026-04-25-deep-audit/.raw/init-db-reset.log
.venv/bin/python seed.py 2>&1 | tee \
  ../docs/audits/2026-04-25-deep-audit/.raw/seed-run.log
```

(Use available seed file. If seed needs an argument per CLAUDE.md, note
this and try with the default sample.)

- [ ] **Step 4: Dispatch reproducibility sub-agent (deep, 75min)**

```
Axis NN = 09, name = "Reproducibility", pass = deep, budget = 75 minutes.

RAW INPUTS:
- .raw/docker-build.log, docker-up.log, docker-ps.log, docker-logs.log
- .raw/uv-lock-check.log, npm-ci-check.log
- .raw/init-db-reset.log, seed-run.log

MANUAL REVIEW:
1. Read Procfile, scalingo.json, docker-compose.yml side by side. Same
   service definitions? Drift between deployment manifests?
2. Read backend/pyproject.toml + uv.lock: all deps pinned? Any version
   ranges that could float dangerously?
3. Read frontend/package.json + package-lock.json: same checks.
4. Read backend/init_db.py and scripts/migrate.py: idempotent? Does the
   release-phase migration in Procfile match what's in the script?
5. Env vars: is there a .env.example? Is every var used in the code
   documented somewhere?
6. Read Makefile: does `make install`, `make ci`, `make migrate` cover
   everything a fresh contributor needs?

CHECKS TO PERFORM:
- Docker build from scratch: pass/fail (highest priority)
- Stack starts and serves a request from clean state
- Lock files consistent and complete
- Seed produces a usable demo state
- All env vars documented
- Procfile/Scalingo/Docker Compose semantics aligned

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/09-reproducibility.md
IDs from F-09-001.

Severity:
- blocker: docker build fails, stack does not start, missing required
  env var with no documentation, lockfile broken
- major: install instructions outdated, seed produces broken state,
  drift between deployment manifests
- minor: lockfile missing minor pin, .env.example incomplete
- observation: improvement to onboarding
```

- [ ] **Step 5: Verify, surface blockers immediately**

```bash
ls docs/audits/2026-04-25-deep-audit/09-reproducibility.md
grep "Severity: blocker" docs/audits/2026-04-25-deep-audit/09-reproducibility.md
```

A blocker here is also critical for SoftwareX. Report immediately if found.

- [ ] **Step 6: Commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/09-reproducibility.md
git -C /home/julien/libre-q commit -m "audit(09-reproducibility): {N} findings ({A} blocker)"
```

---

## Task 12: Axis 10 — Documentation (standard-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/10-documentation.md`
- Read: `.raw/interrogate-coverage.txt`, `.raw/lychee-links.json`
- Read: `README.md`, `CLAUDE.md`, `docs/README.md`, `docs/contributing/`, `docs/tutorials/`, `docs/explanation/`, `docs/reference/`, `CITATION.cff`, `LICENSE`

- [ ] **Step 1: Check OpenAPI ↔ code sync**

```bash
cd /home/julien/libre-q && \
make check-api 2>&1 | tee \
  docs/audits/2026-04-25-deep-audit/.raw/openapi-sync.log
```

- [ ] **Step 2: Dispatch documentation sub-agent (standard, 60min)**

```
Axis NN = 10, name = "Documentation", pass = standard, budget = 60 min.

RAW INPUTS:
- .raw/interrogate-coverage.txt (docstring coverage backend)
- .raw/lychee-links.json (broken links in .md)
- .raw/citation-validation.txt
- .raw/openapi-sync.log

MANUAL REVIEW:
1. README.md: covers what, why, how (install, run, contribute)? Has
   screenshot or demo link? Comparison with PQMethod/KADE/Ken-Q
   visible?
2. CLAUDE.md: still accurate vs current code state? (especially the
   migration chain section)
3. docs/contributing/: enough for a new contributor to ship a PR?
4. docs/tutorials/: cover at least the participant flow and a basic
   admin study setup?
5. docs/reference/: any API reference? Up to date?
6. LICENSE: present, AGPL v3 as advertised?
7. CITATION.cff: present (note: was untracked at start of audit), valid?

CHECKS TO PERFORM:
- README has all SoftwareX-relevant sections
- Docstring coverage on public services (target: 80%+ on backend/app/services)
- No broken internal links
- OpenAPI generated client up to date with backend
- License headers present in source files (or top-level LICENSE
  sufficient per AGPL practice)

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/10-documentation.md
IDs from F-10-001.

Severity:
- blocker: missing LICENSE, missing CITATION.cff
- major: README missing SoftwareX-required section, docstring coverage
  <30% on services, broken links in published docs
- minor: docstring coverage 30-70%, outdated CLAUDE.md section
- observation: docs evolution opportunity
```

- [ ] **Step 3: Verify and commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/10-documentation.md
git -C /home/julien/libre-q commit -m "audit(10-documentation): {N} findings"
```

---

## Task 13: Axis 11 — Observability (light-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/11-observability.md`
- Read: `backend/app/main.py` (logging setup), `backend/app/middleware/`, `backend/app/routers/logs.py`

- [ ] **Step 1: Grep for logging patterns**

```bash
cd /home/julien/libre-q && \
echo "=== print() calls in backend ===" > \
  docs/audits/2026-04-25-deep-audit/.raw/observability-grep.txt
grep -rn "print(" backend/app | grep -v "#" >> \
  docs/audits/2026-04-25-deep-audit/.raw/observability-grep.txt
echo "=== console.log in frontend ===" >> \
  docs/audits/2026-04-25-deep-audit/.raw/observability-grep.txt
grep -rn "console\." frontend/src --include="*.ts" --include="*.tsx" \
  | grep -v "//" >> \
  docs/audits/2026-04-25-deep-audit/.raw/observability-grep.txt
echo "=== logger.exception calls in backend ===" >> \
  docs/audits/2026-04-25-deep-audit/.raw/observability-grep.txt
grep -rn "logger\.\(exception\|error\|warning\|info\)" backend/app >> \
  docs/audits/2026-04-25-deep-audit/.raw/observability-grep.txt
```

- [ ] **Step 2: Dispatch observability sub-agent (light, 30min)**

```
Axis NN = 11, name = "Observability", pass = light, budget = 30 min.

RAW INPUTS:
- .raw/observability-grep.txt (print/console/logger occurrences)

MANUAL REVIEW (light):
- Read backend/app/main.py: structured logging configured? JSON output
  for production?
- Read backend/app/routers/logs.py: what does it expose? Admin-only?
  Does it provide an audit trail (who changed what)?
- Sample 3 critical services (analysis, submission, export): are errors
  logged with context?

LIGHT-PASS LIMIT: max 6 findings.

CHECKS TO PERFORM:
- print() in production code paths (backend) — should be logger
- console.log in production code paths (frontend) — should be removed
- Absence of structured logging in critical services
- No audit trail for admin operations (study edit, user invite, role
  change)

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/11-observability.md
IDs from F-11-001.

Severity:
- blocker: none expected
- major: no audit trail for security-relevant admin ops, no error
  reporting in prod
- minor: print/console residues, unstructured logs
- observation: observability evolution
```

- [ ] **Step 3: Verify and commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/11-observability.md
git -C /home/julien/libre-q commit -m "audit(11-observability): {N} findings (light-pass)"
```

---

## Task 14: Axis 12 — Submission Package + SoftwareX Compliance (deep-pass)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/12-submission-package.md`
- Read: `README.md`, `CITATION.cff`, `LICENSE`, `package.json` (versions), `pyproject.toml` (versions)
- WebFetch: SoftwareX Guide for Authors

- [ ] **Step 1: Fetch SoftwareX Guide for Authors and JOSS criteria**

```bash
# Save reference URLs to consult
cat > /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/journal-criteria-refs.txt <<'EOF'
SoftwareX Guide for Authors:
https://www.sciencedirect.com/journal/softwarex/publish/guide-for-authors
JOSS review criteria (parallel reference):
https://joss.readthedocs.io/en/latest/review_criteria.html
EOF
```

The sub-agent will WebFetch these.

- [ ] **Step 2: Check repo state (frozen version readiness)**

```bash
cd /home/julien/libre-q && \
echo "=== Current tags ===" > \
  docs/audits/2026-04-25-deep-audit/.raw/repo-state.txt
git tag -l >> docs/audits/2026-04-25-deep-audit/.raw/repo-state.txt
echo "=== Current version files ===" >> \
  docs/audits/2026-04-25-deep-audit/.raw/repo-state.txt
grep -h "version" backend/pyproject.toml frontend/package.json \
  CITATION.cff 2>/dev/null >> \
  docs/audits/2026-04-25-deep-audit/.raw/repo-state.txt
echo "=== Zenodo metadata? ===" >> \
  docs/audits/2026-04-25-deep-audit/.raw/repo-state.txt
ls -la .zenodo.json 2>/dev/null && \
  echo ".zenodo.json present" >> \
  docs/audits/2026-04-25-deep-audit/.raw/repo-state.txt || \
  echo ".zenodo.json missing" >> \
  docs/audits/2026-04-25-deep-audit/.raw/repo-state.txt
```

- [ ] **Step 3: Dispatch submission package sub-agent (deep, 75min)**

```
Axis NN = 12, name = "Submission Package + SoftwareX Compliance", pass =
deep, budget = 75 min.

CONTEXT: Read spec §3b in
docs/superpowers/specs/2026-04-25-deep-code-audit-design.md before starting.
Two tracks: compliance (mechanical) and package readiness (reviewer
perspective).

RAW INPUTS:
- .raw/repo-state.txt (versions, tags, Zenodo)
- .raw/citation-validation.txt
- .raw/journal-criteria-refs.txt (URLs for WebFetch)
- .raw/openapi-sync.log

EXTERNAL FETCH:
- WebFetch the SoftwareX Guide for Authors URL above
- WebFetch the JOSS review criteria URL above
- Also WebFetch 1-2 recently published SoftwareX papers in similar
  domain (qualitative methods software, social science research tool)
  to gauge current bar

MANUAL REVIEW (compliance track):
- LICENSE: present, OSI-approved (AGPL v3 is OSI), correct copyright
- CITATION.cff: present, valid (cffconvert), authors list correct,
  version matches package version
- README sections required by SoftwareX: title, statement of need,
  installation, usage example, software description (architecture),
  contribution, citation, license, acknowledgments
- Public GitHub repo: branch protection, issue templates, CONTRIBUTING
- Tagged version matching submitted manuscript
- Zenodo: archive linked, DOI obtained
- OpenAPI / API docs published

MANUAL REVIEW (package readiness — reviewer perspective):
- Open the GitHub repo with fresh eyes: is the entry point obvious in
  the first 10 seconds?
- Statement of need: is Qualis's contribution clear? Is the critical Q
  positioning explicit?
- Comparison to alternatives: explicit table comparing PQMethod, KADE,
  Ken-Q, qmethod-R, htmlQ. Does it exist? Is it accurate?
- Install from zero: a reviewer with no prior knowledge would succeed?
  Time to first running instance?
- Frozen submitted version: tag exists matching what the manuscript
  describes? Reproducible?
- Reproducibility of any claim in manuscript: data + scripts available?

OUTPUT FILE: docs/audits/2026-04-25-deep-audit/12-submission-package.md
IDs from F-12-001.

Severity:
- blocker: missing LICENSE/CITATION/README required section, no tagged
  version, no Zenodo archive, install fails for a reviewer
- major: weak statement of need, missing comparison to alternatives,
  drift between tagged version and manuscript description, README does
  not match SoftwareX template exactly
- minor: minor formatting issues, README section ordering
- observation: enhancement for next submission round
```

- [ ] **Step 4: Verify, surface blockers immediately (highest priority for deadline)**

```bash
ls docs/audits/2026-04-25-deep-audit/12-submission-package.md
grep "Severity: blocker" docs/audits/2026-04-25-deep-audit/12-submission-package.md
```

Any blocker here is a desk-reject risk. Surface to user with full text.

- [ ] **Step 5: Commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/12-submission-package.md
git -C /home/julien/libre-q commit -m "audit(12-submission): {N} findings ({A} blocker, {B} major)"
```

---

## Task 15: Cross-Axis Synthesis (Wave 3 part 1)

**Files:**
- Read: all `0X-*.md` files (01-12)
- Modify: any of the 12 files where causal grouping needs adjustment (parent finding moves to true root cause axis)

- [ ] **Step 1: Aggregate findings into a single working table**

```bash
cd /home/julien/libre-q/docs/audits/2026-04-25-deep-audit && \
echo "axis|id|severity|audience|title" > .raw/all-findings.csv
for f in 01-*.md 02-*.md 03-*.md 04-*.md 05-*.md 06-*.md 07-*.md \
         08-*.md 09-*.md 10-*.md 11-*.md 12-*.md; do
    axis=$(echo "$f" | cut -d- -f1)
    awk -v axis="$axis" '
        /^### F-/ { id = $2; gsub(":","",id); title = substr($0, index($0,$3)) }
        /^- \*\*Severity:\*\*/ { sev = $3 }
        /^- \*\*Audience:\*\*/ { aud = substr($0, index($0,$3)) }
        /^- \*\*Recommendation:\*\*/ { print axis"|"id"|"sev"|"aud"|"title }
    ' "$f" >> .raw/all-findings.csv
done
wc -l .raw/all-findings.csv
```

- [ ] **Step 2: Identify transverse findings (same root cause across axes)**

Read the aggregated CSV + browse the 12 files. For each candidate
duplicate, decide:
- Is this the same root cause? If yes: keep parent in primary axis (the
  one where the cause originates), demote others to cross-references
  (`see F-XX-NNN`).
- Are these distinct issues that happen to share a symptom? If yes: leave
  as-is, but add a `[related: F-XX-NNN]` cross-reference.

Edit the affected files to apply the demotion.

- [ ] **Step 3: Verify uniform format compliance**

```bash
cd /home/julien/libre-q/docs/audits/2026-04-25-deep-audit
for f in 01-*.md 02-*.md 03-*.md 04-*.md 05-*.md 06-*.md 07-*.md \
         08-*.md 09-*.md 10-*.md 11-*.md 12-*.md; do
    bad=$(grep -c "TBD\|TODO" "$f")
    if [ "$bad" -gt 0 ]; then
        echo "WARN: $f has $bad TBD/TODO markers"
    fi
done
```

If any file has TBD/TODO, dispatch a small fix sub-agent to resolve them
(per spec definition-of-done #3).

- [ ] **Step 4: Commit synthesis adjustments**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/0*-*.md
git -C /home/julien/libre-q commit -m "audit(synthesis): apply causal grouping, resolve TBDs"
```

---

## Task 16: Executive Summary (Wave 3 part 2)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/00-executive-summary.md`

- [ ] **Step 1: Compute aggregate metrics**

From `.raw/all-findings.csv`, compute:
- Total findings count
- Counts by severity (blocker / major / minor / observation)
- Counts by audience
- Counts by axis
- Cumulative effort by severity (S=0.5, M=2, L=4, XL=8 hours)

- [ ] **Step 2: Write executive summary using this template**

Create `00-executive-summary.md` with these sections (all required, no TBD):

```markdown
# Qualis Deep Code Audit — Executive Summary

**Date:** 2026-04-25
**Auditor:** Claude Opus 4.7 + Codex review + sub-agents per axis
**Spec:** `docs/superpowers/specs/2026-04-25-deep-code-audit-design.md`
**Plan:** `docs/superpowers/plans/2026-04-25-deep-code-audit.md`

## Verdict

### SoftwareX submission (deadline 2026-05-14)

**Status:** 🟢 Submission-ready | 🟡 Submission-ready with conditions | 🔴 Not ready

[3-4 sentences justifying the status. Cite top blockers and majors by ID.
If 🟡, list the conditions explicitly.]

### Production deployment

**Status:** 🟢 | 🟡 | 🔴

[3-4 sentences. Cite security and reproducibility blockers.]

### Long-term maintainability

| Dimension | Score (1-5) |
|-----------|-------------|
| Architecture | X |
| Testability | X |
| Readability / coherence | X |
| Contributor documentation | X |
| Forecast velocity | X |

[3-4 sentences explaining the scores.]

## Top findings

### Blockers (must fix before submission)
[List all blockers, format: `- **F-XX-NNN** ({axis}, effort {S/M/L/XL}) — {title}`]

### Top 5 majors (high priority)
[List 5 highest-impact majors, same format]

## Findings by axis

| Axis | Pass | Blocker | Major | Minor | Observation |
|------|------|---------|-------|-------|-------------|
| 01 Security | deep | X | X | X | X |
| ... | ... | ... | ... | ... | ... |

## Findings by audience

| Audience | Blocker | Major | Minor | Observation |
|----------|---------|-------|-------|-------------|
| SoftwareX | X | X | X | X |
| Prod | X | X | X | X |
| Maintenance | X | X | X | X |

## Cumulative effort estimate

| Severity | Count | Total effort (hours) |
|----------|-------|-----------------------|
| Blocker | X | X |
| Major | X | X |
| Minor | X | X |
| **Total** | **X** | **X** |

## Light-pass coverage notice

The following axes were pre-classified light-pass per the spec: 02 (code
quality manual), 08 (performance manual), 11 (observability). Findings in
these axes flag structural issues only; nuanced cases were intentionally
not pursued. If the user wants a deep pass on any of these, request it.

## Methodology recap

- 12 axes × 4 days × 1 auditor + sub-agents per axis
- Tools: [list from spec §3]
- External literature: papis library `q-methodology` (10 references,
  critical Q canon)
- Codex independent review on the design before execution

## How to use this report

1. Start with the **Top findings — Blockers** list above
2. For each blocker, open the linked axis file (`0X-*.md`) for full
   context
3. The action backlog (`99-action-backlog.md`) provides a sprint-
   sequenced execution order
4. Each finding has a stable ID — reference these IDs in commit
   messages and Todoist when implementing fixes
```

Fill in every X with actual numbers and content.

- [ ] **Step 3: Verify no placeholders remain**

```bash
grep -n "TBD\|TODO\|XXX\|^X$\| X " /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/00-executive-summary.md
```

Expected: no output (all placeholders filled).

- [ ] **Step 4: Commit**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/00-executive-summary.md
git -C /home/julien/libre-q commit -m "audit(summary): executive verdict for 3 audiences"
```

---

## Task 17: Action Backlog & Audit Closure (Wave 3 part 3)

**Files:**
- Create: `docs/audits/2026-04-25-deep-audit/99-action-backlog.md`

- [ ] **Step 1: Sequence findings by remediation week**

Build the backlog using this template:

```markdown
# Qualis Audit — Action Backlog

**Sprint context:** SoftwareX submission target 2026-05-14. Today
2026-04-25.

## Week of 2026-04-27 → 2026-05-02 (Remediation week 1)

**All blockers + highest-priority majors.** This week is the gate for
"can we still submit on schedule".

- [ ] [F-XX-NNN] {title}
      effort: S/M/L/XL | axes: {primary axis, related axes} | owner: ?

[List all blockers first, sorted by axis priority (01 security, 06
qmethod, 12 submission, 09 repro, ...). Then majors in audience-sorted
order: SoftwareX-tagged majors first, then Prod, then Maintenance.]

**Estimated total effort this week:** X hours

## Week of 2026-05-03 → 2026-05-09 (Remediation week 2)

**Remaining majors.** If overflow from Week 1, slip lowest-priority
items here.

- [ ] [F-XX-NNN] ...

**Estimated total effort this week:** X hours

## Week of 2026-05-10 → 2026-05-14 (Pre-submission week)

**No new findings; only validation:**

- [ ] Re-run `make ci-full` on the tagged version
- [ ] Manual journey: admin onboarding end-to-end
- [ ] Manual journey: participant Q-sort on mobile end-to-end
- [ ] Manual journey: factor analysis with one realistic dataset
- [ ] Tag `v0.X.0` matching manuscript version
- [ ] Push tag and verify Zenodo archive triggers
- [ ] Obtain DOI from Zenodo, update CITATION.cff and README
- [ ] Submit to SoftwareX

## Post-submission

**All minors and observations, no rush:**

- [ ] [F-XX-NNN] ...

## Findings explicitly NOT addressed before submission

[List any blockers/majors that the user decides to accept as known
limitations, with rationale and how they're surfaced in the manuscript.
This section may be empty if all blockers are addressed.]

## Format reminder

Each line is copyable into Todoist as:
`#libre-q [F-XX-NNN] {title} @{week-tag} p{priority}`

For example:
`#libre-q [F-01-003] Fix JWT secret rotation @W1 p1`
```

- [ ] **Step 2: Verify backlog completeness**

```bash
total=$(grep -c "^- \[ \] \[F-" /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/99-action-backlog.md)
findings=$(wc -l < /home/julien/libre-q/docs/audits/2026-04-25-deep-audit/.raw/all-findings.csv)
findings=$((findings - 1))  # subtract header
echo "Backlog entries: $total | Total findings: $findings"
```

The backlog should contain at least all blockers and majors.
Observations may or may not appear (per scoping). Verify the count makes
sense.

- [ ] **Step 3: Commit backlog**

```bash
git -C /home/julien/libre-q add docs/audits/2026-04-25-deep-audit/99-action-backlog.md
git -C /home/julien/libre-q commit -m "audit(backlog): sequenced action plan for 3-week remediation"
```

- [ ] **Step 4: Cleanup throwaway tools (no permanent install without approval)**

```bash
rm -rf /tmp/audit-venv /tmp/audit-node /tmp/audit-bin
echo "Throwaway tools removed. None added to backend/pyproject.toml or frontend/package.json."
```

If any tool from Wave 1 should become a permanent dev dependency (e.g.,
`gitleaks` in pre-commit, `interrogate` in `make check`), surface this
suggestion to the user as a separate proposal — do NOT install
permanently inside this audit.

- [ ] **Step 5: Final audit completion check (definition of done)**

```bash
cd /home/julien/libre-q/docs/audits/2026-04-25-deep-audit
ls -1 *.md | sort
```

Expected output (exactly):
```
00-executive-summary.md
01-security.md
02-code-quality.md
03-architecture.md
04-tests.md
05-data-and-migrations.md
06-q-methodology-validity.md
07-frontend-ux.md
08-performance.md
09-reproducibility.md
10-documentation.md
11-observability.md
12-submission-package.md
99-action-backlog.md
```

If any file is missing, the audit is not complete — return to the
relevant axis task.

- [ ] **Step 6: Final summary message to user**

Print a concise summary (≤200 words) covering:
- Verdict for the 3 audiences (one line each)
- Number of findings by severity
- Top 3 blockers (or "no blockers found")
- Estimated total remediation effort vs sprint capacity
- Any pacing surprises (overrun? finished early?)
- Pointer: "Full report at docs/audits/2026-04-25-deep-audit/00-executive-summary.md, action plan at 99-action-backlog.md"
- Next step prompt: "Want me to start tackling the W1 backlog, or do you want to review and prioritize first?"

---

## Plan summary

- **17 tasks** across 3 waves
- **Wave 1 (Tasks 1-2):** ~3-4h — workspace + automated scans
- **Wave 2 (Tasks 3-14):** ~6-8h — 12 axes (5 deep + 4 standard + 3 light)
- **Wave 3 (Tasks 15-17):** ~2-3h — synthesis + summary + backlog
- **Total estimate:** 11-15h (vs ~12h target)
- **Overrun risk acknowledged in spec §4:** ~60-70% — light-pass classification and pre-decided drops mitigate
- **Output:** 14 committed markdown files in `docs/audits/2026-04-25-deep-audit/`, plus a gitignored `.raw/` directory of tool outputs and a `.raw/README.md` index
- **No production code modified** by this plan — fixes are downstream work
