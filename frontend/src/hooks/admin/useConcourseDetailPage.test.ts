/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useConcourseDetailPage hook.
 *
 * Covers orchestration semantics — derived filtered items, multi-select,
 * mutation dispatch with current form values, query invalidation on success,
 * sheet open/close, CSV export — without rendering JSX. Integration of the
 * hook + JSX would belong in a future ConcourseDetailPage.test.tsx.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { computeNextCode, csvEscape, useConcourseDetailPage } from './useConcourseDetailPage';
import type { ConcourseDetailRead, ConcourseItemRead, ConcourseTagRead } from '@/api/model';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

const {
    mockConcourseQueryHook,
    mockTagsQueryHook,
    mockCreateItemHook,
    mockUpdateItemHook,
    mockDeleteItemHook,
    mockImportItemsHook,
    mockCreateTagHook,
    mockDeleteTagHook,
    mockInvalidateQueries,
} = vi.hoisted(() => ({
    mockConcourseQueryHook: vi.fn(),
    mockTagsQueryHook: vi.fn(),
    mockCreateItemHook: vi.fn(),
    mockUpdateItemHook: vi.fn(),
    mockDeleteItemHook: vi.fn(),
    mockImportItemsHook: vi.fn(),
    mockCreateTagHook: vi.fn(),
    mockDeleteTagHook: vi.fn(),
    mockInvalidateQueries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/api/generated', () => ({
    useGetConcourseApiAdminConcoursesConcourseIdGet: mockConcourseQueryHook,
    useListTagsApiAdminConcoursesTagsGet: mockTagsQueryHook,
    useCreateItemApiAdminConcoursesConcourseIdItemsPost: mockCreateItemHook,
    useUpdateItemApiAdminConcoursesConcourseIdItemsItemIdPatch: mockUpdateItemHook,
    useDeleteItemApiAdminConcoursesConcourseIdItemsItemIdDelete: mockDeleteItemHook,
    useImportItemsFromTextApiAdminConcoursesConcourseIdItemsImportPost: mockImportItemsHook,
    useCreateTagApiAdminConcoursesTagsPost: mockCreateTagHook,
    useDeleteTagApiAdminConcoursesTagsTagIdDelete: mockDeleteTagHook,
    getGetConcourseApiAdminConcoursesConcourseIdGetQueryKey: (id: number) => ['get-concourse', id],
    getListTagsApiAdminConcoursesTagsGetQueryKey: () => ['list-tags'],
}));

vi.mock('@tanstack/react-query', async () => {
    const actual =
        await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => ({
            invalidateQueries: mockInvalidateQueries,
        }),
    };
});

const mockUseParams = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => mockUseParams(),
    };
});

vi.mock('@/hooks/usePermission', () => ({
    usePermission: () => ({
        can: () => true,
        cannot: () => false,
        role: 'owner',
        isOwner: true,
        isResearcher: false,
        isViewer: false,
    }),
}));

vi.mock('@/hooks/useAdminContext', () => ({
    useAdminContext: () => ({
        project: {
            id: 1,
            slug: 'p1',
            title: 'My Project',
            members: [
                {
                    user_id: 7,
                    user: { id: 7, full_name: 'Alice', email: 'alice@example.com' },
                },
                {
                    user_id: 8,
                    user: { id: 8, full_name: null, email: 'bob@example.com' },
                },
            ],
        },
        study: undefined,
    }),
}));

// ── Fixtures ──────────────────────────────────────────────────────

const mockTags: ConcourseTagRead[] = [
    { id: 100, name: 'Theme A', color: '#ff0000' },
    { id: 101, name: 'Theme B', color: '#00ff00' },
] as unknown as ConcourseTagRead[];

const mockItems: ConcourseItemRead[] = [
    {
        id: 1,
        code: 'C1',
        status: 'proposed',
        source: 'Interview #1',
        version: 1,
        display_order: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        translations: [{ language_code: 'en', text: 'Hello world' }],
        tags: [{ id: 100, name: 'Theme A', color: '#ff0000' }],
        comment_count: 0,
    },
    {
        id: 2,
        code: 'C2',
        status: 'accepted',
        version: 1,
        display_order: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        translations: [{ language_code: 'en', text: 'Bonjour le monde' }],
        tags: [],
        comment_count: 2,
    },
    {
        id: 3,
        code: 'X3',
        status: 'rejected',
        version: 2,
        display_order: 2,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        translations: [
            { language_code: 'en', text: 'Hola' },
            { language_code: 'fr', text: 'Salut' },
        ],
        tags: [{ id: 101, name: 'Theme B', color: '#00ff00' }],
        comment_count: 0,
    },
] as unknown as ConcourseItemRead[];

const mockConcourse: ConcourseDetailRead = {
    id: 42,
    project_id: 1,
    title: 'Test Concourse',
    items: mockItems,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
} as unknown as ConcourseDetailRead;

function makeIdleMutation() {
    return { mutateAsync: vi.fn().mockResolvedValue([]), isPending: false };
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ concourseId: '42' });
    mockConcourseQueryHook.mockReturnValue({ data: mockConcourse, isLoading: false });
    mockTagsQueryHook.mockReturnValue({ data: mockTags });
    mockCreateItemHook.mockReturnValue(makeIdleMutation());
    mockUpdateItemHook.mockReturnValue(makeIdleMutation());
    mockDeleteItemHook.mockReturnValue(makeIdleMutation());
    mockImportItemsHook.mockReturnValue(makeIdleMutation());
    mockCreateTagHook.mockReturnValue(makeIdleMutation());
    mockDeleteTagHook.mockReturnValue(makeIdleMutation());
});

// ── Tests ─────────────────────────────────────────────────────────

describe('useConcourseDetailPage', () => {
    it('parses the concourseId from the route, derives canEdit + memberNames', () => {
        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.id).toBe(42);
        expect(result.current.canEdit).toBe(true);
        expect(result.current.memberNames).toEqual({ 7: 'Alice', 8: 'bob@example.com' });
        expect(result.current.concourse).toBe(mockConcourse);
        expect(result.current.tags).toBe(mockTags);
    });

    it('initializes activeLocale to first available language via effect, derives languages set', async () => {
        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        // languages derived from item translations
        await waitFor(() => {
            expect(result.current.activeLocale).toBe('en');
        });
        expect(result.current.languages).toEqual(['en', 'fr']);
    });

    it('filters items by status, tag, and case-insensitive search', () => {
        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        // No filter: all 3 items, sorted by display_order
        expect(result.current.filteredItems.map((i) => i.id)).toEqual([1, 2, 3]);

        // Filter by status
        act(() => result.current.setFilterStatus('accepted'));
        expect(result.current.filteredItems.map((i) => i.id)).toEqual([2]);

        // Reset, filter by tag id (string comparison in current impl)
        act(() => {
            result.current.setFilterStatus('all');
            result.current.setFilterTag('101');
        });
        expect(result.current.filteredItems.map((i) => i.id)).toEqual([3]);

        // Reset, search by text
        act(() => {
            result.current.setFilterTag('all');
            result.current.setSearchQuery('BONJOUR');
        });
        expect(result.current.filteredItems.map((i) => i.id)).toEqual([2]);

        // Search by code
        act(() => result.current.setSearchQuery('x3'));
        expect(result.current.filteredItems.map((i) => i.id)).toEqual([3]);

        // Search by source
        act(() => result.current.setSearchQuery('Interview'));
        expect(result.current.filteredItems.map((i) => i.id)).toEqual([1]);
    });

    it('toggleSelectItem and toggleSelectAll manage selection across filtered items', () => {
        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        // Toggle one item
        act(() => result.current.toggleSelectItem(1));
        expect(result.current.selectedItems.has(1)).toBe(true);

        // Toggle off
        act(() => result.current.toggleSelectItem(1));
        expect(result.current.selectedItems.has(1)).toBe(false);

        // Select all (all 3 are filtered)
        act(() => result.current.toggleSelectAll());
        expect(result.current.selectedItems.size).toBe(3);

        // Toggle all again clears
        act(() => result.current.toggleSelectAll());
        expect(result.current.selectedItems.size).toBe(0);
    });

    it('handleBulkStatusChange dispatches an updateItem mutation per selected item', async () => {
        const mutateAsync = vi.fn().mockResolvedValue({});
        mockUpdateItemHook.mockReturnValue({ mutateAsync, isPending: false });

        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.toggleSelectItem(1);
            result.current.toggleSelectItem(2);
        });

        await act(async () => {
            await result.current.handleBulkStatusChange('accepted');
        });

        expect(mutateAsync).toHaveBeenCalledTimes(2);
        expect(mutateAsync).toHaveBeenCalledWith({
            concourseId: 42,
            itemId: 1,
            data: { version: 1, status: 'accepted' },
        });
        expect(mutateAsync).toHaveBeenCalledWith({
            concourseId: 42,
            itemId: 2,
            data: { version: 1, status: 'accepted' },
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
            queryKey: ['get-concourse', 42],
        });
        // selection cleared on success
        expect(result.current.selectedItems.size).toBe(0);
    });

    it('handleAddItem dispatches createItem with current form values and resets state on success', async () => {
        const mutateAsync = vi.fn().mockResolvedValue({});
        mockCreateItemHook.mockReturnValue({ mutateAsync, isPending: false });

        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        await waitFor(() => expect(result.current.activeLocale).toBe('en'));

        act(() => {
            result.current.setNewCode('C99');
            result.current.setNewText('A new statement');
            result.current.setNewSource('Doc');
            result.current.setNewTagIds([100]);
            result.current.setAddItemOpen(true);
        });

        await act(async () => {
            await result.current.handleAddItem();
        });

        expect(mutateAsync).toHaveBeenCalledWith({
            concourseId: 42,
            data: {
                code: 'C99',
                source: 'Doc',
                translations: [{ language_code: 'en', text: 'A new statement' }],
                tag_ids: [100],
            },
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
            queryKey: ['get-concourse', 42],
        });
        // dialog closed + form fields reset
        expect(result.current.addItemOpen).toBe(false);
        expect(result.current.newCode).toBe('');
        expect(result.current.newText).toBe('');
    });

    it('openAddItemDialog pre-computes the next code from existing items', () => {
        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        act(() => result.current.openAddItemDialog());

        // Existing C1, C2, X3 → max num = 3, last alphabetic prefix = 'X'
        expect(result.current.newCode).toBe('X4');
        expect(result.current.addItemOpen).toBe(true);
    });

    it('startEdit / saveEdit merges translations and dispatches updateItem', async () => {
        const mutateAsync = vi.fn().mockResolvedValue({});
        mockUpdateItemHook.mockReturnValue({ mutateAsync, isPending: false });

        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        await waitFor(() => expect(result.current.activeLocale).toBe('en'));

        act(() => result.current.startEdit(mockItems[2])); // item id 3 with both en+fr
        expect(result.current.editingItem).toBe(3);
        expect(result.current.editCode).toBe('X3');
        expect(result.current.editText).toBe('Hola'); // English text since activeLocale=en

        act(() => {
            result.current.setEditText('Hello updated');
            result.current.setEditChangeNote('typo');
        });

        await act(async () => {
            await result.current.saveEdit(mockItems[2]);
        });

        expect(mutateAsync).toHaveBeenCalledTimes(1);
        const payload = mutateAsync.mock.calls[0][0];
        expect(payload.itemId).toBe(3);
        expect(payload.data.version).toBe(2);
        expect(payload.data.change_comment).toBe('typo');
        // The existing French translation must be preserved + the English one updated
        const trs = payload.data.translations as Array<{ language_code: string; text: string }>;
        const frTr = trs.find((tr) => tr.language_code === 'fr');
        const enTr = trs.find((tr) => tr.language_code === 'en');
        expect(frTr?.text).toBe('Salut');
        expect(enTr?.text).toBe('Hello updated');
        // editing closed on success
        expect(result.current.editingItem).toBeNull();
    });

    it('changeStatus dispatches updateItem with new status only and invalidates', async () => {
        const mutateAsync = vi.fn().mockResolvedValue({});
        mockUpdateItemHook.mockReturnValue({ mutateAsync, isPending: false });

        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.changeStatus(mockItems[0], 'rejected');
        });

        expect(mutateAsync).toHaveBeenCalledWith({
            concourseId: 42,
            itemId: 1,
            data: { version: 1, status: 'rejected' },
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
            queryKey: ['get-concourse', 42],
        });
    });

    it('handleDelete dispatches deleteItem and invalidates concourse query', async () => {
        const mutateAsync = vi.fn().mockResolvedValue({});
        mockDeleteItemHook.mockReturnValue({ mutateAsync, isPending: false });

        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.handleDelete(2);
        });

        expect(mutateAsync).toHaveBeenCalledWith({ concourseId: 42, itemId: 2 });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
            queryKey: ['get-concourse', 42],
        });
    });

    it('handleImport dispatches importMutation with text, prefix, language', async () => {
        const mutateAsync = vi.fn().mockResolvedValue([{ id: 4 }, { id: 5 }]);
        mockImportItemsHook.mockReturnValue({ mutateAsync, isPending: false });

        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        await waitFor(() => expect(result.current.activeLocale).toBe('en'));

        act(() => {
            result.current.setImportText('one\ntwo');
            result.current.setImportPrefix('S');
        });

        await act(async () => {
            await result.current.handleImport();
        });

        expect(mutateAsync).toHaveBeenCalledWith({
            concourseId: 42,
            data: {
                text_block: 'one\ntwo',
                language_code: 'en',
                code_prefix: 'S',
            },
        });
        expect(result.current.importOpen).toBe(false);
        expect(result.current.importText).toBe('');
    });

    it('handleCreateTag and handleDeleteTag dispatch + invalidate the tags query', async () => {
        const createMutate = vi.fn().mockResolvedValue({});
        const deleteMutate = vi.fn().mockResolvedValue({});
        mockCreateTagHook.mockReturnValue({ mutateAsync: createMutate, isPending: false });
        mockDeleteTagHook.mockReturnValue({ mutateAsync: deleteMutate, isPending: false });

        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setNewTagName(' Theme C ');
            result.current.setNewTagColor('#abcdef');
        });

        await act(async () => {
            await result.current.handleCreateTag();
        });

        expect(createMutate).toHaveBeenCalledWith({
            data: { name: 'Theme C', color: '#abcdef' },
        });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['list-tags'] });
        expect(result.current.newTagName).toBe('');

        await act(async () => {
            await result.current.handleDeleteTag(101);
        });

        expect(deleteMutate).toHaveBeenCalledWith({ tagId: 101 });
        // both list-tags and concourse query invalidated
        expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['list-tags'] });
        expect(mockInvalidateQueries).toHaveBeenCalledWith({
            queryKey: ['get-concourse', 42],
        });
    });

    it('openSheet sets sheetItemId/Code/Tab; closeSheet clears the id', () => {
        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        act(() => result.current.openSheet(mockItems[1], 'comments'));
        expect(result.current.sheetItemId).toBe(2);
        expect(result.current.sheetItemCode).toBe('C2');
        expect(result.current.sheetTab).toBe('comments');

        act(() => result.current.closeSheet());
        expect(result.current.sheetItemId).toBeNull();
    });

    it('confirmAddLanguage promotes newLangCode to activeLocale and clears dialog state', () => {
        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        // Use 'fr' which is present in items, so the effect will not reset activeLocale.
        act(() => {
            result.current.setNewLangCode('fr');
            result.current.setAddLangOpen(true);
        });

        act(() => result.current.confirmAddLanguage());

        expect(result.current.activeLocale).toBe('fr');
        expect(result.current.addLangOpen).toBe(false);
        expect(result.current.newLangCode).toBe('');
    });

    it('exportCsv produces a CSV blob and triggers a download', () => {
        const createObjectURL = vi.fn().mockReturnValue('blob:mock');
        const revokeObjectURL = vi.fn();
        const click = vi.fn();
        const originalCreate = globalThis.URL.createObjectURL;
        const originalRevoke = globalThis.URL.revokeObjectURL;
        Object.defineProperty(globalThis.URL, 'createObjectURL', {
            value: createObjectURL,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
            value: revokeObjectURL,
            configurable: true,
            writable: true,
        });
        const realCreate = document.createElement.bind(document);
        const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
            const el = realCreate(tag);
            if (tag === 'a') {
                el.click = click;
            }
            return el;
        });

        const { result } = renderHook(() => useConcourseDetailPage(), {
            wrapper: AllTheProviders,
        });

        act(() => result.current.exportCsv());

        expect(createObjectURL).toHaveBeenCalled();
        expect(click).toHaveBeenCalled();
        expect(revokeObjectURL).toHaveBeenCalled();

        createSpy.mockRestore();
        Object.defineProperty(globalThis.URL, 'createObjectURL', {
            value: originalCreate,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
            value: originalRevoke,
            configurable: true,
            writable: true,
        });
    });
});

// ── Pure helper tests ─────────────────────────────────────────────

describe('computeNextCode', () => {
    it('returns "1" for an empty list (no prefix)', () => {
        expect(computeNextCode([])).toBe('1');
    });

    it('detects numeric-only codes and increments without a prefix', () => {
        const items = [{ code: '7' }, { code: '12' }, { code: '4' }] as ConcourseItemRead[];
        expect(computeNextCode(items)).toBe('13');
    });

    it('detects "<prefix><digits>" codes and reuses the last alphabetic prefix', () => {
        const items = [{ code: 'C1' }, { code: 'C2' }, { code: 'X3' }] as ConcourseItemRead[];
        expect(computeNextCode(items)).toBe('X4');
    });
});

describe('csvEscape', () => {
    it('passes through values without commas, quotes, or newlines', () => {
        expect(csvEscape('hello')).toBe('hello');
    });

    it('wraps and escapes values containing commas, quotes, or newlines', () => {
        expect(csvEscape('a,b')).toBe('"a,b"');
        expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
        expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    });
});
