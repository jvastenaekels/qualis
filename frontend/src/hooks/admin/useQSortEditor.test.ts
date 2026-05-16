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

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyRead, StudyUpdate } from '@/api/model';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';

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

/** Three-statement draft used in reorder + import tests */
const multiDraft: StudyUpdate = {
    statements: [
        { code: 'a', translations: [{ language_code: 'en', text: 'Alpha' }] },
        { code: 'b', translations: [{ language_code: 'en', text: 'Beta' }] },
        { code: 'c', translations: [{ language_code: 'en', text: 'Gamma' }] },
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

// ── 1. Import-format detection ────────────────────────────────────────────────
// Drives `setBulkText` with a CSV-like "list" line and then a TSV header line;
// asserts that `detectedFormat` updates as the useEffect derives it from the
// text content (pure derived state — no mock tautology).
describe('useQSortEditor — import-format detection', () => {
    it('detects "list" format from code:text pattern, then "excel" from TSV header', async () => {
        const { result } = renderHook(() => useQSortEditor({}));
        if (!result.current) throw new Error('hook returned null with a seeded draft');

        // Initially format is null
        expect(result.current.bulk.detectedFormat.type).toBeNull();

        // Set a "list" sample — matches /^([a-zA-Z0-9_-]{1,15})\s*[:,-]\s+/
        act(() => {
            result.current?.bulk.setBulkText('s1: This is a statement\ns2: Another statement');
        });
        await waitFor(() => {
            expect(result.current?.bulk.detectedFormat.type).toBe('list');
        });
        expect(result.current.bulk.detectedFormat.hasCode).toBe(true);

        // Now set a TSV header sample — first line contains tab + 'code' + 'en'
        act(() => {
            result.current?.bulk.setBulkText('code\ten\ns1\tFirst statement');
        });
        await waitFor(() => {
            expect(result.current?.bulk.detectedFormat.type).toBe('excel');
        });
        expect(result.current.bulk.detectedFormat.hasCode).toBe(true);
        // seedDraft has only 'en' in translations → langs is exactly ['en']
        expect(result.current.bulk.detectedFormat.langs).toEqual(['en']);
    });

    it('clears detectedFormat when bulkText is emptied', async () => {
        const { result } = renderHook(() => useQSortEditor({}));
        if (!result.current) throw new Error('hook returned null with a seeded draft');

        act(() => {
            result.current?.bulk.setBulkText('s1: A statement');
        });
        await waitFor(() => expect(result.current?.bulk.detectedFormat.type).toBe('list'));

        act(() => {
            result.current?.bulk.setBulkText('');
        });
        await waitFor(() => {
            expect(result.current?.bulk.detectedFormat.type).toBeNull();
        });
    });
});

// ── 2. Reorder index math ─────────────────────────────────────────────────────
// Drives `handleStatementDragEnd` with known active/over codes; asserts that
// the resulting draft.statements order equals the real `arrayMove` output.
// (The hook uses `localizedStatements.findIndex(s => s.code === ...)` to map
// codes to indices — pure index math, asserted against the same arrayMove.)
describe('useQSortEditor — reorder index math', () => {
    it('moves the dragged statement to the correct position via arrayMove', () => {
        useStudyDesigner.setState({ draft: multiDraft });
        const { result } = renderHook(() => useQSortEditor({}));
        if (!result.current) throw new Error('hook returned null with a seeded draft');

        // Drag 'a' (index 0) over 'c' (index 2) → expected order: b, c, a
        const expected = arrayMove(['a', 'b', 'c'], 0, 2);

        const fakeEvent = {
            active: { id: 'a' },
            over: { id: 'c' },
        } as unknown as DragEndEvent;

        act(() => {
            result.current?.dnd.handleStatementDragEnd(fakeEvent);
        });

        const newCodes = useStudyDesigner
            .getState()
            .draft?.statements?.map((s) => (s as { code: string }).code);
        expect(newCodes).toEqual(expected);
    });
});

// ── 3. Stale-map derivation ───────────────────────────────────────────────────
// Mocks the stale query to return a known entry; asserts that `staleByStatementId`
// maps exactly that statement_id to the correct StaleInfo object.
describe('useQSortEditor — stale-map derivation', () => {
    it('maps stale query data into staleByStatementId keyed by statement_id', () => {
        // Seed original with a slug + a statement that has source_concourse_item_id
        // so the hook enables the stale query.
        const mockOriginal = {
            id: 1,
            slug: 'test-study',
            statements: [{ id: 42, code: 's1', source_concourse_item_id: 7 }],
        } as unknown as StudyRead;
        useStudyDesigner.setState({ original: mockOriginal });

        // Mock the stale query to return one stale entry
        mockStaleQuery.mockReturnValue({
            data: [
                {
                    statement_id: 42,
                    statement_code: 's1',
                    source_concourse_item_id: 7,
                    source_deleted: false,
                    concourse_translations: [{ language_code: 'en', text: 'Concourse text' }],
                    current_translations: [{ language_code: 'en', text: 'Local text' }],
                },
            ],
        });

        const { result } = renderHook(() => useQSortEditor({}));
        if (!result.current) throw new Error('hook returned null with a seeded draft');

        const staleMap = result.current.data.staleByStatementId;
        expect(staleMap.has(42)).toBe(true);
        const entry = staleMap.get(42);
        expect(entry?.source_deleted).toBe(false);
        expect(entry?.concourse_translations[0]?.text).toBe('Concourse text');
        // Only the one entry — no phantom ids
        expect(staleMap.size).toBe(1);
    });
});

// ── 4. Edit-state machine ─────────────────────────────────────────────────────
// (a) begin edit → commit → draft mutated;
// (b) begin edit → cancel (setEditingIndex(null)) → draft unchanged.
describe('useQSortEditor — edit-state machine', () => {
    it('commit path: setEditingIndex+Text+Code then handleSaveStatement updates draft', () => {
        const { result } = renderHook(() => useQSortEditor({}));
        if (!result.current) throw new Error('hook returned null with a seeded draft');

        // Begin editing statement at index 0
        act(() => {
            result.current?.editing.setEditingIndex(0);
            result.current?.editing.setEditingText('Updated text');
            result.current?.editing.setEditingCode('s1-updated');
        });

        expect(result.current.editing.editingIndex).toBe(0);
        expect(result.current.editing.editingText).toBe('Updated text');
        expect(result.current.editing.editingCode).toBe('s1-updated');

        // Commit
        act(() => {
            result.current?.editing.handleSaveStatement();
        });

        // editingIndex reset to null after save
        expect(result.current.editing.editingIndex).toBeNull();

        // Draft statement mutated
        const saved = useStudyDesigner.getState().draft?.statements?.[0] as {
            code: string;
            translations: { language_code: string; text: string }[];
        };
        expect(saved.code).toBe('s1-updated');
        expect(saved.translations[0]?.text).toBe('Updated text');
    });

    it('cancel path: setEditingIndex then setEditingIndex(null) leaves draft unchanged', () => {
        const { result } = renderHook(() => useQSortEditor({}));
        if (!result.current) throw new Error('hook returned null with a seeded draft');

        const originalCode = useStudyDesigner.getState().draft?.statements?.[0] as {
            code: string;
        };

        act(() => {
            result.current?.editing.setEditingIndex(0);
            result.current?.editing.setEditingText('Abandoned edit');
            result.current?.editing.setEditingCode('abandoned');
        });

        // Cancel by resetting index without calling handleSaveStatement
        act(() => {
            result.current?.editing.setEditingIndex(null);
        });

        expect(result.current.editing.editingIndex).toBeNull();

        // Draft is unchanged — code is still the original
        const afterCancel = useStudyDesigner.getState().draft?.statements?.[0] as {
            code: string;
        };
        expect(afterCancel.code).toBe(originalCode.code);
    });
});

// ── 5. Import-mode selection — append ────────────────────────────────────────
// Reproduces the W4-oracle-locked duplicate-code quirk at hook level (mirrors
// QSortEditor.test.tsx characterization case). In 'append' mode the hook calls
// `mergeParsedItemIntoStatements` with importMode='append', which always pushes
// a new entry (de-dup is sync-only). Feeding an explicitly-coded input whose
// code ('s1') matches the existing statement yields a duplicate 's1' entry.
// The oracle (QSortEditor.test.tsx) snapshots ['s1','s1','s5'] for this input;
// we assert the same result at hook level.
describe('useQSortEditor — import-mode selection (append)', () => {
    it('append mode with explicit existing code produces duplicate code (oracle-locked quirk)', async () => {
        const { result } = renderHook(() => useQSortEditor({}));
        if (!result.current) throw new Error('hook returned null with a seeded draft');

        // Confirm baseline: 1 statement with code 's1'
        expect(result.current.data.statements).toHaveLength(1);

        act(() => {
            result.current?.bulk.setImportMode('append');
        });
        expect(result.current.bulk.importMode).toBe('append');

        // List-format input with explicit codes: 's1' duplicates the existing entry,
        // 's5' is new. This mirrors the exact oracle input in QSortEditor.test.tsx.
        act(() => {
            result.current?.bulk.setBulkText('s1: Synced One\ns5: Fresh One');
        });

        // Wait for format detection to settle (list)
        await waitFor(() => expect(result.current?.bulk.detectedFormat.type).toBe('list'));

        // Run bulk save
        act(() => {
            result.current?.bulk.handleBulkSave();
        });

        // Oracle-locked quirk: append pushes both parsed items regardless of code
        // collision — de-dup is sync-only. Result: original s1 + appended s1 + s5.
        const afterStatements = useStudyDesigner.getState().draft?.statements;
        const codes = afterStatements?.map((s) => (s as { code: string }).code);
        expect(codes).toEqual(['s1', 's1', 's5']);

        // bulkText cleared after save
        expect(result.current.bulk.bulkText).toBe('');
    });
});
