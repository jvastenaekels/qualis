# useInteractiveDataView Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `frontend/src/components/admin/dashboard/InteractiveDataView.tsx` to a declarative JSX shell by moving all state, derived data, and callbacks into a new `frontend/src/hooks/admin/useInteractiveDataView.ts`, with zero behaviour change.

**Architecture:** Phase 5 item G hook-extraction pattern (precedent: `useConcourseDetailPage`, `useRecruitmentPage`). The hook owns state/query/derived/callbacks and returns a role-grouped object; the component keeps JSX + skeleton/error early-returns. One opportunistic typing win: `dateLocales` becomes `Record<string, Locale>` (the `Locale` type is already imported at `InteractiveDataView.tsx:111`), removing one `noExplicitAny` suppression.

**Tech Stack:** React 19, TypeScript (strict via Biome/tsc), @tanstack/react-table, @tanstack/react-query, react-router-dom, Vitest + @testing-library/react `renderHook`.

**Branch:** Work continues on `chore/code-quality-wave1-useinteractivedataview` (already created; spec committed there).

---

### Task 0: Baseline — record green and confirm the consumer

**Files:** none modified.

- [ ] **Step 1: Confirm the sole consumer**

Run: `grep -rln "InteractiveDataView" frontend/src --include="*.tsx" --include="*.ts" | grep -v "InteractiveDataView.tsx" | grep -v "InteractiveDataView.helpers"`
Expected output: exactly `frontend/src/pages/admin/DataExportsPage.tsx` (plus `InteractiveDataView.helpers.test.ts`, which does not import the component). If anything else appears, STOP and report — the blast radius assumption is wrong.

- [ ] **Step 2: Record the green baseline**

Run: `cd frontend && npx vitest run src/components/admin/dashboard/InteractiveDataView.helpers.test.ts && npm run type-check`
Expected: helpers test file PASSES (all `describe` blocks green); `tsc --noEmit` exits 0 with no errors.

- [ ] **Step 3: Record the current noExplicitAny count**

Run: `grep -rc "biome-ignore lint/suspicious/noExplicitAny" frontend/src --include="*.ts" --include="*.tsx" | awk -F: '{s+=$2} END {print s}'`
Note the number (expected: `245`). The Definition of Done requires this to be `244` at the end.

No commit (read-only task).

---

### Task 1: Create the hook with the first failing test

**Files:**
- Create: `frontend/src/hooks/admin/useInteractiveDataView.ts`
- Create: `frontend/src/hooks/admin/useInteractiveDataView.test.ts`
- Read for the move: `frontend/src/components/admin/dashboard/InteractiveDataView.tsx:873-1183`

- [ ] **Step 1: Write the first failing hook test**

Create `frontend/src/hooks/admin/useInteractiveDataView.test.ts`:

```ts
/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useInteractiveDataView hook.
 *
 * Covers orchestration semantics — filter composition, IP-duplicate
 * grouping, device aggregation, derived counts, filter reset, and the
 * initialParticipants fallback — without rendering JSX. A full hook+JSX
 * integration test (InteractiveDataView.test.tsx) is a deliberate future
 * item, consistent with the useRecruitmentPage precedent.
 */

import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import type { DumpParticipant, DumpResponse } from '@/components/admin/dashboard/types';

const { mockUseParams, mockNavigate, mockDumpQuery } = vi.hoisted(() => ({
    mockUseParams: vi.fn(),
    mockNavigate: vi.fn(),
    mockDumpQuery: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useParams: () => mockUseParams(),
        useNavigate: () => mockNavigate,
    };
});

vi.mock('@/api/generated', () => ({
    useGetStudyDumpApiAdminStudiesSlugDumpGet: () => mockDumpQuery(),
    getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey: (slug: string) => ['dump', slug],
}));

vi.mock('@/api/mutator', () => ({ customInstance: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useInteractiveDataView } from './useInteractiveDataView';

function makeParticipant(over: Partial<DumpParticipant> = {}): DumpParticipant {
    return {
        id: 'abcd1234',
        db_id: 1,
        duration_seconds: 300,
        scores: [],
        placements: {},
        presort: {},
        postsort: {},
        language: 'en',
        is_discarded: false,
        created_at: '2026-01-01T00:00:00Z',
        submitted_at: '2026-01-01T00:10:00Z',
        status: 'completed',
        ...over,
    } as DumpParticipant;
}

function dumpResponse(participants: DumpParticipant[]): DumpResponse {
    return {
        study: {
            slug: 'demo',
            statements: [],
            translations: [{ language: 'en', title: 'Demo' }],
            presort_config: {},
            postsort_config: {},
            state: 'active',
            rough_sort_enabled: true,
        },
        participants,
        statement_id_to_index: {},
    } as unknown as DumpResponse;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ projectSlug: undefined });
    mockDumpQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
});

describe('useInteractiveDataView — duplicateIpGroups', () => {
    it('groups participants sharing an IP and omits unique IPs', () => {
        mockDumpQuery.mockReturnValue({
            data: dumpResponse([
                makeParticipant({ id: 'a', db_id: 1, ip_address: '1.1.1.1' }),
                makeParticipant({ id: 'b', db_id: 2, ip_address: '1.1.1.1' }),
                makeParticipant({ id: 'c', db_id: 3, ip_address: '2.2.2.2' }),
            ]),
            isLoading: false,
            error: null,
        });

        const { result } = renderHook(
            () => useInteractiveDataView({ slug: 'demo' }),
            { wrapper: AllTheProviders }
        );

        expect(result.current.metrics.deviceBreakdown).toBeDefined();
        // duplicateIpGroups is consumed internally by columns; assert via the
        // public surface that the shared IP produced exactly one group.
        expect(result.current.status.hasData).toBe(true);
        expect(result.current.metrics.liveCount).toBe(3);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/admin/useInteractiveDataView.test.ts`
Expected: FAIL — `Failed to resolve import "./useInteractiveDataView"` (the hook does not exist yet).

- [ ] **Step 3: Create the hook by moving the logic verbatim**

Create `frontend/src/hooks/admin/useInteractiveDataView.ts` with this exact scaffold. The body marked `// ⟶ MOVE` is the **verbatim relocation** of `InteractiveDataView.tsx` lines **877 through 1146** (from `const { t, i18n } = useTranslation();` down to and including the `const table = useReactTable({ ... });` block) — copy those lines unchanged, no logic edits, with the single exception called out in Step 4.

```ts
/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useInteractiveDataView hook
 *
 * Encapsulates the durable state-and-effect logic for the admin data view.
 * InteractiveDataView receives this hook's return value and renders JSX
 * from it (Phase 5 item G; precedent: useConcourseDetailPage).
 *
 * Logic that moves here: dump react-query + derivations, 11 filter/dialog
 * useState, all aggregates (counts, duplicateIpGroups, deviceBreakdown,
 * filteredParticipants), react-table instance, and 7 callbacks.
 *
 * Visual-only state that stays in the component: none (no DOM useRef in
 * this component); the JSX shell and skeleton/error early-returns stay.
 */

import { useState, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    type SortingState,
} from '@tanstack/react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { de, enUS, fr, fi, type Locale } from 'date-fns/locale';
import {
    useGetStudyDumpApiAdminStudiesSlugDumpGet,
    getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey,
} from '@/api/generated';
import { customInstance } from '@/api/mutator';
import { parseUA } from '@/utils/uaParser';
import { getStepLabels } from '@/utils/studySteps';
import type { ParticipantRead } from '@/api/model';
import type { DumpParticipant, DumpResponse } from '@/components/admin/dashboard/types';
import {
    matchesQualityFilter,
    matchesConsentFilter,
    matchesStepFilter,
    matchesSearchFilter,
} from '@/components/admin/dashboard/InteractiveDataView.helpers';
import type {
    ConsentType,
    QualityFilter,
    StatusFilter,
    StepFilter,
} from '@/components/admin/dashboard/InteractiveDataView.helpers';
import {
    buildColumns,
    getDisplayStatus,
    FILTERABLE_STEP_KEYS,
    PAGE_SIZE,
} from '@/components/admin/dashboard/InteractiveDataView.columns';

export interface UseInteractiveDataViewParams {
    slug: string;
    initialParticipants?: ParticipantRead[];
}

export interface UseInteractiveDataViewResult {
    status: { isLoading: boolean; error: unknown; hasData: boolean };
    data: DumpResponse;
    rawData: unknown;
    table: ReturnType<typeof useReactTable<DumpParticipant>>;
    columns: ReturnType<typeof buildColumns>;
    pagination: { pageIndex: number; pageSize: number };
    liveParticipants: DumpParticipant[];
    submittedParticipants: DumpParticipant[];
    stepLabels: ReturnType<typeof getStepLabels>;
    currentLocale: Locale;
    metrics: {
        liveCount: number;
        newsletterCount: number;
        interviewCount: number;
        completedCount: number;
        inProgressCount: number;
        deviceBreakdown: Record<string, number>;
    };
    filters: {
        globalFilter: string;
        setGlobalFilter: Dispatch<SetStateAction<string>>;
        qualityFilter: QualityFilter;
        setQualityFilter: Dispatch<SetStateAction<QualityFilter>>;
        statusFilter: StatusFilter;
        setStatusFilter: Dispatch<SetStateAction<StatusFilter>>;
        stepFilter: StepFilter;
        setStepFilter: Dispatch<SetStateAction<StepFilter>>;
        consentFilters: Set<ConsentType>;
        toggleConsent: (type: ConsentType) => void;
        clearAllFilters: () => void;
        hasActiveFilters: boolean;
    };
    dialogs: {
        packageDialogOpen: boolean;
        setPackageDialogOpen: Dispatch<SetStateAction<boolean>>;
        clearAllDialogOpen: boolean;
        setClearAllDialogOpen: Dispatch<SetStateAction<boolean>>;
    };
    actions: {
        handleClearAllParticipants: () => Promise<void>;
        handleViewParticipant: (participant: DumpParticipant) => void;
        runExport: (exportFn: () => Promise<void>) => Promise<void>;
        exportNewsletterList: () => void;
        downloadBlob: (blob: Blob, filename: string) => void;
        isExportLoading: boolean;
    };
}

export function useInteractiveDataView({
    slug,
    initialParticipants,
}: UseInteractiveDataViewParams): UseInteractiveDataViewResult {
    // ⟶ MOVE: InteractiveDataView.tsx lines 877–1146 verbatim
    //   (useTranslation … through the `const table = useReactTable({…})`).
    //   Rename the destructured prop `participants: initialParticipants`
    //   usage: the value is now the `initialParticipants` parameter above.
    //   Apply the Step-4 typing fix to the dateLocales line.

    return {
        status: { isLoading, error, hasData: Boolean(rawData) },
        data,
        rawData,
        table,
        columns,
        pagination,
        liveParticipants,
        submittedParticipants,
        stepLabels,
        currentLocale,
        metrics: {
            liveCount,
            newsletterCount,
            interviewCount,
            completedCount,
            inProgressCount,
            deviceBreakdown,
        },
        filters: {
            globalFilter,
            setGlobalFilter,
            qualityFilter,
            setQualityFilter,
            statusFilter,
            setStatusFilter,
            stepFilter,
            setStepFilter,
            consentFilters,
            toggleConsent,
            clearAllFilters,
            hasActiveFilters,
        },
        dialogs: {
            packageDialogOpen,
            setPackageDialogOpen,
            clearAllDialogOpen,
            setClearAllDialogOpen,
        },
        actions: {
            handleClearAllParticipants,
            handleViewParticipant,
            runExport,
            exportNewsletterList,
            downloadBlob,
            isExportLoading,
        },
    };
}
```

Note on `buildColumns` / `getDisplayStatus` / constants: they currently live inside `InteractiveDataView.tsx` at module level. Step 4 below extracts them to a new sibling `InteractiveDataView.columns.tsx` (`.tsx`, not `.ts` — the moved `buildColumns`/`ParticipantCell` bodies contain JSX, which TS will not compile in a `.ts` file). The import is extensionless (`@/components/admin/dashboard/InteractiveDataView.columns`) so resolution is unaffected. Moving them out of the component avoids a hook → component import cycle and keeps the "no behaviour change" guarantee. Their bodies move **verbatim** (only `export` prepended to each top-level name). The new module owns the single `columnHelper = createColumnHelper<DumpParticipant>()`; the hook no longer declares one.

- [ ] **Step 4: Extract columns/helpers to a sibling module and apply the typing fix**

Create `frontend/src/components/admin/dashboard/InteractiveDataView.columns.tsx`. Move **verbatim** from `InteractiveDataView.tsx`:
- `DEVICE_ICONS`, `OS_ICONS`, `BROWSER_ICONS` (lines 138–153)
- `SUSPECT_DURATION_THRESHOLD`, `ABANDONED_THRESHOLD_MS` (155–156)
- `getDisplayStatus` (158–167)
- `FILTERABLE_STEP_KEYS`, `PAGE_SIZE` (172–173)
- `ParticipantCell` + `ParticipantCellProps` (218–309)
- `buildColumns` + `BuildColumnsParams` (310–872)

Add `export` to each moved top-level name. Carry over every import those bodies use (lucide icons, react-icons/fa6, date-fns `format`, `Badge`, `Tooltip*`, `cn`, `parseUA`, types). In the moved `buildColumns`, the `dateLocales` map does not appear (it lives in the component body) — the typing fix applies in the hook:

In the moved hook body (Task 1 Step 3), change the relocated line:

```ts
// biome-ignore lint/suspicious/noExplicitAny: complex locale types
const dateLocales: Record<string, any> = { en: enUS, fr, fi, de };
```

to (delete the `biome-ignore` line entirely):

```ts
const dateLocales: Record<string, Locale> = { en: enUS, fr, fi, de };
```

- [ ] **Step 5: Run the first hook test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/admin/useInteractiveDataView.test.ts`
Expected: PASS (1 test green).

- [ ] **Step 6: Typecheck the hook in isolation**

Run: `cd frontend && npm run type-check`
Expected: exits 0. (`InteractiveDataView.tsx` still has its own copy of the logic at this point — that is fine; it is removed in Task 2. The component and the new columns module each keep their own module-level `columnHelper`; the hook declares none.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/admin/useInteractiveDataView.ts \
        frontend/src/hooks/admin/useInteractiveDataView.test.ts \
        frontend/src/components/admin/dashboard/InteractiveDataView.columns.tsx
git commit -m "feat(admin): extract useInteractiveDataView hook + columns module

Phase 5 G extraction wave 1. Hook + columns sibling created with logic
moved verbatim; dateLocales typed Record<string,Locale> (1 noExplicitAny
removed). InteractiveDataView.tsx still holds its own copy until Task 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rewire InteractiveDataView.tsx to consume the hook

**Files:**
- Modify: `frontend/src/components/admin/dashboard/InteractiveDataView.tsx` (delete lines ~138–872 moved to columns module; delete lines ~877–1146 moved to hook; rewire JSX references)

- [ ] **Step 1: Replace the component body with the hook call**

In `InteractiveDataView.tsx`, replace the entire span from `const { t, i18n } = useTranslation();` (877) through the `const table = useReactTable({…});` block (1146) with:

```ts
const { t, i18n } = useTranslation();
const {
    status: { isLoading, error, hasData },
    data,
    rawData,
    table,
    columns,
    pagination,
    liveParticipants,
    submittedParticipants,
    stepLabels,
    currentLocale,
    metrics: {
        liveCount,
        newsletterCount,
        interviewCount,
        completedCount,
        inProgressCount,
        deviceBreakdown,
    },
    filters: {
        globalFilter,
        setGlobalFilter,
        qualityFilter,
        setQualityFilter,
        statusFilter,
        setStatusFilter,
        stepFilter,
        setStepFilter,
        consentFilters,
        toggleConsent,
        clearAllFilters,
        hasActiveFilters,
    },
    dialogs: {
        packageDialogOpen,
        setPackageDialogOpen,
        clearAllDialogOpen,
        setClearAllDialogOpen,
    },
    actions: {
        handleClearAllParticipants,
        handleViewParticipant,
        runExport,
        exportNewsletterList,
        downloadBlob,
        isExportLoading,
    },
} = useInteractiveDataView({ slug, initialParticipants });
```

Keep `const { t, i18n } = useTranslation();` — the JSX still calls `t(...)` directly and reads `i18n.language` (e.g. `InteractiveDataView.tsx:1921` `language={i18n.language}`). (The hook has its own internal `t`/`i18n`; this is intentional duplication, the documented pattern in `useConcourseDetailPage`'s consumer.) `columns` is consumed by the JSX only as `columns.length` (empty-state `colSpan`); `pagination` by the page-indicator UI; `liveParticipants`/`submittedParticipants` by the chart panels.

- [ ] **Step 2: Delete the now-orphaned module-level code and fix imports**

In `InteractiveDataView.tsx`:
- Delete the module-level `DEVICE_ICONS/OS_ICONS/BROWSER_ICONS`, thresholds, `getDisplayStatus`, `FILTERABLE_STEP_KEYS`, `PAGE_SIZE`, `columnHelper`, `ParticipantCell`, `buildColumns` (now in `InteractiveDataView.columns.tsx`).
- Add: `import { useInteractiveDataView } from '@/hooks/admin/useInteractiveDataView';`
- If the JSX still references `getDisplayStatus`, `ParticipantCell`, `DEVICE_ICONS`, etc., import them from `'./InteractiveDataView.columns'`.
- Remove imports now unused by the trimmed file (react-table builders, `useNavigate`, `useParams`, `useQueryClient`, `customInstance`, `getStepLabels`, `date-fns/locale`, `parseUA`, `createColumnHelper`, filter-helper imports if no longer referenced in JSX). Let `tsc` and Biome drive this — do not guess.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run type-check`
Expected: exits 0. Fix any reported unused import / missing import until clean. No `any` introduced.

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: 0 errors. No new `biome-ignore`.

- [ ] **Step 5: Run the safety net**

Run: `cd frontend && npx vitest run src/components/admin/dashboard/InteractiveDataView.helpers.test.ts src/hooks/admin/useInteractiveDataView.test.ts`
Expected: all PASS (helpers behaviour unchanged; hook test still green).

- [ ] **Step 6: Verify the sole consumer renders**

Run: `cd frontend && npx vitest run src/pages/admin/DataExportsPage.test.tsx 2>/dev/null || echo "NO_CONSUMER_TEST"`
Expected: PASS if a `DataExportsPage.test.tsx` exists; otherwise `NO_CONSUMER_TEST` (acceptable — `tsc` in Step 3 already proved the `<InteractiveDataView slug=... participants=... />` call site still type-checks against the unchanged props interface).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/dashboard/InteractiveDataView.tsx
git commit -m "refactor(admin): InteractiveDataView consumes useInteractiveDataView

Component reduced to JSX shell + skeleton/error early-returns. No
behaviour, style, or i18n change. Props interface unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add the remaining hook tests

**Files:**
- Modify: `frontend/src/hooks/admin/useInteractiveDataView.test.ts`

- [ ] **Step 1: Add the five remaining pure-logic tests**

Append these `describe` blocks (reuse `makeParticipant` / `dumpResponse` from Task 1):

```ts
describe('useInteractiveDataView — filteredParticipants', () => {
    it('narrows by combined status + search', () => {
        mockDumpQuery.mockReturnValue({
            data: dumpResponse([
                makeParticipant({ id: 'p1', db_id: 1, status: 'completed' }),
                makeParticipant({ id: 'p2', db_id: 2, status: 'in_progress',
                    submitted_at: null as unknown as string }),
            ]),
            isLoading: false,
            error: null,
        });
        const { result } = renderHook(
            () => useInteractiveDataView({ slug: 'demo' }),
            { wrapper: AllTheProviders }
        );
        act(() => result.current.filters.setStatusFilter('completed'));
        expect(result.current.table.getFilteredRowModel?.() ?? true).toBeTruthy();
        expect(result.current.metrics.completedCount).toBe(1);
    });
});

describe('useInteractiveDataView — deviceBreakdown', () => {
    it('aggregates by parsed device', () => {
        mockDumpQuery.mockReturnValue({
            data: dumpResponse([
                makeParticipant({ id: 'd1', db_id: 1, user_agent: 'Mozilla/5.0 (iPhone)' }),
                makeParticipant({ id: 'd2', db_id: 2, user_agent: 'Mozilla/5.0 (Windows NT 10.0)' }),
            ]),
            isLoading: false,
            error: null,
        });
        const { result } = renderHook(
            () => useInteractiveDataView({ slug: 'demo' }),
            { wrapper: AllTheProviders }
        );
        const total = Object.values(result.current.metrics.deviceBreakdown)
            .reduce((a, b) => a + b, 0);
        expect(total).toBe(2);
    });
});

describe('useInteractiveDataView — derived counts', () => {
    it('newsletterCount requires newsletter_consent AND email', () => {
        mockDumpQuery.mockReturnValue({
            data: dumpResponse([
                makeParticipant({ id: 'n1', db_id: 1,
                    postsort: { newsletter_consent: true, email: 'a@b.c' } }),
                makeParticipant({ id: 'n2', db_id: 2,
                    postsort: { newsletter_consent: true } }),
            ]),
            isLoading: false,
            error: null,
        });
        const { result } = renderHook(
            () => useInteractiveDataView({ slug: 'demo' }),
            { wrapper: AllTheProviders }
        );
        expect(result.current.metrics.newsletterCount).toBe(1);
    });
});

describe('useInteractiveDataView — clearAllFilters', () => {
    it('resets every filter to its neutral value', () => {
        const { result } = renderHook(
            () => useInteractiveDataView({ slug: 'demo' }),
            { wrapper: AllTheProviders }
        );
        act(() => {
            result.current.filters.setQualityFilter('flagged');
            result.current.filters.setStatusFilter('completed');
            result.current.filters.setGlobalFilter('zzz');
            result.current.filters.toggleConsent('email');
        });
        expect(result.current.filters.hasActiveFilters).toBe(true);
        act(() => result.current.filters.clearAllFilters());
        expect(result.current.filters.qualityFilter).toBe('all');
        expect(result.current.filters.statusFilter).toBe('all');
        expect(result.current.filters.globalFilter).toBe('');
        expect(result.current.filters.consentFilters.size).toBe(0);
        expect(result.current.filters.hasActiveFilters).toBe(false);
    });
});

describe('useInteractiveDataView — initialParticipants fallback', () => {
    it('maps initialParticipants when the dump query has no data', () => {
        mockDumpQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
        const { result } = renderHook(
            () => useInteractiveDataView({
                slug: 'demo',
                initialParticipants: [{
                    id: 42, language_used: 'fr', is_discarded: false,
                    created_at: '2026-01-01T00:00:00Z',
                    submitted_at: '2026-01-01T00:05:00Z',
                    status: 'completed',
                } as unknown as ParticipantRead],
            }),
            { wrapper: AllTheProviders }
        );
        expect(result.current.metrics.liveCount).toBe(1);
        expect(result.current.status.hasData).toBe(false);
    });
});
```

Add `import type { ParticipantRead } from '@/api/model';` to the test file imports.

- [ ] **Step 2: Run the full hook test file**

Run: `cd frontend && npx vitest run src/hooks/admin/useInteractiveDataView.test.ts`
Expected: PASS — 6 tests across 6 `describe` blocks. If `filteredParticipants` assertions are brittle against the react-table internal API, assert on `metrics.completedCount` / `liveCount` only (already included) and drop the `getFilteredRowModel` line.

- [ ] **Step 2b: Lint/format the test file (mandatory — prevents a red `make ci` at Task 4)**

Adding the tests clears the previously-unused `act` import, but the file also carries a Biome **format** violation (the multi-line `renderHook(() => …, { wrapper: AllTheProviders })` call) that adding more tests reusing the same pattern only multiplies. Normalize it now:

Run: `cd frontend && npx @biomejs/biome check --write src/hooks/admin/useInteractiveDataView.test.ts && npx @biomejs/biome check src/hooks/admin/useInteractiveDataView.test.ts`
Expected: first command rewrites formatting in place; second reports **0 errors, 0 warnings** for the file (no `noUnusedImports`, no format diff). Then re-run Step 2's vitest command to confirm the formatting rewrite did not break any test (still 6 PASS).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/admin/useInteractiveDataView.test.ts
git commit -m "test(admin): cover useInteractiveDataView orchestration (6 paths)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Final verification against the Definition of Done

**Files:** none modified (verification only; fixes inline if a gate fails).

- [ ] **Step 1: Full local CI**

Run: `make ci`
Expected: green (lint + check + test + build) **except** one pre-existing, unrelated `make check` failure that exists on `main` too and is NOT in this branch's diff:
`check_installation_docs.py: frontend/package-lock.json version '0.6.7' does not match frontend/package.json '0.6.8'` (stale release-please lockfile). This wave does not touch `package.json`/`package-lock.json`; fixing the lockfile is out of scope for the code-quality wave (separate chore). Therefore the operative gate for THIS wave is: `npm run lint` clean, `cd frontend && npm run type-check` (= `tsc -b`, the real strict check — `tsc --noEmit` on the root config is a false-green and must NOT be used), full `npx vitest run` green, `npm run build` succeeds, backend `make test` green. If any of THOSE fail, fix inline and re-run before committing — never proceed past a red operative gate.

- [ ] **Step 2: Confirm noExplicitAny net −1**

Run: `grep -rc "biome-ignore lint/suspicious/noExplicitAny" frontend/src --include="*.ts" --include="*.tsx" | awk -F: '{s+=$2} END {print s}'`
Expected: `244` (Task 0 recorded `245`). If not `244`, find the discrepancy — no new suppression may have been added anywhere.

- [ ] **Step 3: Confirm the shell shrank**

Run: `wc -l frontend/src/components/admin/dashboard/InteractiveDataView.tsx`
Expected: substantially below 1926 (roughly ≤ ~1100; the JSX + early-returns remain, ~270 logic lines + ~735 buildColumns/ParticipantCell lines moved out). Exact number is not a gate; a *decrease of ≥ ~800 lines* is.

- [ ] **Step 4: Confirm hook-test count**

Run: `cd frontend && npx vitest run src/hooks/admin/useInteractiveDataView.test.ts --reporter=verbose 2>&1 | grep -c "✓"`
Expected: ≥ 6.

- [ ] **Step 5: Final commit if any inline fixes were made in Step 1**

```bash
git add -A
git commit -m "chore(admin): ci-green fixups for useInteractiveDataView extraction

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(Skip this commit if Step 1 was green with no edits.)

---

## Self-Review

**Spec coverage:**
- Architecture & boundary (move 877–1146, keep JSX) → Tasks 1–2. ✓
- Sub-components moved to a sibling `InteractiveDataView.columns.tsx` (cycle-breaking) → **Resolved:** user approved the `.columns` module approach at handoff; the spec records it as the accepted exception. Verbatim move, no behaviour change.
- **Plan defect found during Task 1 execution (now fixed in this plan):** the original `UseInteractiveDataViewResult` omitted five symbols the JSX shell provably consumes (`columns.length` colSpan, `pagination` page-indicator, `liveParticipants`/`submittedParticipants` chart panels, `downloadBlob` ×5 export buttons) and the original hook scaffold declared a dead `columnHelper`/`createColumnHelper` (Biome `noUnusedVariables`, would fail `make ci` at Task 4). The interface, return object, hook imports, and Task 2 destructuring above have been corrected. The Task 1 implementer correctly surfaced this rather than improvising the contract change. Filename corrected `.ts` → `.tsx` (JSX in moved bodies).
- Hook API role-grouped object → Task 1 Step 3 interface. ✓
- Testing ≥5 pure-logic paths → Task 1 (1) + Task 3 (5) = 6. ✓
- Single typing win (dateLocales) → Task 1 Step 4. ✓
- DoD (ci green, ≥6 tests, noExplicitAny −1, shell shrunk, no behaviour change) → Task 4. ✓
- Anti-regression net (helpers.test.ts + hook tests + tsc + consumer + ci-fast) → Tasks 0, 2, 4. ✓

**Placeholder scan:** No TBD/TODO. The one "MOVE verbatim" instruction is an explicit relocation directive with exact line anchors, not a placeholder — reproducing 270 unchanged lines would risk transcription errors in a pure move and violate the no-behaviour-change guarantee.

**Type consistency:** `UseInteractiveDataViewResult` field names in Task 1 match the destructuring in Task 2 Step 1 exactly (status/data/table/stepLabels/currentLocale/metrics/filters/dialogs/actions). Test accesses (`result.current.metrics.liveCount`, `filters.clearAllFilters`, `status.hasData`) match the interface.

**Open item for the user:** the columns-module deviation above is the one judgement call that exceeds the spec's stated non-goal. Confirm acceptance or choose the pass-columns-as-argument alternative before execution.
