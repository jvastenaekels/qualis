# Wave 4 — useQSortEditor Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `frontend/src/components/admin/designer/QSortEditor.tsx` (1488 LOC on the W2 branch) to a JSX shell (+ the discrete `SortableStatementItem`) by relocating its ~385 LOC of inline state/store/query/handler logic verbatim into `frontend/src/hooks/admin/useQSortEditor.ts`, after first hardening the behaviour net with characterization tests — no behaviour change.

**Architecture:** Characterization-first, then Phase-5-G hook extraction (precedents: `useInteractiveDataView` W1, `useAudioRecorder` W3 — including the W3 pattern of the hook returning a JSX-bound value created by a hook call: here `sensors = useSensors(...)`). Stacked on the Wave-2 branch.

**Tech Stack:** React 19, TypeScript (strict via `tsc -b`/Biome), Zustand (`useStudyDesigner`), @tanstack/react-query (generated hooks), @dnd-kit, Vitest + `@testing-library/react` (`renderWithStore`, `userEvent`, `renderHook`).

**Branch:** `chore/code-quality-wave4-useqsorteditor`, **based on `chore/code-quality-wave2-studyconfig-typing`** (base commit `0646b64d`; already created; spec committed there). PR diff is framed against the W2 branch; merge order #178 → W4.

**The real typecheck gate is `cd frontend && npm run type-check` (= `tsc -b`).** Never `npx tsc --noEmit` (false-green, root tsconfig references-only).

---

### Task 0: Baseline

**Files:** none modified.

- [ ] **Step 1: Record the green baseline**

Run: `cd frontend && npm run type-check && npx vitest run 2>&1 | grep -E "Test Files|Tests " | tail -2 && wc -l < src/components/admin/designer/QSortEditor.tsx`
Expected: `tsc -b` exit 0; full suite green — **record the exact `Tests N passed | M skipped` line** (behaviour-preservation target for Tasks 1, 3, 4); `QSortEditor.tsx` = 1488.

- [ ] **Step 2: Record the existing QSortEditor test count (oracle seed)**

Run: `cd frontend && npx vitest run src/components/admin/designer/QSortEditor.test.tsx 2>&1 | tail -3`
Expected: all pass (17 tests). Note the count. After Task 1 this file gains characterization tests; from Task 2 onward the **whole file must remain byte-unchanged and green** (the behaviour-preservation oracle). If at any later step it requires modification to pass, behaviour changed → STOP and escalate.

- [ ] **Step 3: Confirm the sole consumer**

Run: `grep -rln "designer/QSortEditor" frontend/src --include="*.tsx" --include="*.ts" | grep -vE "QSortEditor\.(tsx|helpers|test)"`
Expected: exactly `frontend/src/pages/admin/StudyDesignPage.tsx`. Anything else → STOP, report.

No commit (read-only).

---

### Task 1: Characterization tests (harden the net BEFORE any component change)

**Files:**
- Modify: `frontend/src/components/admin/designer/QSortEditor.test.tsx` (append 4 `describe` blocks; do not alter existing tests)

**These are characterization tests: they assert whatever the component does *today* on the W2 branch, even if a behaviour looks odd — the point is to lock current behaviour so the Task-3 extraction cannot drift it. Do not "fix" surprising behaviour; snapshot it.**

- [ ] **Step 1: Append the four characterization `describe` blocks**

Append to `QSortEditor.test.tsx`, reusing the file's existing harness (`renderWithStore`, `userEvent`, `TooltipProvider`, the `sonner` mock, and the existing render helper/store-seed pattern used by the current 17 tests — read the top of the file and the existing `describe('Statement Management')`/`describe('Bulk Statement Import')` blocks and mirror their setup exactly):

```tsx
describe('Characterization — dnd reorder (W4 oracle)', () => {
    it('reordering statements via drag-end updates draft order', async () => {
        // Render with a seeded draft of >=3 statements (mirror the seed the
        // existing 'Statement Management' describe uses). The dnd-kit
        // drag-end handler reorders draft.statements. Drive it the way the
        // codebase's other dnd tests do (search the repo for an existing
        // `DragEndEvent`/`fireEvent`/`@dnd-kit` test — e.g. dispatch the
        // handler via the rendered DnD context, or simulate keyboard
        // reorder through the sortable item's role/aria). Assert the
        // resulting draft.statements ORDER (read via the store) matches the
        // post-drag order. Snapshot whatever the current handler produces.
    });
});

describe('Characterization — concourse sync + stale map (W4 oracle)', () => {
    it('syncing a stale statement calls the sync mutation and clears its stale flag', async () => {
        // Seed `original.statements` with one entry having
        // source_concourse_item_id set; mock the generated
        // useCheckStaleStatements query to return that id as stale and the
        // useSyncStatementFromConcourse mutation. Mirror how other tests
        // mock '@/api/generated'. Trigger the per-statement sync affordance
        // (the button rendered when staleByStatementId has the id). Assert
        // the sync mutation was called with the expected args and the UI
        // reflects the post-sync state the component currently produces.
    });
});

describe('Characterization — import-mode matrix (W4 oracle)', () => {
    it.each(['replace', 'append', 'sync'] as const)(
        'bulk import in %s mode produces the current draft.statements result',
        async (mode) => {
            // Open the import dialog, paste a known multi-line bulk text
            // (cover both detected formats the parser supports — see
            // QSortEditor.helpers / parseCsvTsv), select the import mode,
            // confirm. Assert the resulting draft.statements EXACTLY as the
            // current code yields for that mode (replace overwrites; append
            // concatenates; sync reconciles). Snapshot current behaviour.
        }
    );
});

describe('Characterization — inline statement edit (W4 oracle)', () => {
    it('enter→edit→commit updates the statement; cancel discards', async () => {
        // Seed >=1 statement. Trigger inline edit (sets editingIndex/
        // editingText/editingCode). Change text+code, commit — assert the
        // statement updated in draft. Repeat: edit, change, cancel — assert
        // the statement is UNCHANGED. Snapshot the exact commit/cancel
        // semantics the current handlers implement.
    });
});
```

Fill the bodies by reading the component's current rendered output and the existing tests' patterns. Each assertion targets **observed current behaviour** (read draft state via the store, like the existing tests). No mock tautologies — assert the draft mutation / mutation-call, not that a mock returned its configured value.

- [ ] **Step 2: Run — characterization tests green on the W2 baseline**

Run: `cd frontend && npx vitest run src/components/admin/designer/QSortEditor.test.tsx`
Expected: all pass — the original 17 **plus** the 4 new blocks (≥4 new test cases; the import-mode `it.each` is 3). If a characterization test cannot be made to pass against the *unchanged* W2 component, you have either a test-setup bug or discovered real behaviour you must encode — investigate; do NOT modify the component (it is untouched in Task 1).

- [ ] **Step 3: Lint/format the test file**

Run: `cd frontend && npx @biomejs/biome check --write src/components/admin/designer/QSortEditor.test.tsx && npx @biomejs/biome check src/components/admin/designer/QSortEditor.test.tsx`
Expected: formatting normalized; second run 0 errors/0 warnings (no `any`, no unused import). Re-run Step 2's vitest to confirm formatting didn't break a test.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/designer/QSortEditor.test.tsx
git commit -m "test(designer): characterization net for QSortEditor (W4 oracle)

Locks current behaviour of dnd reorder, concourse sync + stale map,
import-mode matrix, and inline edit on the W2 baseline BEFORE the
useQSortEditor extraction. Existing 17 tests unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Create useQSortEditor + first failing test

**Files:**
- Create: `frontend/src/hooks/admin/useQSortEditor.ts`
- Create: `frontend/src/hooks/admin/useQSortEditor.test.ts`
- Read for the verbatim move: `QSortEditor.tsx` — `QSortEditorProps` (lines 302–305) and the main-component logic block (line 308 `const QSortEditor = (...) => {` through the line immediately before the JSX `return (` at 699).

- [ ] **Step 1: Write the first failing hook test**

Create `frontend/src/hooks/admin/useQSortEditor.test.ts`:

```ts
/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Qualis Team
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useQSortEditor — pure-logic paths only. Full behaviour
 * through the component is covered by the unchanged QSortEditor.test.tsx
 * (existing 17 + W4 characterization tests = the oracle).
 */

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Mirror the generated-API + store mocks the precedent hook tests use
// (read frontend/src/hooks/admin/useRecruitmentPage.test.ts for the
// canonical @/api/generated + @/store/useStudyDesigner mocking pattern and
// replicate the shapes the moved body actually calls).

import { useQSortEditor } from './useQSortEditor';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useQSortEditor — initial shape', () => {
    it('returns the role-grouped surface without throwing on mount', () => {
        const { result } = renderHook(() => useQSortEditor({}));
        expect(result.current.dnd.sensors).toBeDefined();
        expect(typeof result.current.bulk.setBulkText).toBe('function');
        expect(result.current.dialogs.importDialogOpen).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/admin/useQSortEditor.test.ts`
Expected: FAIL — `Failed to resolve import "./useQSortEditor"`.

- [ ] **Step 3: Create the hook by relocating the logic verbatim**

Create `frontend/src/hooks/admin/useQSortEditor.ts`:

```ts
/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Qualis Team
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useQSortEditor hook
 *
 * Owns the durable state-and-effect logic for the Q-sort statement/grid
 * editor: useStudyDesigner store slice, stale-statements query +
 * concourse-sync mutation, bulk-import + detected-format state, inline-edit
 * state, grid-capacity handlers, dnd sensors + drag-end. QSortEditor renders
 * JSX from this hook's return value (Phase-5-G; precedents
 * useInteractiveDataView W1, useAudioRecorder W3).
 *
 * `sensors` (useSensors) is returned and bound by the component as
 * <DndContext sensors={sensors}> — same pattern as W3's hook-returned
 * containerRef.
 */

// ⟶ MOVE: carry over every import the moved body uses (react, @dnd-kit
//   core/sortable, @/store/useStudyDesigner, @tanstack/react-query, the
//   generated stale/sync hooks, @/components/admin/designer/
//   QSortEditor.helpers, types). Let `tsc -b` drive which: add an import
//   here the moment a moved line references a missing symbol. JSX-only
//   imports stay in the component.

// ⟶ MOVE verbatim: the `QSortEditorProps` interface (QSortEditor.tsx
//   302–305) — export it (the component imports it back). Also any
//   small local type aliases the moved body needs that currently live
//   above the component (e.g. `Statement`/`Translation`/`GridColumn`/
//   `StaleInfo` aliases at ~66–73) IF the moved body references them and
//   they are not already exported from a shared module — move/export the
//   minimum set, verbatim. Do NOT move `SortableStatementItem`.

export interface UseQSortEditorResult {
    // ⟶ Role-grouped, any-free. The shape below is the TARGET; during
    //   implementation map every field 1:1 to a real identifier the JSX
    //   (QSortEditor.tsx 699–1488) consumes. Expose ONLY what exists — no
    //   fabricated handlers (W3 lesson). If the JSX consumes something not
    //   listed, add it to the right group; if a listed item has no source
    //   counterpart, remove it and note it. Final interface is whatever the
    //   real consumed set is, grouped as: data / bulk / editing / dialogs /
    //   actions / dnd.
    data: Record<string, unknown>;     // replace with the real typed fields
    bulk: { bulkText: string; setBulkText: (v: string) => void; [k: string]: unknown };
    editing: Record<string, unknown>;
    dialogs: { importDialogOpen: boolean; setImportDialogOpen: (v: boolean) => void;
        [k: string]: unknown };
    actions: Record<string, unknown>;
    dnd: { sensors: unknown; [k: string]: unknown };
}

export function useQSortEditor(props: QSortEditorProps): UseQSortEditorResult {
    // ⟶ MOVE verbatim: the entire component body from `const { t } =
    //   useTranslation();` (QSortEditor.tsx:309) through the LAST line
    //   before `return (` at 699 — every useState, the staleByStatementId
    //   useMemo, both useEffects, useSensors, all handlers
    //   (handleSyncStatement, handleStatementDragEnd, handleBulkSave,
    //   handleClearAll, updateGridCapacity, addExtremeColumns,
    //   removeExtremeColumns, autoShapeGrid, handleSaveStatement,
    //   handleImported, …), and the derived values (hasLinkedStatements,
    //   activeSubTab/setActiveSubTab proxy, grid).
    //
    //   Wiring changes ALLOWED (behaviour-identical only):
    //   - destructure `props` instead of the component's param list:
    //     the component is `({ readOnly, structureLocked }) =>` — use
    //     `const { readOnly, structureLocked } = props;` preserving those
    //     exact identifiers (and any unused-prefixed name verbatim).
    //   NO other logic edits — behaviour identical. The moved code's
    //   store calls, query/mutation, effects, and handlers must be byte-
    //   identical (only the function wrapper + props destructure differ).

    return {
        // ⟶ Build the role-grouped object from the moved locals, mapping
        //   keys 1:1 to the identifiers the JSX consumes. `dnd.sensors`
        //   is the moved `sensors`. Do not rename a handler the JSX uses;
        //   alias it under its group with its exact JSX-referenced name.
    } as UseQSortEditorResult;
}
```

Note: the placeholder interface uses index signatures so the scaffold
type-checks before the body is filled. During implementation, **replace each
`Record<string, unknown>` / `[k: string]: unknown` with the explicit typed
fields** — the final interface must be fully typed and `any`-free, every
member a real JSX-consumed identifier (read the JSX 699–1488, list every
identifier it references from the moved body, and that list IS the interface).
If you cannot complete the typed interface without `any`, narrow with a
precise type; never `any`, never `biome-ignore`. If a JSX-needed identifier
has no source counterpart or vice-versa, STOP and report (do not fabricate).

- [ ] **Step 4: Run the first hook test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/admin/useQSortEditor.test.ts`
Expected: PASS. If the moved body throws on mount in the test env (missing store/query mock), add the mocks per the precedent (`useRecruitmentPage.test.ts`) — that is test scaffolding, not a behaviour change.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run type-check`
Expected: exit 0. (`QSortEditor.tsx` still has its own copy — fine; removed in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/admin/useQSortEditor.ts frontend/src/hooks/admin/useQSortEditor.test.ts
git commit -m "feat(designer): extract useQSortEditor hook (logic verbatim)

Phase-5-G W4. State/store/query/handlers relocated verbatim into the
hook; role-grouped any-free return mapped to JSX-consumed identifiers;
sensors returned for <DndContext> binding. QSortEditor.tsx still holds
its own copy until Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rewire QSortEditor.tsx to consume the hook

**Files:**
- Modify: `frontend/src/components/admin/designer/QSortEditor.tsx`

- [ ] **Step 1: Replace the logic block with the hook call**

In `QSortEditor.tsx`:
- Add `import { useQSortEditor, type UseQSortEditorResult } from '@/hooks/admin/useQSortEditor';` and import `QSortEditorProps` from the hook if it now owns it (otherwise keep the local interface and pass it to the hook generic — pick whichever keeps types single-sourced and cycle-free; the hook exporting `QSortEditorProps` and the component importing it back is the precedent, W3).
- Replace the span from `const { t } = useTranslation();` (309) through the last line before `return (` (699) with a single destructured `useQSortEditor(props)` call. Change the component signature to `(props: QSortEditorProps)` and pass `props` straight through; destructure the hook's grouped return into the EXACT identifiers the JSX below already uses (do NOT edit the JSX — alias to it). Bind `sensors` from `dnd` onto the existing `<DndContext sensors={sensors}>`.
- Delete the now-orphaned moved local types (if they were moved to the hook). Keep `SortableStatementItem` (95–300) exactly as-is.

- [ ] **Step 2: Handle the pre-existing complexity suppression**

The `biome-ignore lint/complexity/noExcessiveCognitiveComplexity` at line ~307 was justified by the inline logic now moved out. After the rewrite the component is mostly declarative JSX:
- Run `cd frontend && npm run lint`. If lint passes **without** the suppression, delete it (precedent: W2/W3 dropped suppressions no longer needed). If `noExcessiveCognitiveComplexity` still fires on the JSX shell, keep the suppression **on the component shell** with an updated one-line rationale (tabbed JSX shell). **Never** move it into the hook; never add a new suppression of any rule.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run type-check`
Expected: exit 0. Fix unused/missing imports until clean (let `tsc -b`/Biome drive; the component should lose the react-query/dnd-sensors/store imports it no longer uses). No `any` introduced.

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: 0 errors. No new `biome-ignore`. (The complexity suppression is either gone or unchanged-on-shell per Step 2.)

- [ ] **Step 5: The cardinal gate — QSortEditor.test.tsx unchanged + green**

Run: `cd frontend && git diff --exit-code src/components/admin/designer/QSortEditor.test.tsx && npx vitest run src/components/admin/designer/QSortEditor.test.tsx 2>&1 | tail -3`
Expected: `git diff --exit-code` exits 0 (the oracle — existing 17 + Task-1 characterization tests — is byte-UNMODIFIED) AND every test passes (same count as end of Task 1). If the test file had to change to pass, behaviour changed → STOP and escalate; do NOT edit the test.

- [ ] **Step 6: Full suite + consumer**

Run: `cd frontend && npx vitest run 2>&1 | grep -E "Tests " | tail -1`
Expected: full suite green at the **Task-0 baseline count + Task-1 characterization adds + the 1 Task-2 hook test**. `StudyDesignPage.tsx` unmodified; `tsc -b` (Step 3) already proved its `<QSortEditor … />` call site type-checks against the unchanged `QSortEditorProps`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/designer/QSortEditor.tsx
git commit -m "refactor(designer): QSortEditor consumes useQSortEditor

Component reduced to JSX shell + SortableStatementItem. Oracle
(QSortEditor.test.tsx) byte-unchanged and green. Props unchanged;
StudyDesignPage untouched. No behaviour change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add the pure-logic hook unit tests

**Files:**
- Modify: `frontend/src/hooks/admin/useQSortEditor.test.ts`

- [ ] **Step 1: Add ≥4 more pure-logic tests (≥5 total)**

Append `describe` blocks via `renderHook` (mock store/generated per the
precedent; reuse the Task-2 setup) covering genuine hook-derived behaviour
(not mock tautologies):

1. **import-format detection** — set `bulk.setBulkText` to a CSV sample then a
   TSV sample; assert `detectedFormat` updates as the current code derives it.
2. **reorder index math** — drive `dnd.onDragEnd` with a known
   active/over id pair; assert the resulting statement order (the same
   reorder the characterization test asserts at the component level, here at
   the hook level).
3. **stale-map derivation** — with the stale query mocked to return ids,
   assert `data`'s `staleByStatementId` maps exactly those ids.
4. **edit-state machine** — `editing.begin(index)` then `commit` mutates;
   `begin` then `cancel` leaves state unchanged.
5. **import-mode selection** — `bulk.setImportMode('append')` then `runImport`
   appends (vs `replace` overwrites) on a seeded draft.

Assert real behaviour; if a path can only be expressed as a mock tautology,
substitute a different genuine pure-logic path and say so.

- [ ] **Step 2: Run the hook test file**

Run: `cd frontend && npx vitest run src/hooks/admin/useQSortEditor.test.ts`
Expected: ≥5 tests pass.

- [ ] **Step 3: Lint/format**

Run: `cd frontend && npx @biomejs/biome check --write src/hooks/admin/useQSortEditor.test.ts && npx @biomejs/biome check src/hooks/admin/useQSortEditor.test.ts`
Expected: formatting normalized; 0 errors/0 warnings. Re-run Step 2's vitest to confirm.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/admin/useQSortEditor.test.ts
git commit -m "test(designer): cover useQSortEditor pure-logic paths (>=5)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Final verification against the Definition of Done

**Files:** none (verification only; fix inline if a gate fails).

- [ ] **Step 1: Type + build + lint**

Run: `cd frontend && npm run type-check && npm run build && npm run lint 2>&1 | tail -1`
Expected: `tsc -b` exit 0; `vite build` succeeds; lint 0 errors, no new `biome-ignore`.

- [ ] **Step 2: Oracle byte-unchanged-since-Task-1 + full suite**

Run: `cd frontend && git diff --exit-code $(git rev-parse HEAD~3) -- src/components/admin/designer/QSortEditor.test.tsx; echo "diff-vs-task1-exit:$?" && npx vitest run 2>&1 | grep -E "Test Files|Tests " | tail -2`
Expected: the test file is identical to its Task-1 committed state (no change in Tasks 2–4 — adjust the rev to the Task-1 commit if `HEAD~3` is not it; the intent: `QSortEditor.test.tsx` unchanged since Task 1). Full suite green at Task-0 baseline + Task-1 characterization adds + ≥5 Task-2/4 hook tests, no regression.

- [ ] **Step 3: Shell shrank; scope discipline**

Run: `wc -l < frontend/src/components/admin/designer/QSortEditor.tsx && git diff chore/code-quality-wave2-studyconfig-typing...HEAD --name-only`
Expected: `QSortEditor.tsx` decreased ≥300 lines from 1488. Changed files vs the W2 branch = the spec/plan docs + `useQSortEditor.ts` + `useQSortEditor.test.ts` + `QSortEditor.tsx` + `QSortEditor.test.tsx` ONLY. `StudyDesignPage.tsx` NOT in the diff. `QSortEditor.helpers.ts`/`.helpers.test.ts` NOT in the diff. No other wave's files.

- [ ] **Step 4: No `any`, no new suppressions**

Run: `cd frontend && grep -nE ': any|as any|<any>' src/hooks/admin/useQSortEditor.ts src/components/admin/designer/QSortEditor.tsx || echo "no any"` and `git diff chore/code-quality-wave2-studyconfig-typing...HEAD -- src/hooks/admin/useQSortEditor.ts src/components/admin/designer/QSortEditor.tsx | grep '^+' | grep -c "biome-ignore"`
Expected: "no any"; added-`biome-ignore` count 0 (the pre-existing shell suppression is either deleted or unchanged-in-place — a relocated/kept pre-existing line is not a `+` add unless its rationale text changed; if it changed, confirm it is still on the component shell, never in the hook).

- [ ] **Step 5: Final commit if inline fixes were made**

```bash
git add -A
git commit -m "chore(designer): wave-4 DoD fixups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(Skip if Steps 1–4 were green with no edits.)

---

## Self-Review

**Spec coverage:**
- Characterization-first, committed before any component change → Task 1 (component untouched; Task 2+ are the only component edits). ✓
- 4 under-covered areas (dnd reorder / concourse sync + stale map / import-mode matrix / inline edit) → Task 1 Step 1 (one `describe` each). ✓
- Phase-5-G state-hook extraction; `sensors` hook-returned, JSX-bound → Task 2 Step 3 + Task 3 Step 1. ✓
- `SortableStatementItem` stays; `.helpers.ts` untouched → Task 2 "Do NOT move SortableStatementItem", Task 5 Step 3 asserts helpers not in diff. ✓
- Illustrative API fixed to real consumed identifiers, no fabrication (W3 lesson) → Task 2 Step 3 explicit interface-build instruction + STOP-on-discrepancy. ✓
- Oracle (existing 17 + characterization) byte-unchanged through extraction → Task 3 Step 5 `git diff --exit-code`, Task 5 Step 2. ✓
- ≥5 hook unit tests → Task 4. ✓
- DoD (type-check/build/lint/suite/≥300-drop/consumer/no-any/no-new-biome-ignore) → Task 5. ✓
- Pre-existing complexity suppression: keep-on-shell-or-drop, never in hook → Task 3 Step 2. ✓
- Stacked on W2 branch; diff framed vs W2 → header + Task 5 Step 3. ✓

**Placeholder scan:** The `// ⟶ MOVE` markers are explicit verbatim-relocation directives with exact line anchors (re-transcribing ~385 LOC risks transcription error and violates no-behaviour-change — the W1/W3 reviewers accepted this approach). The interface scaffold's index signatures are a deliberate compile-before-fill device with an explicit "replace each with the real typed fields" instruction — not a TBD. The characterization test bodies are intentionally specified by *behaviour to lock + harness to reuse* rather than literal selectors: characterization tests must be written against the live component's actual DOM, which the engineer reads at implementation time; the exact behaviours to assert (drag-end order, sync mutation call + stale clear, the replace/append/sync results, commit-vs-cancel semantics) are concrete. Genuinely new standalone code (hook test scaffold, hook docstring/signature) is shown in full.

**Type consistency:** `UseQSortEditorResult` group names (`data/bulk/editing/dialogs/actions/dnd`) are identical in Task 2 (definition), Task 2 first test (`dnd.sensors`, `bulk.setBulkText`, `dialogs.importDialogOpen`), Task 3 (destructure), and Task 4 (`bulk.setImportMode`, `dnd.onDragEnd`, `editing.begin`, `data` stale map). `QSortEditorProps` exported from the hook, imported back by the component (W3 precedent, stated in Task 3 Step 1).

**Open note for the reviewer:** the judgement risks are (a) the verbatim move of ~385 LOC of store/query/dnd glue — defended structurally by the byte-unchanged oracle (existing 17 + Task-1 characterization) enforced via `git diff --exit-code`, and (b) the characterization tests genuinely capturing the under-covered behaviours rather than passing trivially. The spec-reviewer should independently confirm the four characterization tests assert real draft/mutation state (not mock tautologies) and that the Task-2 interface ended up fully typed (no residual `Record<string, unknown>`/index-signature escape hatch, no `any`).
