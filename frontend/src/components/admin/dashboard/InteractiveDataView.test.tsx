/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * InteractiveDataView.test.tsx
 *
 * Guards the responses table's header/body cell parity (Task 1.1). The
 * regression: with a multilingual study, `showLanguageColumn` adds a
 * `language` column whose body cells render but whose header did not —
 * leaving every column from "Status" onward reading under the wrong
 * label. Root cause was a React Compiler auto-memoization bug in the
 * thead render (InteractiveDataView.tsx), not the column definitions in
 * InteractiveDataView.columns.tsx — see the `'use no memo'` doc comment at
 * the top of InteractiveDataView for the full mechanism. These tests can't
 * reproduce the compiler-specific defect directly (Vitest doesn't run the
 * React Compiler babel pass — see vitest.config.ts vs vite.config.ts), but
 * they pin the structural contract the bug violated: header count must
 * match body cell count, and the language column must have a visible
 * header. The compiler-specific RED/GREEN guard lives in
 * frontend/e2e/admin/data-table-columns.spec.ts, which runs against the
 * real `npm run dev` pipeline (React Compiler included).
 */

import { renderWithProviders, screen, within } from '@/test-utils/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DumpParticipant, DumpResponse } from './types';
import InteractiveDataView from './InteractiveDataView';

const { mockDumpQuery } = vi.hoisted(() => ({ mockDumpQuery: vi.fn() }));

vi.mock('@/api/generated', () => ({
    useGetStudyDumpApiAdminStudiesSlugDumpGet: () => mockDumpQuery(),
    getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey: (slug: string) => ['dump', slug],
}));
vi.mock('@/api/mutator', () => ({ customInstance: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

// A two-translation study is what turns showLanguageColumn on
// (useInteractiveDataView.ts: `showLanguageColumn = data.study.translations.length > 1`).
function dumpResponseWithTranslations(langs: string[]): DumpResponse {
    return {
        study: {
            slug: 'demo',
            statements: [],
            translations: langs.map((lang) => ({ lang, title: `Study (${lang})` })),
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
    mockDumpQuery.mockReturnValue({
        data: dumpResponseWithTranslations(['en', 'fr']),
        isLoading: false,
        error: null,
    });
});

describe('InteractiveDataView — responses table header/body alignment', () => {
    it('renders one header cell per data cell when the study is multilingual', async () => {
        renderWithProviders(<InteractiveDataView slug="demo" />);

        const table = await screen.findByRole('table');
        const headerCells = within(table).getAllByRole('columnheader');
        const firstBodyRow = within(table).getAllByRole('row')[1];
        const bodyCells = within(firstBodyRow).getAllByRole('cell');

        expect(headerCells).toHaveLength(bodyCells.length);
    });

    it('labels the language column', async () => {
        renderWithProviders(<InteractiveDataView slug="demo" />);

        expect(await screen.findByRole('columnheader', { name: /lang/i })).toBeInTheDocument();
    });
});
