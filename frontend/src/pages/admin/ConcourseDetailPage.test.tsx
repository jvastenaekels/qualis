/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen, within } from '@/test-utils/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ConcourseDetailPage from './ConcourseDetailPage';
import type { ConcourseDetailPageApi } from '@/hooks/admin/useConcourseDetailPage';
import type { ConcourseDetailRead, ConcourseItemRead, ConcourseItemStatus } from '@/api/model';

// Radix Select triggers a compose-refs loop in React 19 + happy-dom — stub it
// (same approach as ProjectMembersPage.remove-member-dialog.test.tsx).
vi.mock('@/components/ui/select', () => ({
    Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
        <button type="button">{children}</button>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
        <div data-value={value}>{children}</div>
    ),
    SelectValue: () => null,
}));

const { mockUseConcourseDetailPage } = vi.hoisted(() => ({
    mockUseConcourseDetailPage: vi.fn(),
}));

// The page's own JSX is what's under test — bypass its logic hook entirely so
// the test controls `concourse.items` directly, with no query/router/API
// plumbing to fake out.
vi.mock('@/hooks/admin/useConcourseDetailPage', () => ({
    useConcourseDetailPage: mockUseConcourseDetailPage,
}));

let nextItemId = 1;
function makeItem(status: ConcourseItemStatus): ConcourseItemRead {
    const id = nextItemId++;
    return {
        id,
        code: `C${id}`,
        status,
        version: 1,
        display_order: id,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    };
}

/** Builds a concourse with the given accepted / rejected / proposed item counts. */
function concourseWith(accepted: number, rejected: number, proposed: number): ConcourseDetailRead {
    nextItemId = 1;
    return {
        id: 42,
        project_id: 1,
        title: 'Demo concourse',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        items: [
            ...Array.from({ length: accepted }, () => makeItem('accepted')),
            ...Array.from({ length: rejected }, () => makeItem('rejected')),
            ...Array.from({ length: proposed }, () => makeItem('proposed')),
        ],
    };
}

/**
 * Full ConcourseDetailPageApi fixture. Only `concourse` varies per test — the
 * curation panel derives its counts from `concourse.items` alone (see the IIFE
 * in ConcourseDetailPage.tsx), everything else here just needs to satisfy the
 * page's prop contract without crashing the render.
 */
function baseApi(concourse: ConcourseDetailRead): ConcourseDetailPageApi {
    return {
        id: concourse.id,
        canEdit: false,
        memberNames: {},
        concourse,
        isLoading: false,
        tags: [],
        statusLabel: (status) => status,
        langDisplayName: (code) => code,
        filterStatus: 'all',
        setFilterStatus: vi.fn(),
        filterTag: 'all',
        setFilterTag: vi.fn(),
        searchQuery: '',
        setSearchQuery: vi.fn(),
        activeLocale: '',
        setActiveLocale: vi.fn(),
        languages: [],
        missingCountByLang: {},
        commonLanguages: [],
        addLangOpen: false,
        setAddLangOpen: vi.fn(),
        newLangCode: '',
        setNewLangCode: vi.fn(),
        confirmAddLanguage: vi.fn(),
        filteredItems: [],
        selectedItems: new Set(),
        setSelectedItems: vi.fn(),
        toggleSelectItem: vi.fn(),
        toggleSelectAll: vi.fn(),
        bulkActionPending: false,
        bulkConfirm: null,
        setBulkConfirm: vi.fn(),
        handleBulkStatusChange: vi.fn(),
        addItemOpen: false,
        setAddItemOpen: vi.fn(),
        openAddItemDialog: vi.fn(),
        newCode: '',
        setNewCode: vi.fn(),
        newText: '',
        setNewText: vi.fn(),
        newSource: '',
        setNewSource: vi.fn(),
        newTagIds: [],
        setNewTagIds: vi.fn(),
        newItemLocale: '',
        setNewItemLocale: vi.fn(),
        handleAddItem: vi.fn(),
        isCreatingItem: false,
        editingItem: null,
        setEditingItem: vi.fn(),
        editCode: '',
        setEditCode: vi.fn(),
        editText: '',
        setEditText: vi.fn(),
        editSource: '',
        setEditSource: vi.fn(),
        editChangeNote: '',
        setEditChangeNote: vi.fn(),
        editTagIds: [],
        setEditTagIds: vi.fn(),
        startEdit: vi.fn(),
        saveEdit: vi.fn(),
        isUpdatingItem: false,
        changeStatus: vi.fn(),
        deleteConfirmId: null,
        setDeleteConfirmId: vi.fn(),
        handleDelete: vi.fn(),
        isDeletingItem: false,
        importOpen: false,
        setImportOpen: vi.fn(),
        openImportDialog: vi.fn(),
        importText: '',
        setImportText: vi.fn(),
        importPrefix: 'C',
        setImportPrefix: vi.fn(),
        importLocale: '',
        setImportLocale: vi.fn(),
        handleImport: vi.fn(),
        isImporting: false,
        tagManagerOpen: false,
        setTagManagerOpen: vi.fn(),
        newTagName: '',
        setNewTagName: vi.fn(),
        newTagColor: '#6366f1',
        setNewTagColor: vi.fn(),
        deleteTagId: null,
        setDeleteTagId: vi.fn(),
        handleCreateTag: vi.fn(),
        handleDeleteTag: vi.fn(),
        isCreatingTag: false,
        isDeletingTag: false,
        sheetItemId: null,
        sheetItemCode: '',
        sheetTab: 'history',
        openSheet: vi.fn(),
        closeSheet: vi.fn(),
        exportCsv: vi.fn(),
    };
}

describe('ConcourseDetailPage curation panel', () => {
    it('states reviewed count and progress width consistently', () => {
        // 25 accepted + 8 rejected + 3 proposed = 36 items.
        mockUseConcourseDetailPage.mockReturnValue(baseApi(concourseWith(25, 8, 3)));

        renderWithProviders(<ConcourseDetailPage />);

        const bar = screen.getByTestId('curation-progress');
        // Scope the count assertions to the curation panel (bar's grandparent —
        // bar -> progress track -> panel) so "33"/"25" cannot be satisfied by
        // some unrelated element on the page.
        const panel = bar.parentElement?.parentElement;
        if (!panel) throw new Error('curation panel wrapper not found');
        const panelScope = within(panel);

        // The headline number is what the bar measures: 33 reviewed of 36.
        expect(panelScope.getByText('33')).toBeInTheDocument();
        expect(bar).toHaveStyle({ width: '91.66666666666666%' });
        // The Q-set size stays visible, but as its own labelled figure.
        expect(panelScope.getByText(/25 accepted/i)).toBeInTheDocument();
    });
});
