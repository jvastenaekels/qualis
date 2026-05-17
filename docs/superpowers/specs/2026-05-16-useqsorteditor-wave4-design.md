# Wave 4 — useQSortEditor extraction — design

**Date:** 2026-05-16
**Status:** Approved (design)
**Scope:** Code-quality program, Wave 4 of the audit-waves track.

## Background

The Wave-2 backlog review identified `QSortEditor.tsx` as the deferred
Wave-3 alternative and the next true monolith after AudioRecorder: 1494 LOC,
the highest-churn frontend file (55 commits/12mo), `.helpers.ts` (245 LOC pure)
already extracted but **no state hook**, ~390 LOC of inline logic before the
JSX `return` (line 699 on the W2 branch).

W4 **stacks on the Wave-2 branch** (`chore/code-quality-wave2-studyconfig-typing`,
base `0646b64d`): W2 (#178) already modified `QSortEditor.tsx` (StudyConfig
typing adoption, +19/−25). Extracting the hook from the already-typed file
avoids a guaranteed merge conflict and is cleaner (moving typed logic, not
`any`-laden logic). W4's PR slots after #178 in the merge order
(#177 → #176 → #178 → #179 → W4).

Structure on the W2 branch (1488 LOC):
- `SortableStatementItem` sub-component (lines 95–300) — already a discrete
  in-file dnd-kit sortable row (`useSortable`, JSX at 125).
- `QSortEditor` main component 308 → JSX `return (` at **699**: ~390 LOC of
  inline logic — `useStudyDesigner()` store, `useQueryClient`, the generated
  stale-statements query + sync-from-concourse mutation, ~7 `useState`,
  `staleByStatementId` `useMemo`, 2 `useEffect`s, `useSensors`, and all
  handlers (bulk import/parse, statement add/edit/delete, translation, grid
  config, dnd drag-end, concourse-sync).
- Siblings: `QSortEditor.helpers.ts` (+ `.helpers.test.ts`) — pure logic,
  already extracted; **untouched** by W4. `QSortEditor.test.tsx` (314 LOC,
  17 tests, 7 describe blocks).
- Sole real consumer: `StudyDesignPage.tsx` (`parseCsvTsv.ts:9` is a comment,
  not an import).

Decisions taken at brainstorm:
- **Safety net: characterization-first.** Harden the net before extracting.
- Boundary: state hook only; `SortableStatementItem` stays; helpers untouched.

This is Wave 4; its own spec → plan → impl cycle.

## Goal

Reduce `QSortEditor.tsx` to a JSX shell (+ the discrete `SortableStatementItem`)
by extracting the ~390 LOC of inline state/store/query/handler logic into
`frontend/src/hooks/admin/useQSortEditor.ts`, with no behaviour change.

## Architecture & boundary

Phase-5-G hook-extraction (precedents: `useInteractiveDataView` W1,
`useAudioRecorder` W3 — including the W3 pattern of a hook returning a
JSX-bound value created by a hook call).

**Moves into `frontend/src/hooks/admin/useQSortEditor.ts`** (main body
~308–698): `useStudyDesigner()` store subscription, `useQueryClient`, the
generated stale-statements query and sync-from-concourse mutation, the ~7
`useState`, the `staleByStatementId` `useMemo`, the 2 `useEffect`s,
`useSensors(useSensor(PointerSensor…), useSensor(KeyboardSensor…))`, and every
handler (bulk import/parse, statement add/edit/delete, translation update,
grid config, dnd drag-end, concourse-sync). `sensors` is **returned** by the
hook (it is a hook call) and bound by the component as
`<DndContext sensors={sensors}>` — identical to W3's hook-returned
`containerRef`; an established precedent, not a novel exception.

**Stays in `QSortEditor.tsx`:** the JSX (699–1488) and the
`SortableStatementItem` sub-component (95–300, already discrete) — **not
split** (no cycle forces it; program precedent is not to gratuitously move
sub-components). `QSortEditor.helpers.ts` is **untouched**.

**Sole consumer** `StudyDesignPage.tsx` — `QSortEditorProps` unchanged, must
still type-check.

## Hook API

`useQSortEditor(props)` returns a role-grouped, `any`-free object. The shape
below is **illustrative**; the exact surface is fixed during
planning/implementation against the identifiers the JSX actually consumes —
**exposing only what exists, no fabricated handlers** (the W3 lesson: a
brainstorm-time aspirational API had to be synced to source; W4 bakes that in
to avoid repeating the defect cycle).

```ts
{
  data:    { statements, translations, staleByStatementId, … },
  bulk:    { bulkText, setBulkText, detectedFormat, importMode,
             setImportMode, runImport },
  editing: { editingIndex, editingText, editingCode, begin, commit, cancel },
  dialogs: { importDialogOpen, setImportDialogOpen, … },
  actions: { addStatement, deleteStatement, updateTranslation,
             syncFromConcourse, … },
  dnd:     { sensors, onDragEnd },   // sensors: hook-created, bound by JSX
}
```

Controls are stable `useCallback`s; `dnd.sensors` is the hook-returned
binding. Every returned identifier maps 1:1 to a real one the JSX consumes.

## Testing

**Phase order is mandatory:**

1. **Characterization first (on the W2-branch baseline, before any component
   change).** `QSortEditor.test.tsx` (17 tests) covers sub-tab nav, bulk
   import, statement/translation management, grid, validation — but
   under-covers the riskiest extraction surfaces. Add characterization tests
   for: **dnd reorder** (drag-end handler reorders statements); **concourse
   sync** (the sync mutation flow + `staleByStatementId` stale-query memo);
   **import-mode matrix** (`detectedFormat` auto-detect × `replace`/`append`/
   `sync`); **inline edit** (`editingIndex/editingText/editingCode`
   enter→edit→commit/cancel). These run green against the W2-branch
   `QSortEditor` first, committed as the first task — locking current
   behaviour.
2. **Extraction.**
3. The existing 17 tests **and** the new characterization tests stay green
   **unchanged** through the extraction — together they are the
   behaviour-preservation oracle.

Plus ≥5 pure-logic `useQSortEditor` unit tests (`renderHook`) for the
testable paths: import-format detection, reorder index math, stale-map
derivation, edit-state machine, import-mode selection.

## Definition of done

- Characterization tests green on the W2 baseline **before** any
  `QSortEditor.tsx` change (committed as the first task).
- `cd frontend && npm run type-check` (`tsc -b`, the real gate — never
  `tsc --noEmit`) → exit 0.
- `cd frontend && npm run build` → succeeds.
- `cd frontend && npm run lint` → 0 errors; **no new `biome-ignore`** (a
  pre-existing shell-complexity suppression, if present, may remain on the
  component shell — never inside the hook); no `any`.
- `cd frontend && npx vitest run` → full suite green; the existing
  `QSortEditor.test.tsx` **and** the new characterization tests unchanged and
  green + ≥5 new `useQSortEditor` unit tests.
- `QSortEditor.tsx` reduced to a JSX shell + `SortableStatementItem` (~390
  logic LOC moved; expect a ≥300-line decrease).
- `StudyDesignPage.tsx` untouched and still type-checking; `QSortEditorProps`
  unchanged.
- No behaviour change.
- Branch: W4 stacks on `chore/code-quality-wave2-studyconfig-typing`; its PR
  diff is framed against that branch (contains W2 commits until #178 merges);
  PR documents the stack + merge order #178 → W4.

## Non-goals

- Splitting/moving `SortableStatementItem` to a sibling file (no cycle forces
  it; out of scope).
- Touching `QSortEditor.helpers.ts` / `.helpers.test.ts` (pure logic, already
  extracted in a prior phase).
- Modifying the existing `QSortEditor.test.tsx` (it is part of the
  behaviour-preservation oracle — if it must change to pass, behaviour
  changed → stop).
- Changing `QSortEditorProps` or touching `StudyDesignPage.tsx`.
- Refactoring the moved logic (verbatim relocation; only the ref/closure
  wiring needed to live in a hook may change, behaviour-identically).
- Removing/relocating any pre-existing complexity suppression off the shell.
- Touching any other wave's files; reworking the dnd UX or the import parser.
