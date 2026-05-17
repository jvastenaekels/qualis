# useInteractiveDataView extraction — design

**Date:** 2026-05-16
**Status:** Approved (design)
**Scope:** Code-quality program, Wave 1 of the audit-waves track.

## Background

A churn × size hotspot audit (12-month git history × current LOC, source files,
excluding generated and test files) surfaced three top candidates:

| File | LOC | 12-mo commits | Verdict |
|---|---|---|---|
| `frontend/src/components/GridSort.tsx` | 1154 | 156 | Already decomposed — false positive |
| `frontend/src/layouts/StudyLayout.tsx` | 932 | 109 | Already decomposed — false positive |
| `frontend/src/components/admin/dashboard/InteractiveDataView.tsx` | 1926 | 76 | True monolith — Wave 1 target |

Inspection eliminated two of three. `GridSort` already delegates to 4 extracted
hooks and 9 sub-components; its remaining body is a deliberately documented JSX
shell with load-bearing autofit/zoom/responsive coupling (E2E-covered, prior
wave W4a). `StudyLayout` already delegates to ~9 extracted hooks. For both, high
churn is feature velocity on the participant-flow core, not debt.

`InteractiveDataView` is the only genuine monolith: 1926 lines, 22 inline
state/effect/callback/memo hooks, 2 in-file sub-components, no dedicated hook,
no extracted business logic. It maps cleanly onto the project's established
Phase 5 item G remedy (CLAUDE.md): extract a `use<Name>` hook into
`hooks/<area>/`, keep the JSX shell, add ≥5 pure-logic hook tests. Precedent:
`useAnalysisPage`, `useStudyDesignPage`, `useRecruitmentPage`,
`useConcourseDetailPage`.

The broader program (audit-waves pattern) is: Wave 1 = this extraction;
Wave 2 = `noExplicitAny` triage (245 frontend suppressions, the dominant debt);
Wave 3 = re-pointed after a mid-program honest backlog review. Only Wave 1 is
specified here. Each wave is its own PR and its own spec → plan → impl cycle.

## Goal

Reduce `InteractiveDataView.tsx` to a declarative JSX shell by extracting all
state, derived data, effects and callbacks into
`frontend/src/hooks/admin/useInteractiveDataView.ts`, with no behaviour change.

## Architecture & boundary

**Moves into the hook** (current lines 877–1146):

- 11 `useState`: `sorting`, `globalFilter`, `qualityFilter`, `consentFilters`,
  `statusFilter`, `stepFilter`, `isExportLoading`, `packageDialogOpen`,
  `pagination`, `clearAllDialogOpen`.
- The `useGetStudyDumpApiAdminStudiesSlugDumpGet` query and its derivations:
  `effectiveParticipants`, `data`, `stepLabels`.
- Aggregates: `liveParticipants`, `liveCount`, `newsletterCount`,
  `interviewCount`, `completedCount`, `inProgressCount`,
  `submittedParticipants`, `duplicateIpGroups`, `deviceBreakdown`,
  `hasActiveFilters`, `filteredParticipants`, `showLanguageColumn`.
- `columns` (via `buildColumns`) and the `useReactTable` instance (`table`).
  A custom hook may legally call `useReactTable`.
- 7 callbacks: `toggleConsent`, `clearAllFilters`,
  `handleClearAllParticipants`, `handleViewParticipant`, `runExport`,
  `downloadBlob`, `exportNewsletterList`.
- Loading/error state exposed as flags: `isLoading`, `error`, `hasData`.

**Stays in the component**: the JSX (current 1185–1926), the skeleton/error
early-returns (now driven by the hook flags). No DOM `useRef` exists in this
component (verified) — no boundary edge case.

**Accepted exception (decided at planning time).** `buildColumns`,
`ParticipantCell`, `getDisplayStatus`, the icon maps and the duration/page
constants currently live at module level *inside* `InteractiveDataView.tsx`.
The hook needs `buildColumns`; importing it from the component would create a
hook → component import cycle. They are therefore moved **verbatim** into a new
sibling `InteractiveDataView.columns.ts`. This is a forced, minimal,
behaviour-preserving move — strictly narrower than gratuitous restructuring,
and the only sub-component relocation permitted. `CollapsibleSection` and the
JSX-only pieces stay in the component. No behaviour, style, or i18n change. No
react-table redesign.

**Single opportunistic typing win:** `dateLocales: Record<string, any>`
(current lines 882–883, carrying a `biome-ignore lint/suspicious/noExplicitAny`)
becomes `Record<string, Locale>` using the `date-fns` `Locale` type. This
removes one of the 245 `noExplicitAny` suppressions and bridges to Wave 2.

## Hook API

`useInteractiveDataView({ slug, initialParticipants })` returns an object
grouped by role (not a flat tuple), so the JSX stays declarative:

```ts
{
  status:  { isLoading, error, hasData },
  data,    // DumpResponse-shaped
  table,   // react-table instance
  stepLabels,
  currentLocale,
  metrics: { liveCount, newsletterCount, interviewCount,
             completedCount, inProgressCount, deviceBreakdown },
  filters: { globalFilter, setGlobalFilter, qualityFilter, setQualityFilter,
             statusFilter, setStatusFilter, stepFilter, setStepFilter,
             consentFilters, toggleConsent, clearAllFilters, hasActiveFilters },
  dialogs: { packageDialogOpen, setPackageDialogOpen,
             clearAllDialogOpen, setClearAllDialogOpen },
  actions: { handleClearAllParticipants, handleViewParticipant,
             runExport, exportNewsletterList, isExportLoading },
}
```

Named sub-objects: the JSX reads `filters.qualityFilter` rather than 11 flat
variables; the surface is testable group by group. No `any` in the hook's
public type; the return type is an explicit interface.

## Testing

`frontend/src/hooks/admin/useInteractiveDataView.test.ts`, ≥5 pure-logic paths
via `renderHook` (Phase 5 G convention):

1. `filteredParticipants` — combined quality + consent + status + step + search
   narrowing produces the correct subset.
2. `duplicateIpGroups` — two participants sharing an IP → group 1; a unique IP
   is absent from the map.
3. `deviceBreakdown` — aggregation by device parsed from `user_agent`.
4. Derived counts — `newsletterCount` requires `newsletter_consent && email`;
   `completedCount` follows `getDisplayStatus`.
5. `toggleConsent` / `clearAllFilters` — toggle adds then removes; clearAll
   resets all filters to `'all'` / empty set.
6. `effectiveParticipants` fallback — `rawData` absent + `initialParticipants`
   provided → correct mapping shape.

**Anti-regression net (corrected at planning time).** No full-render
`InteractiveDataView.*.test.tsx` exists — only
`InteractiveDataView.helpers.test.ts` (filter helpers, already extracted to
`InteractiveDataView.helpers.ts`, well covered). The net for this wave is:
`InteractiveDataView.helpers.test.ts` (unchanged) + the new hook unit tests +
TypeScript strict + the sole consumer `pages/admin/DataExportsPage.tsx` still
compiling/rendering + `make ci-fast`. A full hook+JSX integration test is
explicitly a future item (consistent with the `useRecruitmentPage` precedent,
whose own docstring records the same deliberate gap), not this wave.

## Risks

- **Hook order.** `useReactTable` must remain after `columns` /
  `filteredParticipants`. Moving the whole block into the hook preserves order.
- **Filter / sort / pagination regression.** Filter logic is covered by the
  unchanged `InteractiveDataView.helpers.test.ts`; the hook's *composition* of
  those helpers is covered by the new hook tests; structural breakage is caught
  by TypeScript strict and by the sole consumer `DataExportsPage.tsx`. Plus
  `make ci-fast`. Run admin E2E only if `ci-fast` passes (touches admin-flow
  code). The absence of a full-render integration test is a known, accepted
  gap (see Anti-regression net above), not introduced by this wave.

## Definition of done

- `InteractiveDataView` reduced to JSX shell + skeleton/error early-returns.
- `make ci` green.
- ≥6 hook tests in `useInteractiveDataView.test.ts`.
- One `biome-ignore lint/suspicious/noExplicitAny` removed; global
  `noExplicitAny` count net −1.
- No behaviour, style, or i18n change.

## Non-goals

- Moving in-file sub-components to sibling files *beyond* the accepted
  cycle-breaking exception (`InteractiveDataView.columns.ts`) above.
- Any behaviour, style, or i18n change.
- react-table redesign.
- Touching `GridSort` or `StudyLayout` (audit false positives).
- Specifying Wave 2+ (re-pointed after mid-program backlog review).
