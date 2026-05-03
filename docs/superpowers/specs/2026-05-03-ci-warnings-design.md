# CI warnings remediation — design spec

**Date** : 2026-05-03
**Author** : julien (via Claude brainstorming)
**Goal** : reduce the 65 frontend cognitive-complexity warnings to ≤5 (≥92% reduction), with real testability gains, not noise suppression.

## Inventory

`make ci-fast` is currently green. The CI signal we want to clean up is **frontend lint warnings** only.

### Sources of warnings (verified 2026-05-03)

| Source | Status |
|---|---|
| Backend `ruff` | 0 |
| Backend `mypy` | 0 |
| Backend `deptry` | 0 |
| Backend `radon` (informational, never blocks) | 98 items at grade ≥B (62 B, 31 C, 3 D, 2 E) |
| Frontend `tsc` | 0 |
| Frontend `i18n-check` | 0 |
| **Frontend `biome check`** | **65 warnings, all `lint/complexity/noExcessiveCognitiveComplexity`** |

The 65 sites span 40 files. Hot files: `QuestionBuilder.tsx` (6), `QSortEditor.tsx` (5), `Step1_Feedback.tsx` / `GridSort.tsx` / `InteractiveDataView.tsx` (3 each).

## Goal

Reduce frontend complexity warnings from 65 to ≤5, **with real refactoring** (not threshold relaxation, not bulk suppression). Threshold remains at 15 (Biome default).

## Approach

### Wave structure

The work is partitioned by **subsystem** (not by warning pattern), giving each PR a coherent review surface and shared test footprint.

| Wave | Subsystem | Files (sites) | Total sites | Risk | Mode |
|---|---|---|---|---|---|
| W1 | Utilities + transverse hooks | `mutator` (1), `uaParser` (1), `tuckerPhi` (1), `studyResetHelpers` (1), `useStudyPersistence` (2), `useDragAutoInteraction` (2), `useGridZoom` (1), `useGridCalculations` (1), `useFineSortDrag` (1), `useRecruitmentPage` (1) | 12 | Low | Inline |
| W2 | Analysis + dashboard tables | `StatementsTable` (2), `FactorLoadingsTable` (2), `ItemDetailSheet` (1), `InteractiveDataView` (3), `SurveyResponseTable` (2), `ParticipantMetadataCard` (1), `StudyStatusControl` (1), `QuestionDistributionCharts` (2) | 14 | Low-medium | Inline |
| W3 | Designer | `QuestionBuilder` (6), `QSortEditor` (5), `ProcessStepEditor` (1), `PostSortConfigEditor` (2), `LanguageManagerModal` (1), `MultiLangFieldIcon` (1) | 16 | Medium | Inline (split W3a/W3b allowed if QuestionBuilder is unmanageable) |
| W4 | Sorting/participant runtime | `GridSort` (3), `SortableCard` (1), `ReadingZone` (1), `SortingAnimation` (2), `Step1_Feedback` (3), `Step2_Questionnaire` (2), `AudioRecorder` (2), `ConsentPage` (1) | 15 | **High** (participant core) | Subagent + code-reviewer, **Opus** |
| W5 | Pages, layouts, redirects | `AdminLayout` (1), `LegacyRedirect` (1), `RouteErrorBoundary` (1), `ErrorPage` (1), `StudyOverviewPage` (1), `GeneralSettingsPage` (1), `DataPrivacyPage` (1), `CreateStudyDialog` (1) | 8 | Low (declarative) | Inline, case-by-case triage |
| **Total** | | | **65** | | |

**Order**: W1 → W2 → W3 → W4 → W5. Justification:
- W1 first: utilities feed downstream waves; reduces collateral complexity in W4.
- W4 last among logic-heavy waves: highest functional risk (drag, keyboard, audio) — done after the team has internalised the refactoring patterns.
- W5 closes: case-by-case triage is easier with 4 waves of precedent.

### Refactoring patterns (P1-P5)

Five patterns cover ~95% of sites. Each has an associated test discipline.

#### P1 — Comparator extraction

**Symptom**: `array.sort((a, b) => { … 6 branches … })` at complexity 25-37.
**Refactor**: extract `compareByKey<T>(key, asc)` (pure typed function).
**Targets**: `StatementsTable.tsx`, `FactorLoadingsTable.tsx`, `ItemDetailSheet.tsx`.
**Test**: ≥5 pure paths (per key × asc/desc, nullish edge cases).

#### P2 — Map-with-conditions → sub-component

**Symptom**: `array.map(x => <div>… 8 nested conditions …</div>)` in JSX.
**Refactor**: extract `<Cell />` or `<Step />` with typed props.
**Targets**: `FactorLoadingsTable.tsx:174`, `StudyStatusControl.tsx:192`, `SurveyResponseTable`, `InteractiveDataView`.
**Test**: sub-component test with ≥3 prop variants.

#### P3 — Function decomposition (pure utility)

**Symptom**: utility function with 4-6 sequential linear phases (parser, validator).
**Refactor**: split into sub-functions (e.g. `parseUA` → `detectBrowser` + `detectOS` + `detectDevice`).
**Targets**: `tuckerPhi.matchFactorsByPhi`, `uaParser.parseUA`, `mutator.handleErrorStatus`, `studyResetHelpers`.
**Test**: ≥5 pure paths per sub-function.

#### P4 — Hook-internal helper extraction

**Symptom**: an already-extracted hook with a `useCallback` or `useEffect` body at complexity 25.
**Refactor**: extract the business logic into a helper module (no hook, pure fn); the hook orchestrates.
**Targets**: `useStudyPersistence` (×2), `useDragAutoInteraction` (×2), `useGridCalculations`, `useGridZoom`, `useFineSortDrag`, `useRecruitmentPage`.
**Test**: pure helper module tests + existing `use<Name>.test.ts` extended if signature changes.

#### P5 — JSX shell triage (W5)

**Symptom**: declarative component with large `switch`/conditional but no hidden business logic.
**Decision rules**:
- If complexity = mapping table (URLs, states, languages) → factor the table to a top-of-file `const`. If still over threshold → `// biome-ignore` with one-line rationale.
- If complexity = conditional business logic → mandatory refactor (falls back to P2 or P4).

**Suppression convention** (inherited from existing precedent in `AnalysisPage`, `StudyDesignPage`, `RecruitmentPage`, `ConcourseDetailPage`):

```tsx
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: <one-line rationale, e.g. "declarative URL routing table — no extractable logic">
```

Always cite category P5 in the rationale, plus the concrete reason. No suppression without rationale.

### Test discipline

| Extraction type | Test location | Minimum coverage |
|---|---|---|
| Pure utility (P1, P3) | `<file>.test.ts` colocated | ≥5 paths, nullish edge cases, asc/desc asymmetry |
| Hook helper (P4) | `<helper>.test.ts` separate from hook | ≥5 pure paths, no rendering |
| Sub-component (P2) | `<Component>.test.tsx` | ≥3 prop variants, light snapshot |
| Hook (P4) | existing `use<Name>.test.ts` | extended if signature changes |
| JSX shell (P5, suppress) | none | mandatory rationale in comment |

**Strict rule**: no extracted util/helper ships without a test. If a site cannot be tested cleanly, fall back to P5 (suppress) with rationale rather than push untested code.

### Done criteria per wave

Each PR must satisfy **all** before merge:

1. **Lint**: zero new `noExcessiveCognitiveComplexity` occurrences; global count drops by the wave's expected count.
2. **`make ci-fast` green** (lint + types + unit tests).
3. **`make ci` green** before push (lint + check + test + build).
4. **Tests added** matching the discipline grid; touched-file coverage ≥ pre-PR level.
5. **No complexity regression elsewhere**: `npx biome check src --max-diagnostics=200 | grep -c noExcessive` decreases monotonically.
6. **W4 only**: `make e2e` green + manual smoke test via dev server (grid sort + keyboard + audio if AudioRecorder touched).
7. **No scope creep**: a wave's commits only touch files in its inventory; collateral utilities are documented in commit messages.

### Specific safeguards

- **W1**: if an extracted util is reused by other complexity-flagged files, note it in the PR body — it pre-reduces W2-W4 effort.
- **W3**: if `QuestionBuilder` (6 sites) cannot be done in one reasonable PR, allow split into W3a (QSortEditor + small) / W3b (QuestionBuilder alone). Decision at W3 start, not earlier.
- **W4**: PR description must list E2E paths verified (`tests/playwright/*.spec.ts` covering participant core). If a path is uncovered, add an E2E test or justify.
- **W5**: every `// biome-ignore` cites P5 + concrete reason (e.g. "declarative routing table", "switch on `error.status` with no business branching"). No suppression without rationale.

### Mid-point checkpoint

After W2 is merged, dispatch a **backlog-review subagent** (per the audit-waves pattern) which:
- Re-measures the warning count.
- Honestly evaluates whether W3-W5 still merit the effort in their current shape.
- Proposes cuts (sites where refactor brings no real testability → fall back to P5).

This is the safeguard against "refactor marathon without value-add".

## Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Silent regression in W4 (drag, keyboard, audio) | Medium | High | Manual smoke + E2E + Opus dispatch + per-file PR if scope >4 sites |
| Superficial refactor: extraction that displaces complexity without reducing it | Medium | Medium | Done criterion #1 + human review for relevance |
| Scope creep: one W2 file pulls 3 cascading files | Low-medium | Medium | Done criterion #7 + W1 utilities act as stable boundary |
| Missing or weak tests | Medium | Medium | code-reviewer subagent on W3 and W4 |
| `QuestionBuilder.tsx` becomes unmanageable in one PR | Medium | Low | W3a/W3b split allowed |
| Biome false positives (intermittent "internal Biome error" diagnostic seen during inventory) | Low | Low | If a site disappears/reappears across runs, suppress with link to Biome issue |

## Orchestration

| Wave | Execution mode | Model |
|---|---|---|
| W1 | Inline (small, well-bounded) | — |
| W2 | Inline | — |
| W3 | Inline; if W3b split → subagent implementer | Sonnet |
| W4 | Subagent implementer + code-reviewer after | **Opus** |
| W5 | Inline (case-by-case decisions) | — |

## Sequencing

1. Spec + implementation plan (this session) → commit + push to `main`.
2. W1 PR → review, merge.
3. W2 PR → review, merge.
4. **Mid-point checkpoint** (backlog-review subagent).
5. W3 PR (or W3a + W3b) → review, merge.
6. W4 PR → Opus subagent + code-reviewer Opus, smoke E2E, merge.
7. W5 PR → final review, merge.
8. **Post-mortem**: a `docs: update CLAUDE.md` commit documenting the P1-P5 pattern in a new "Cognitive complexity policy" section. The current `CLAUDE.md` references categories A-E informally — replace with P1-P5.

## Success metrics

- **Before**: 65 warnings.
- **Target**: ≤5 residual warnings (≥92% reduction), each justified by a P5 `// biome-ignore` with rationale.
- **Bonus**: measurable drop in mean cognitive complexity across the touched files.

## Out of scope

- Threshold change (15 stays).
- Designer subsystem refactor beyond the 16 flagged sites.
- Test infrastructure migration (Vitest/Playwright conventions stay).
- New dependencies.

## Open questions

None at spec-write time. Resolved during brainstorming:
- Goal: quality refactor, not noise suppression.
- Structure: waves by subsystem.
- Category A (JSX shells): case-by-case triage (P5 rules).
