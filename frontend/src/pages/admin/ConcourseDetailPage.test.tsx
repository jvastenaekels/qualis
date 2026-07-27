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

/**
 * jsdom/happy-dom never lays out Tailwind classes, so `:focus-within` and the
 * cascade order that decides whether `sm:opacity-0` or `focus-visible:opacity-100`
 * wins in a real browser cannot be observed here (verified separately by tabbing
 * through the real app — see task-3.1-report.md). What CAN be asserted from the
 * DOM: the hover-reveal classes are paired with an equivalent focus-within
 * reveal on the desktop row-action group, the controls stay real, focusable
 * tab stops (not pulled from the tab order as a shortcut), and the always-on
 * Edit button no longer ships the near-invisible resting token.
 */
describe('ConcourseDetailPage row actions', () => {
    function renderEditableRow() {
        const concourse = concourseWith(1, 0, 0);
        mockUseConcourseDetailPage.mockReturnValue({
            ...baseApi(concourse),
            canEdit: true,
            // baseApi hardcodes filteredItems to [] (the curation-panel test
            // above only needs concourse.items) — the row list renders from
            // filteredItems, so it must be wired up here for any row to exist.
            filteredItems: concourse.items ?? [],
        });
        renderWithProviders(<ConcourseDetailPage />);

        // Two copies of each action button exist in the DOM (a `sm:hidden`
        // mobile row and a `hidden sm:flex` desktop row) sharing the same
        // aria-labels — data-row-actions scopes queries to the desktop group
        // that actually carries the hover/focus-reveal classes under test.
        const group = document.querySelector('[data-row-actions]');
        if (!group) throw new Error('desktop row actions group not found');
        return within(group as HTMLElement);
    }

    it('reveals hover-only row actions on keyboard focus, not only on mouse hover', () => {
        const actions = renderEditableRow();

        for (const name of ['History', 'Comments', 'Delete']) {
            const button = actions.getByRole('button', { name });
            // Positive: the group-hover reveal now has a group-focus-within
            // counterpart, so a keyboard user focusing anywhere in the row
            // reveals the same controls a mouse hover would.
            expect(button).toHaveClass('sm:group-hover:opacity-100');
            expect(button).toHaveClass('sm:group-focus-within:opacity-100');
            // Negative: still starts hidden at rest (this isn't a shortcut
            // that makes every action permanently visible, which would defeat
            // the decluttered-row design) and still carries a real tab stop
            // (constraint: never pull it from the tab order to "fix" this).
            expect(button).toHaveClass('sm:opacity-0');
            expect(button.tabIndex).not.toBe(-1);
            expect(button).not.toHaveAttribute('disabled');
        }
    });

    it('raises the resting Edit button above the near-invisible token it shipped with', () => {
        const actions = renderEditableRow();
        const edit = actions.getByRole('button', { name: 'Edit' });

        // Positive: slate-500 clears 4.5:1 against a white row background.
        expect(edit).toHaveClass('text-slate-500');
        // Negative: not the ~1.4:1 token this button used to carry at rest.
        expect(edit).not.toHaveClass('text-slate-300');
    });
});

/**
 * Accessible-name regression test for the item-selection checkboxes
 * (Task 3.6). Both the "select all" checkbox and each per-row checkbox had
 * no `id`/`htmlFor`/`aria-label` anywhere near them.
 */
describe('ConcourseDetailPage selection checkboxes (a11y, Task 3.6)', () => {
    function renderEditableRow(itemCount = 1) {
        const concourse = concourseWith(itemCount, 0, 0);
        mockUseConcourseDetailPage.mockReturnValue({
            ...baseApi(concourse),
            canEdit: true,
            filteredItems: concourse.items ?? [],
        });
        renderWithProviders(<ConcourseDetailPage />);
        return concourse;
    }

    it('names the "select all" checkbox', () => {
        renderEditableRow();

        // getByRole computes the real accessible name — the visible "Select
        // all" text sits in a plain <span>, not a <label htmlFor>, so an
        // unfixed checkbox fails to resolve here even though it's on screen.
        expect(screen.getByRole('checkbox', { name: /select all/i })).toBeInTheDocument();
    });

    it('names each row checkbox with the specific item it selects', () => {
        const concourse = renderEditableRow(2);
        const codes = (concourse.items ?? []).map((item) => item.code);
        expect(codes).toHaveLength(2);

        // Each row checkbox has no adjacent visible text at all (the item
        // code is a separate badge elsewhere in the row) — the name must
        // come from an aria-label distinct per row, not a single fallback.
        for (const code of codes) {
            expect(
                screen.getByRole('checkbox', { name: new RegExp(code, 'i') })
            ).toBeInTheDocument();
        }
    });
});
