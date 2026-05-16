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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyUpdate } from '@/api/model';
import { useStudyDesigner } from '@/store/useStudyDesigner';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { mockStaleQuery, mockSyncMutation, mockInvalidateQueries } = vi.hoisted(() => ({
    mockStaleQuery: vi.fn(),
    mockSyncMutation: vi.fn(),
    mockInvalidateQueries: vi.fn(),
}));

// Mirror the generated-API + store mocking pattern used by the precedent
// hook tests (useRecruitmentPage.test.ts): spread the real module, override
// only the symbols the moved body calls.
vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<typeof import('@/api/generated')>('@/api/generated');
    return {
        ...actual,
        useCheckStaleStatementsApiAdminStudiesSlugStaleStatementsGet: () => mockStaleQuery(),
        useSyncStatementFromConcourseApiAdminStudiesSlugSyncStatementStatementIdPost: () =>
            mockSyncMutation(),
    };
});

vi.mock('@tanstack/react-query', async () => {
    const actual =
        await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
    };
});

import { useQSortEditor } from './useQSortEditor';

const seedDraft: StudyUpdate = {
    statements: [
        {
            code: 's1',
            translations: [{ language_code: 'en', text: 'Existing Statement' }],
        },
    ],
    grid_config: [
        { score: -1, capacity: 1 },
        { score: 0, capacity: 1 },
        { score: 1, capacity: 1 },
    ],
    translations: [{ language_code: 'en' }],
} as unknown as StudyUpdate;

beforeEach(() => {
    vi.clearAllMocks();
    mockStaleQuery.mockReturnValue({ data: undefined });
    mockSyncMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, variables: undefined });
    // The moved body keeps its verbatim `if (!draft) return null;` guard, so
    // a non-null draft must be seeded for the hook to return its surface.
    // Store seeding is test scaffolding, not a behaviour change.
    useStudyDesigner.setState({
        draft: seedDraft,
        original: null,
        activeLocale: 'en',
        activeSubStep: 'statements',
    });
});

describe('useQSortEditor — initial shape', () => {
    it('returns the role-grouped surface without throwing on mount', () => {
        const { result } = renderHook(() => useQSortEditor({}));
        expect(result.current).not.toBeNull();
        if (!result.current) throw new Error('hook returned null with a seeded draft');
        expect(result.current.dnd.sensors).toBeDefined();
        expect(typeof result.current.bulk.setBulkText).toBe('function');
        expect(result.current.dialogs.importDialogOpen).toBe(false);
    });
});
