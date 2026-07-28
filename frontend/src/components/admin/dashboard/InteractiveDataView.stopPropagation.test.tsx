/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Guards the row_actions button's "navigate exactly once" invariant
 * (InteractiveDataView.columns.tsx / InteractiveDataView.tsx) against
 * regression, and records how it was proven.
 *
 * Task 6.7i's own report called `e.stopPropagation()`'s effect "not directly
 * testable in this stack" because a real Routes/Route render can't
 * distinguish one navigate() call from two to the identical destination —
 * the same route renders either way. That claim was wrong: mocking
 * `useNavigate` and counting calls discriminates cleanly.
 *
 * RED, captured before the review round's fixes landed (both reverted
 * locally, one at a time, to isolate each): with the row_actions button's
 * `e.stopPropagation()` removed and *no* interactive-descendant guard on the
 * row's own onClick, both tests below failed with "expected 1, got 2" —
 * confirming the reviewer's independent finding. Restoring
 * `stopPropagation()` alone (still no row guard) turned both GREEN.
 *
 * The row's onClick then gained its own interactive-descendant guard
 * (`e.target.closest('button,a,input,select,[role="button"]')`, task 6.7i
 * review minor finding 2) as defense-in-depth. Re-review (2026-07-28) found
 * that once that guard exists, the two tests above can no longer isolate
 * `stopPropagation()`'s own effect: with the guard present and
 * `stopPropagation()` alone removed, both stay GREEN (2/2) — the guard
 * matches on the click's target regardless of whether the button stopped
 * propagation, so it alone is sufficient. That made the original framing
 * ("the invariant is solved and tested") overstated: only the row-level
 * guard was actually standing watch going forward.
 *
 * `GuardlessRowHarness` below closes that gap for real: it renders the
 * *actual* row_actions column (imported from InteractiveDataView.columns.tsx
 * via `buildColumns`, not reimplemented) inside a deliberately bare
 * `<tr onClick>` that has no interactive-descendant guard at all — the
 * production guard lives in InteractiveDataView.tsx, one file away, and
 * this harness never imports it. So this test can only pass because of the
 * button's own `e.stopPropagation()`; nothing else in the harness could
 * account for GREEN. That is what makes it a standing regression test for
 * the button-level layer specifically, independent of whatever
 * InteractiveDataView.tsx's row handler does or stops doing in the future.
 *
 * Kept in its own file rather than folded into InteractiveDataView.test.tsx:
 * mocking react-router-dom's `useNavigate` here would silently turn every
 * *other* test in that file's real Routes/Route navigation into no-ops
 * (mockNavigate never actually changes the location), which would make
 * `screen.findByTestId('participant-detail')` never resolve there.
 */

import { useMemo } from 'react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import type { TFunction } from 'i18next';
import { enUS } from 'date-fns/locale';
import { render, renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { DumpParticipant, DumpResponse } from './types';
import InteractiveDataView from './InteractiveDataView';
import { buildColumns } from './InteractiveDataView.columns';

const { mockDumpQuery, mockNavigate } = vi.hoisted(() => ({
    mockDumpQuery: vi.fn(),
    mockNavigate: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetStudyDumpApiAdminStudiesSlugDumpGet: () => mockDumpQuery(),
    getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey: (slug: string) => ['dump', slug],
}));
vi.mock('@/api/mutator', () => ({ customInstance: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>();
    return { ...actual, useNavigate: () => mockNavigate };
});

function makeParticipant(over: Partial<DumpParticipant> = {}): DumpParticipant {
    return {
        id: 'abcd1234',
        db_id: 1,
        duration_seconds: 619,
        scores: [],
        placements: {},
        presort: {},
        postsort: {},
        language: 'en',
        is_discarded: false,
        created_at: '2026-01-01T00:00:00Z',
        submitted_at: '2026-01-01T00:10:19Z',
        status: 'completed',
        ...over,
    } as DumpParticipant;
}

function dumpResponse(): DumpResponse {
    return {
        study: {
            slug: 'demo',
            statements: [],
            translations: [{ lang: 'en', title: 'Study' }],
            presort_config: {},
            postsort_config: {},
            state: 'active',
            rough_sort_enabled: true,
        },
        participants: [makeParticipant()],
        statement_id_to_index: {},
    } as unknown as DumpResponse;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDumpQuery.mockReturnValue({ data: dumpResponse(), isLoading: false, error: null });
});

describe('InteractiveDataView — row_actions stopPropagation invariant (Task 6.7i review)', () => {
    it('calls navigate exactly once when the View button is clicked directly', async () => {
        const user = userEvent.setup();
        renderWithProviders(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        const viewButton = screen.getByRole('button', { name: 'View participant abcd1234' });
        await user.click(viewButton);

        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    it('calls navigate exactly once on Enter, not twice via the row', async () => {
        const user = userEvent.setup();
        renderWithProviders(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        const viewButton = screen.getByRole('button', { name: 'View participant abcd1234' });
        viewButton.focus();
        await user.keyboard('{Enter}');

        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });
});

// Minimal `t()` stand-in: real interpolation (`{{id}}` -> value), no i18n
// provider needed. The row_actions cell only ever calls `t()` with a
// literal key + fallback + a flat interpolation object, so this covers it
// exactly; every other column's `t()` calls never run because the harness
// below only mounts the row_actions column.
const fakeT = ((key: string, fallback?: string, opts?: Record<string, unknown>) => {
    let result = fallback ?? key;
    if (opts) {
        for (const [name, value] of Object.entries(opts)) {
            result = result.replaceAll(`{{${name}}}`, String(value));
        }
    }
    return result;
}) as unknown as TFunction;

interface GuardlessRowHarnessProps {
    participant: DumpParticipant;
    onView: (participant: DumpParticipant) => void;
    onRowClick: () => void;
}

/**
 * Renders the *real* row_actions column (via `buildColumns`, the same
 * factory InteractiveDataView.tsx uses) inside a bare `<tr onClick>` that
 * has no interactive-descendant guard — unlike the production `<TableRow>`
 * in InteractiveDataView.tsx, which does. This isolates the button's own
 * `e.stopPropagation()` from that guard: nothing here could make the row
 * handler stay silent except the button's own call.
 */
function GuardlessRowHarness({ participant, onView, onRowClick }: GuardlessRowHarnessProps) {
    const columns = useMemo(
        () =>
            buildColumns({
                t: fakeT,
                currentLocale: enUS,
                duplicateIpGroups: new Map(),
                showLanguageColumn: false,
                statusFilter: 'all',
                consentFilters: new Set(),
                qualityFilter: 'all',
                stepFilter: 'all',
                stepLabels: {},
                toggleConsent: () => {},
                setStatusFilter: () => {},
                setStepFilter: () => {},
                setConsentFilters: () => {},
                setQualityFilter: () => {},
                onViewParticipant: onView,
            }).filter((column) => column.id === 'row_actions'),
        [onView]
    );
    const table = useReactTable({
        data: [participant],
        columns,
        getCoreRowModel: getCoreRowModel(),
    });
    const [row] = table.getRowModel().rows;
    return (
        <table>
            <tbody>
                <tr onClick={onRowClick}>
                    {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                    ))}
                </tr>
            </tbody>
        </table>
    );
}

describe("InteractiveDataView.columns — row_actions button's own stopPropagation, isolated from the row-level guard (Task 6.7i re-review)", () => {
    it('stops the click reaching a guard-less row handler on mouse click', async () => {
        const user = userEvent.setup();
        const onView = vi.fn();
        const onRowClick = vi.fn();
        const participant = makeParticipant();

        render(
            <GuardlessRowHarness
                participant={participant}
                onView={onView}
                onRowClick={onRowClick}
            />
        );

        await user.click(screen.getByRole('button', { name: 'View participant abcd1234' }));

        expect(onView).toHaveBeenCalledTimes(1);
        // If e.stopPropagation() were ever deleted from the row_actions
        // button (InteractiveDataView.columns.tsx), this harness has no
        // other guard to fall back on — onRowClick would fire too.
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('stops the click reaching a guard-less row handler on Enter', async () => {
        const user = userEvent.setup();
        const onView = vi.fn();
        const onRowClick = vi.fn();
        const participant = makeParticipant();

        render(
            <GuardlessRowHarness
                participant={participant}
                onView={onView}
                onRowClick={onRowClick}
            />
        );

        const viewButton = screen.getByRole('button', { name: 'View participant abcd1234' });
        viewButton.focus();
        await user.keyboard('{Enter}');

        expect(onView).toHaveBeenCalledTimes(1);
        expect(onRowClick).not.toHaveBeenCalled();
    });
});
