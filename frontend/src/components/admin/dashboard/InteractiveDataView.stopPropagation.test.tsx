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
 * review minor finding 2) as defense-in-depth. That guard is now, by
 * itself, sufficient to keep navigate() to one call even if a future
 * control's own `stopPropagation()` is ever dropped — so at the current
 * HEAD this file's two tests are a regression guard on the *observable*
 * "navigate exactly once" behaviour with two independent layers protecting
 * it, not a test that can still isolate which layer is doing the work. That
 * is the intended effect of "belt-and-braces": the two protections were
 * proven independently above, not because this file can keep telling them
 * apart forever.
 *
 * Kept in its own file rather than folded into InteractiveDataView.test.tsx:
 * mocking react-router-dom's `useNavigate` here would silently turn every
 * *other* test in that file's real Routes/Route navigation into no-ops
 * (mockNavigate never actually changes the location), which would make
 * `screen.findByTestId('participant-detail')` never resolve there.
 */

import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { DumpParticipant, DumpResponse } from './types';
import InteractiveDataView from './InteractiveDataView';

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
