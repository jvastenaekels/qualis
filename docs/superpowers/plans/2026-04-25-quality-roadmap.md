# Qualis quality roadmap (v0.2 post-submission)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan phase-by-phase. Each phase is independent — pick one, dispatch sub-agents per item.

**Goal:** raise the floor of the codebase across CI/DX, TypeScript+Python type strictness, test depth, and structural decoupling, in 5 sequenced phases summing to ~75-90h.

**Window:** post-SoftwareX submission (after 2026-05-14). Phase 1 quick wins (A/H/I/J, ~6h cumulé) are safe to do pre-submission if DX friction is biting.

**Driving findings:** the 2026-04-25 audit (`docs/audits/2026-04-25-deep-audit/`) and the remediation session that closed the blockers + most majors. This roadmap targets the structural debt that didn't make it into the sprint.

**Sequencing principles:**
- Phase 1 first (quick wins, zero risk).
- Phase 2 must precede Phase 3 (no point pushing mypy strict if the TS `any` cascade is still open — same anti-pattern, both directions).
- Phase 4 (tests) can run in parallel with Phase 3 or 5.
- Phase 5 (architecture) is longest + lowest urgency; treat as background project.

---

## Phase 1 — Quick wins (CI/DX), ~6h cumulé

Safe pre-submission. All four items are pure additions, no impact on existing code.

### Item A — `make ci-fast` target (~1h)

**Files:**
- Modify: `Makefile`

**Steps:**
- [ ] Add target after `ci`:
  ```make
  ci-fast:
      cd backend && uv run ruff check app/
      cd backend && uv run ruff format --check app/
      cd frontend && npm run lint
      cd backend && uv run mypy app/
      cd backend && uv run python -m app.schema_validation
      cd frontend && npm run type-check
      cd backend && uv run pytest tests/unit/ -q
      cd frontend && npm run test -- --run
      @echo "\n--- Fast feedback CI passed (~30-60s) ---"
  ```
- [ ] Document in CLAUDE.md "Key Commands" section: `make ci-fast` for tight inner loop, `make ci` before push.
- [ ] Verify total wall clock <90s on a clean checkout.
- [ ] Commit: `chore(ci): add make ci-fast for tight feedback loop`.

### Item I — Stricter `tsconfig.json` flags (~2h) — DONE

**Files:**
- Modify: `frontend/tsconfig.json` (or `tsconfig.app.json` if split)
- Possibly modify: a handful of `*.ts` / `*.tsx` files that the new flags surface

**Steps:**
- [x] Add to `compilerOptions`: `"noFallthroughCasesInSwitch": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`.
- [x] Run `npm run type-check` — count errors. Triage: trivial (add `?` or guard) vs needs investigation.
- [x] Fix trivial errors inline (69 errors → 0 across 5 batches over 2026-04-25).
- [x] noUncheckedIndexedAccess enabled in commit `0dbb8fa`.
- [x] Commit: `feat(ts): enable noUncheckedIndexedAccess (was 69 errors, now 0)`.

**Acceptance:** `npm run type-check` clean — DONE.

### Item H — Per-module mypy strict overrides (~2h)

**Files:**
- Modify: `backend/pyproject.toml` (mypy config) or `backend/mypy.ini` if used

**Steps:**
- [ ] Find the mypy config block. Add a strict override for the leaf modules with cleanest types — start with `app/utils/security.py`, `app/utils/audit.py`, `app/resume_codes.py`:
  ```toml
  [[tool.mypy.overrides]]
  module = ["app.utils.security", "app.utils.audit", "app.resume_codes"]
  disallow_untyped_defs = true
  disallow_any_explicit = true
  warn_return_any = true
  ```
- [ ] Run `make check` — fix errors that surface in those 3 modules.
- [ ] Commit. Then add 2-3 more modules and repeat. Goal: 1-2 modules per session, no big bang.
- [ ] Document in CLAUDE.md the strict-modules list (so contributors know which files have higher bar).

**Acceptance:** at least 5 modules under strict mode at end of phase. The pattern is established; future modules opt in via a 1-line edit.

### Item J — Biome `complexity` rule (~1h)

**Files:**
- Modify: `frontend/biome.json` (or wherever Biome rules live)

**Steps:**
- [ ] Find the Biome rules section. Enable `complexity/noExcessiveCognitiveComplexity` with a threshold of 15 (Biome's default is 15; just promote to error).
- [ ] Run `npm run lint` — count violations. Note: this is informative only — don't fix existing high-complexity functions in this commit, only prevent new ones.
- [ ] Add inline `biome-ignore` with a `// TODO(quality-roadmap)` for the existing offenders. This is the same pattern as the WIP — don't gold-plate now.
- [ ] Commit: `chore(lint): enforce cognitive-complexity ceiling at 15`.

**Acceptance:** rule active, existing offenders tagged, lint pipeline still passes.

---

## Phase 2 — TypeScript `any` cascade, ~6h

> **Update 2026-04-25 (after execution):** the audit's "cascade" framing was
> over-optimistic. Of the 219 actual `noExplicitAny` suppressions, only 27
> were rooted in `updateTranslation`; the other 192 are diffuse (JSON opaque
> configs, polymorphic survey fields, flexible test helpers) — each a small
> typing decision in its own right, not one untie-the-knot fix. Phase 2
> shipped the 27 fix (commit 637a658) and stopped honestly. Phase 3 below
> is also probably more `O(modules)` than `O(modules ÷ key-insights)` — adjust
> expectations accordingly.

Single item, but it's the unblocker for Phase 3. Audit F-02-002.

### Item B — Type the `updateTranslation` callback root cause

**Files:**
- Modify: `frontend/src/store/useStudyDesigner.ts` (the source of the cascade)
- Modify: ~20 call sites that currently `biome-ignore` the resulting `any`

**Background:** the audit found 159 `biome-ignore noExplicitAny` suppressions in production code, concentrated in study designer + Zustand store. Triage attributed the root cause to a single untyped `updateTranslation` callback in `useStudyDesigner.ts`. Typing it correctly cascades to remove the suppressions across ~20 files.

**Steps:**
- [ ] Open `useStudyDesigner.ts`, find `updateTranslation` (and any sibling generic `update*` callbacks). Note the actual shape of the data each handles.
- [ ] Define a discriminated union or generic constrained to known translation keys. Sketch:
  ```ts
  type TranslationField =
    | { kind: 'study'; field: 'title' | 'description' | 'instruction' | 'consent_text'; value: string }
    | { kind: 'statement'; statementId: number; value: string }
    | { kind: 'concourse'; itemId: number; field: 'text' | 'rationale'; value: string };

  type UpdateTranslation = (lang: LanguageCode, payload: TranslationField) => void;
  ```
  Adapt to the actual shape; the discriminated union is the right shape if multiple callers pass different payload shapes.
- [ ] Update the store action signature.
- [ ] Run `npm run type-check` — list every error.
- [ ] Walk every call site. At each one:
  - If the call was already passing the right shape, just remove the surrounding `biome-ignore`.
  - If the call was passing a different shape, fix the call.
- [ ] Run `npm run lint` and `npm run test` — both must pass.
- [ ] Count remaining `biome-ignore noExplicitAny` in `frontend/src` — should drop from 159 to <40.
- [ ] Commit: `refactor(ts): type updateTranslation root, kill 100+ biome-ignore`.

**Acceptance:** `noExplicitAny` suppression count down by ≥100. Documented in commit message with grep before/after.

---

## Phase 3 — Backend `mypy --strict` (epic, ~20-30h)

**Item F.** This is the structurant. The plan is at the epic level — write a sub-plan when ready to start.

**Goal:** every module in `backend/app/` passes `mypy --strict`. No `Any` (explicit or implicit), every function has return type, every variable is declared.

**Why now:** Phase 2 establishes the equivalent discipline frontend-side; matching it backend-side gives the codebase a uniform type-safety floor that makes the AI-assisted development pattern (Type-Driven Development per `agent-instructions.md`) actually work.

**Sub-plan template** (write when ready to execute):
1. Inventory: run `mypy --strict app/` and bucket errors by category (missing return type, untyped variable, `Any` propagation, missing generic params, etc.).
2. Sequence modules by isolation — leaves first (`utils/`, `resume_codes`, `core/config`, `exceptions`), then services, then routers.
3. Per module: enforce strict via `[[tool.mypy.overrides]]` (extends Phase 1H pattern), fix errors, commit. One module per commit.
4. Final commit: promote the global `[tool.mypy]` to strict and remove the per-module overrides (now redundant).

**Effort estimate breakdown:**
- `utils/` + `core/` + `exceptions`: 4h
- `services/` (9 modules): 12h
- `routers/` (~12 modules): 10h
- Final cleanup + global flip: 2h

**Acceptance:** `make check` runs `uv run mypy --strict app/` (no per-module overrides) cleanly. CLAUDE.md "Coding Standards" section updated to make `--strict` the documented baseline.

**Out of scope here:** test code (`tests/` doesn't need strict; pytest fixtures fight mypy unproductively).

---

## Phase 4 — Testing depth, ~16-18h

Two independent items. Run in parallel sub-agents if possible.

### Item C — Critical-path E2E specs (~6-8h)

**Files:**
- Create: `frontend/e2e/study/participant-mobile-qsort.spec.ts`
- Create: `frontend/e2e/admin/study-setup-onboarding.spec.ts`
- Create: `frontend/e2e/admin/recruitment-funnel.spec.ts`
- Create: `frontend/e2e/study/rgpd-self-erasure.spec.ts`

**Steps:**
- [ ] **participant-mobile-qsort.spec.ts** — viewport `{ width: 375, height: 667 }`, full participant journey: landing → consent → presort → rough sort → fine sort → post-sort. Verify drag works on touch (`page.touchscreen.tap()` + `dispatchEvent('touchmove')`). 1-2 tests, ~3h.
- [ ] **study-setup-onboarding.spec.ts** — admin creates project → study → adds concourse → adds 12 statements → configures grid → activates study → generates recruitment link. Tests the happy path that a new researcher would walk. ~2h.
- [ ] **recruitment-funnel.spec.ts** — admin creates a public link, then a script-driven participant uses it, then admin sees the participant in the funnel dashboard with started→completed transition. ~2h.
- [ ] **rgpd-self-erasure.spec.ts** — participant completes a Q-sort, then on the post-sort screen clicks "Request my data deletion", confirms, sees the success state. Admin then checks the data-inventory page and sees the anonymised counter incremented. ~2h.
- [ ] All specs use the existing `db-setup.ts` fixtures (already fixed for workspace→project rename).
- [ ] Commit each spec separately with clear message.

**Acceptance:** `make e2e` runs all 4 new specs in ≤60s combined; CI-stable on first run.

### Item E — Property-based testing for factor analysis (~10h)

**Files:**
- Modify: `backend/pyproject.toml` (add `hypothesis>=6.0` to dev deps)
- Create: `backend/tests/property/test_analysis_invariants.py`
- Create: `backend/tests/property/__init__.py`

**Steps:**
- [ ] Install: `cd backend && uv add --dev hypothesis`.
- [ ] Sketch the strategy: generate Q-sort matrices `(n_statements, n_participants)` with realistic constraints (n_statements ∈ [10, 60], n_participants ∈ [5, 50], values bounded by typical forced distribution). Use Hypothesis `arrays` strategy from `hypothesis.extra.numpy`.
- [ ] Write invariants tests, one property per:
  1. Correlation matrix values are in [-1, 1]. (Guards numerical bugs in `correlation_matrix`.)
  2. Communalities sum ≤ n_factors after extraction. (Guards extraction bugs.)
  3. Sign polarity is deterministic given the same input + seed. (Guards F-06-006-style regressions.)
  4. Z-scores have mean ≈ 0, std ≈ 1 per factor (standardisation invariant). (Guards F-06-013.)
  5. Distinguishing statements have non-zero z-score difference between flagged factors. (Guards classification bugs.)
  6. Factor arrays are exact integer values (not coerced from floats). Distribution matches grid_config.
- [ ] Each property test uses `@given(...)` with `max_examples=50` to keep CI under 30s. Use `@settings(deadline=5000)` to allow slow runs on small matrices.
- [ ] When a property fails: Hypothesis shrinks the input automatically — capture the minimal counterexample and add it as a regression test in `test_analysis_service.py`.
- [ ] Add a `make test-property` target that runs only property tests (slower than unit, faster than integration).
- [ ] Commit: `test(analysis): property-based invariants for factor analysis`.

**Acceptance:** 6 property tests pass on `make test-property`; at least one previously-unknown bug surfaced and either fixed or documented as FIXME (the audit predicted F-06-006 sign polarity regressions live below the surface; property testing is the tool to find them).

---

## Phase 5 — Architecture, ~25-30h (epics)

Two structurants. Each warrants its own sub-plan when ready.

### Item D — Domain-driven slicing of `models.py` (~10h)

**Goal:** `backend/app/models.py` (760 LOC, 18 classes, 1 file) → `backend/app/models/` package with subdomains:

```
models/
  __init__.py     # re-exports for back-compat (one-shot)
  base.py         # Base, common imports, Enums (StudyState, ParticipantStatus, etc.)
  user.py         # User, ProjectMember, Project
  study.py        # Study, StudyTranslation, Statement, StatementTranslation
  participant.py  # Participant, QSortEntry, AudioRecording
  recruitment.py  # RecruitmentLink, Invitation
  concourse.py    # Concourse, ConcourseItem, ConcourseItemTranslation,
                  # ConcourseTag, ConcourseItemTag, ConcourseItemVersion,
                  # ConcourseItemComment
  analysis.py     # AnalysisRun (the new one)
```

**Sub-plan template** (write when ready):
1. Move classes to new files in dependency order (Enums first, then Base, then leaves, then aggregates).
2. Each move: change imports in `models/__init__.py` to re-export, run `make check`, commit.
3. Once all moved: change call sites from `from app.models import X` → `from app.models.<subdomain> import X` (linter rule can enforce).
4. Final commit: remove the back-compat re-exports from `models/__init__.py`.

**Risk:** 56 backend modules import from `app.models`. Re-exports make the move zero-downtime.

**Acceptance:** `app/models.py` no longer exists; subdomain modules each <300 LOC; tests + CI green.

### Item G — "No logic in component" convention (~15h)

**Goal:** every React component file >100 lines extracts its non-trivial logic into a `useFoo()` hook in `frontend/src/hooks/` so:
- Logic is unit-testable without rendering
- Components become declarative shells (testable via snapshot/visual regression alone)
- LLM can reason about logic independent of JSX

**Sub-plan template** (write when ready):
1. Inventory components >100 lines with logic in body — likely candidates: `StudyDesignPage`, `RoughSortPage`, `FineSortPage`, `AnalysisPage`, `ConcourseDetailPage`, `RecruitmentPage`.
2. Per component, extract the state-and-effect logic into a hook in `frontend/src/hooks/<area>/use<ComponentName>.ts`. Component receives the hook's return value and renders it.
3. Add a unit test file for each new hook covering the logic paths.
4. Add a Biome rule (or ESLint plugin) to flag new files >150 lines if Biome supports it; otherwise document the convention in CLAUDE.md.

**Effort breakdown:** ~6 components × ~2h each (read + extract + test + verify) = 12h. + 3h convention/lint setup + docs.

**Acceptance:** the 6 named components are <100 lines each (excluding JSX, the body has at most useState/useEffect/event-handler glue); each has a `use<Name>()` hook with ≥3 dedicated tests.

---

## Cross-cutting

### Documentation updates

After all phases, update:
- [ ] `CLAUDE.md` "Coding Standards" — strict mypy is the documented baseline, no `any` in TS, "no logic in component" convention referenced
- [ ] `docs/contributing/coding-standards.md` — same
- [ ] `docs/contributing/agent-instructions.md` — Type-Driven Development section gets concrete examples from the new strict modules
- [ ] `SECURITY.md` "Audit history" — append "v0.2 quality roadmap completed YYYY-MM-DD"

### CHANGELOG entry (when v0.2 ships)

Maintain a running changelog of which phases shipped. Helps reviewers if SoftwareX ever asks for a v0.2 reviewer pass.

### Tooling adjustments to consider in passing

These don't justify their own item but worth noticing if the opportunity arises:
- Switch backend test runner to use `pytest-xdist` (`-n auto`) for parallel test speedup once mypy strict is in place (parallel + strict is a force multiplier).
- Add `pyright` as a second-opinion type checker — it has a different inference engine and catches things mypy misses.
- Consider `tach` or `import-linter` for backend module dependency rules (already partially in place per `import-linter` in deps).

---

## Total effort summary

| Phase | Items | Effort | Parallelisable? | Sub-plan needed? |
|------:|-------|-------:|:---------------:|:---------------:|
| 1 | A, H, I, J | 6h | All independent | No (detailed here) |
| 2 | B | 6h | No (single item) | No (detailed here) |
| 3 | F (mypy strict) | 20-30h | Module-by-module | Yes (write when ready) |
| 4 | C (e2e), E (property) | 16-18h | Yes (different files) | No (detailed here) |
| 5 | D (models.py), G (no-logic-in-component) | 25-30h | Yes (different parts) | Yes per item |
| **Total** | **10 items** | **75-90h** | | |

Realistic delivery cadence: 6 weeks of part-time (10-15h/week) spread post-submission.

## How to use this roadmap

- **Right after submission:** Phase 1 (~6h, single afternoon)
- **Sprint 1 post-submission:** Phase 2 (~6h, opens the door)
- **Sprint 2-3 post-submission:** Phase 4 in parallel with starting Phase 3
- **Sprint 4-5 post-submission:** Continue Phase 3, write sub-plans for Phase 5
- **Sprint 6+ post-submission:** Phase 5 epics

When ready to start Phase 3 or 5, use the brainstorming + writing-plans skills to expand the epic into a bite-sized sub-plan, then dispatch sub-agents per task.
