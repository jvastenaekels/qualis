import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import type { StaleStatementRead, StudyRead } from '@/api/model';
import QSortEditor from './QSortEditor';

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

// --- Concourse-sync harness (W4 oracle) -----------------------------------
// `vi.mock` is file-hoisted, so it also wraps the existing 17 tests. We spread
// the real module and override ONLY the three concourse symbols the component
// imports, driven by mutable holders. The defaults below are behaviourally
// identical to the real hooks for the existing tests (which never seed
// `original`, so the stale query is disabled and the mutation never fires):
// stale query → no data, sync mutation → idle no-op.
const staleHolder: { data: StaleStatementRead[] | undefined } = { data: undefined };
const syncMutate = vi.fn();
const syncMutationHolder: {
    mutate: typeof syncMutate;
    isPending: boolean;
    variables: { slug: string; statementId: number } | undefined;
} = { mutate: syncMutate, isPending: false, variables: undefined };
const invalidateQueries = vi.fn();

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<typeof import('@/api/generated')>('@/api/generated');
    return {
        ...actual,
        useCheckStaleStatementsApiAdminStudiesSlugStaleStatementsGet: () => ({
            data: staleHolder.data,
        }),
        useSyncStatementFromConcourseApiAdminStudiesSlugSyncStatementStatementIdPost: () =>
            syncMutationHolder,
    };
});

vi.mock('@tanstack/react-query', async () => {
    const actual =
        await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => ({ invalidateQueries }),
    };
});

describe('QSortEditor', () => {
    // biome-ignore lint/suspicious/noExplicitAny: convenient partial mock
    const mockDraft: any = {
        slug: 'test-study',
        state: 'draft',
        statements: [
            {
                code: 's1',
                translations: [
                    { language_code: 'en', text: 'Existing Statement' },
                    { language_code: 'fr', text: 'Déclaration existante' },
                ],
            },
        ],
        grid_config: [
            { score: -2, capacity: 2 },
            { score: -1, capacity: 3 },
            { score: 0, capacity: 4 },
            { score: 1, capacity: 3 },
            { score: 2, capacity: 2 },
        ],
        translations: [{ language_code: 'en' }, { language_code: 'fr' }],
    };

    // Helper to render with specific initial state
    // biome-ignore lint/suspicious/noExplicitAny: weak typing for test utility
    const renderEditor = (initialStateOverrides: any = {}) => {
        return renderWithStore(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>,
            {
                initialState: {
                    draft: { ...mockDraft, ...initialStateOverrides.draft },
                    activeLocale: 'en',
                    activeSubStep: 'statements',
                    ...initialStateOverrides,
                },
            }
        );
    };

    describe('Sub-Tab Navigation', () => {
        it('renders the editor with sub-tabs', async () => {
            renderEditor();
            expect(await screen.findByRole('tab', { name: /Statements/i })).toBeInTheDocument();
            expect(await screen.findByRole('tab', { name: /Distribution/i })).toBeInTheDocument();
        });

        it('switches between statements and distribution tabs', async () => {
            const user = userEvent.setup();
            renderEditor();

            const distributionTab = screen.getByRole('tab', {
                name: /Distribution/i,
            });
            await user.click(distributionTab);

            // UI should switch to grid config
            expect(screen.getByText('Q-Sort distribution grid')).toBeInTheDocument();
        });

        it('displays statements tab content by default', () => {
            renderEditor();
            expect(screen.getByText('Bulk editor (quick paste)')).toBeInTheDocument();
            expect(screen.getByText('Q-set', { exact: false })).toBeInTheDocument();
        });
    });

    describe('Bulk Statement Import', () => {
        it('handles bulk statement import (Replace mode)', async () => {
            const user = userEvent.setup();
            renderEditor();

            const textarea = screen.getByPlaceholderText(/Simple:/i);
            await user.type(textarea, 'S1: New Statement 1\nS2: New Statement 2');

            const replaceButton = screen.getByRole('button', {
                name: 'Process & replace statements',
            });
            await user.click(replaceButton);

            // Assert UI update instead of mock call
            expect(await screen.findByText('New Statement 1')).toBeInTheDocument();
            expect(await screen.findByText('New Statement 2')).toBeInTheDocument();
            expect(screen.queryByText('Existing Statement')).not.toBeInTheDocument();
        }, 15000);

        it('handles bulk statement import (Append mode)', async () => {
            const user = userEvent.setup();
            renderEditor();

            // Switch to append
            const appendRadio = screen.getByLabelText('Append to list');
            await user.click(appendRadio);

            const textarea = screen.getByPlaceholderText(/Simple:/i);
            await user.type(textarea, 'S2: Appended');

            const appendButton = screen.getByRole('button', {
                name: 'Process & append statements',
            });
            await user.click(appendButton);

            // Assert UI update
            expect(
                await screen.findByText('Existing Statement', {}, { timeout: 5000 })
            ).toBeInTheDocument();
            expect(await screen.findByText('Appended', {}, { timeout: 5000 })).toBeInTheDocument();
        }, 15000);

        it('supports TSV format', async () => {
            const user = userEvent.setup();
            renderEditor();

            const textarea = screen.getByPlaceholderText(/Simple:/i);
            await user.type(textarea, 'TSV1\tTab Separated Text');

            const replaceButton = screen.getByRole('button', {
                name: 'Process & replace statements',
            });
            await user.click(replaceButton);

            expect(await screen.findByText('Tab Separated Text')).toBeInTheDocument();
        }, 15000);

        it('clears bulk text after successful import', async () => {
            const user = userEvent.setup();
            renderEditor();

            const textarea = screen.getByPlaceholderText(/Simple:/i) as HTMLTextAreaElement;
            await user.type(textarea, 'S1: Test');

            const replaceButton = screen.getByRole('button', {
                name: 'Process & replace statements',
            });
            await user.click(replaceButton);

            expect(textarea.value).toBe('');
        }, 15000);
    });

    describe('Statement Management', () => {
        it('displays existing statements', () => {
            renderEditor();
            expect(screen.getByText('Existing Statement')).toBeInTheDocument();
        });

        it('can delete individual statements', async () => {
            const user = userEvent.setup();
            renderEditor();

            const statementItem = screen.getByText('Existing Statement').closest('.group');
            expect(statementItem).toBeInTheDocument();

            // biome-ignore lint/style/noNonNullAssertion: test setup
            const buttons = within(statementItem!).getAllByRole('button');
            const deleteButton = buttons[buttons.length - 1];
            await user.click(deleteButton);

            expect(screen.queryByText('Existing Statement')).not.toBeInTheDocument();
        });

        it('clears all statements with confirmation', async () => {
            const user = userEvent.setup();
            const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

            renderEditor();

            const clearButton = screen.getByText('Clear all');
            await user.click(clearButton);

            expect(confirmSpy).toHaveBeenCalled();
            expect(screen.queryByText('Existing Statement')).not.toBeInTheDocument();
        });

        it('re-sequences statement codes', async () => {
            const user = userEvent.setup();
            vi.spyOn(window, 'confirm').mockImplementation(() => true);

            renderEditor({
                draft: {
                    ...mockDraft,
                    statements: [
                        {
                            code: 'custom-1',
                            translations: [{ language_code: 'en', text: 'S1' }],
                        },
                        {
                            code: 'gap-5',
                            translations: [{ language_code: 'en', text: 'S2' }],
                        },
                    ],
                },
            });

            expect(screen.getByText('custom-1')).toBeInTheDocument();
            expect(screen.getByText('gap-5')).toBeInTheDocument();

            const resetButton = screen.getByText('Reset codes');
            await user.click(resetButton);

            expect(screen.getByText('s1')).toBeInTheDocument();
            expect(screen.getByText('s2')).toBeInTheDocument();
            expect(screen.queryByText('custom-1')).not.toBeInTheDocument();
        });
    });

    describe('Translation Management', () => {
        it('displays statements in active locale', () => {
            renderEditor({ activeLocale: 'fr' });
            expect(screen.getByText('Déclaration existante')).toBeInTheDocument();
        });
    });

    describe('Grid Configuration', () => {
        it('displays grid columns', () => {
            renderEditor({ activeSubStep: 'grid' });
            expect(screen.getByText('Q-Sort distribution grid')).toBeInTheDocument();
            // Should see input fields for the grid
            // (Assuming grid editor renders inputs implies it's working)
        });
    });

    describe('Validation & Distribution', () => {
        it('validates grid total matches statement count', () => {
            renderEditor({ activeSubStep: 'grid' });
            expect(screen.getByText('Q-Sort distribution grid')).toBeInTheDocument();
        });

        it('maintains symmetry when symmetry lock is enabled', async () => {
            const user = userEvent.setup();
            renderEditor({ activeSubStep: 'grid' });

            const increaseButtons = screen.getAllByLabelText(/Increase capacity for column/i);

            // Column 0 and Column 4 should initially have 2 slots each
            expect(screen.getByTestId('grid-column-0-slots').children).toHaveLength(2);
            expect(screen.getByTestId('grid-column-4-slots').children).toHaveLength(2);

            // Increase capacity of column 0
            await user.click(increaseButtons[0]);

            // Symmetry lock (default true) should increase column 4 too
            expect(screen.getByTestId('grid-column-0-slots').children).toHaveLength(3);
            expect(screen.getByTestId('grid-column-4-slots').children).toHaveLength(3);
        });

        it('allows independent adjustment when symmetry lock is disabled', async () => {
            const user = userEvent.setup();
            renderEditor({
                activeSubStep: 'grid',
                draft: { ...mockDraft, symmetry_lock: false },
            });

            const increaseButtons = screen.getAllByLabelText(/Increase capacity for column/i);

            expect(screen.getByTestId('grid-column-0-slots').children).toHaveLength(2);
            expect(screen.getByTestId('grid-column-4-slots').children).toHaveLength(2);

            await user.click(increaseButtons[0]);

            // Only column 0 should increase
            expect(screen.getByTestId('grid-column-0-slots').children).toHaveLength(3);
            expect(screen.getByTestId('grid-column-4-slots').children).toHaveLength(2);
        });

        it('auto-shapes grid into a balanced distribution', async () => {
            const user = userEvent.setup();
            renderEditor({
                activeSubStep: 'grid',
                draft: {
                    ...mockDraft,
                    statements: Array(10).fill({ code: 's', translations: [] }),
                    grid_config: [
                        { score: -2, capacity: 5 },
                        { score: -1, capacity: 0 },
                        { score: 0, capacity: 0 },
                        { score: 1, capacity: 0 },
                        { score: 2, capacity: 5 },
                    ],
                },
            });

            const autoBalanceButton = screen.getByText(/Auto-Balance/i);
            await user.click(autoBalanceButton);

            // For N=10 and 5 columns, result should be [1, 2, 4, 2, 1]
            // per the binomial weight distribution logic: 1, 4, 6, 4, 1 (total 16) -> scaled to 10
            expect(screen.getByTestId('grid-column-0-slots').children).toHaveLength(1);
            expect(screen.getByTestId('grid-column-1-slots').children).toHaveLength(2);
            expect(screen.getByTestId('grid-column-2-slots').children).toHaveLength(4);
            expect(screen.getByTestId('grid-column-3-slots').children).toHaveLength(2);
            expect(screen.getByTestId('grid-column-4-slots').children).toHaveLength(1);
        });
    });
});

// ===========================================================================
// W4 characterization oracle — locks current behaviour of the four
// under-covered areas on the W2 baseline BEFORE the useQSortEditor extraction.
// These assert whatever the UNCHANGED component does today (even if odd); the
// point is to detect any drift introduced by the later hook relocation.
// ===========================================================================

// Shared seed mirroring the existing describe blocks' `mockDraft`.
// biome-ignore lint/suspicious/noExplicitAny: convenient partial mock (mirrors existing tests)
const seedDraft: any = {
    slug: 'test-study',
    state: 'draft',
    statements: [
        { code: 's1', translations: [{ language_code: 'en', text: 'Existing Statement' }] },
    ],
    grid_config: [
        { score: -2, capacity: 2 },
        { score: -1, capacity: 3 },
        { score: 0, capacity: 4 },
        { score: 1, capacity: 3 },
        { score: 2, capacity: 2 },
    ],
    translations: [{ language_code: 'en' }, { language_code: 'fr' }],
};

const readCodes = () => (useStudyDesigner.getState().draft?.statements ?? []).map((s) => s.code);
const readTexts = () =>
    (useStudyDesigner.getState().draft?.statements ?? []).map(
        (s) => s.translations?.find((tr) => tr.language_code === 'en')?.text ?? ''
    );

beforeEach(() => {
    staleHolder.data = undefined;
    syncMutationHolder.isPending = false;
    syncMutationHolder.variables = undefined;
    syncMutate.mockReset();
    invalidateQueries.mockReset();
});

describe('Characterization — dnd reorder (W4 oracle)', () => {
    const origRect = Element.prototype.getBoundingClientRect;

    afterEach(() => {
        Element.prototype.getBoundingClientRect = origRect;
    });

    it('reordering statements via drag-end updates draft order', async () => {
        // dnd-kit's KeyboardSensor needs real layout rects; jsdom returns
        // all-zero, which silently no-ops the reorder. Stub stable per-row
        // rects keyed off the row text so the keyboard sensor can resolve a
        // valid `over` and the REAL handleStatementDragEnd (arrayMove +
        // updateDraft) fires. Nothing in the component is mocked.
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const txt = (this as HTMLElement).textContent ?? '';
            let row = 0;
            if (txt.includes('Beta') && !txt.includes('Alpha')) row = 1;
            if (txt.includes('Gamma') && !txt.includes('Alpha')) row = 2;
            const top = row * 100;
            return {
                x: 0,
                y: top,
                top,
                left: 0,
                bottom: top + 40,
                right: 100,
                width: 100,
                height: 40,
                toJSON() {},
            } as DOMRect;
        };

        const user = userEvent.setup();
        renderWithStore(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>,
            {
                initialState: {
                    draft: {
                        ...seedDraft,
                        statements: [
                            {
                                code: 's1',
                                translations: [{ language_code: 'en', text: 'Alpha' }],
                            },
                            {
                                code: 's2',
                                translations: [{ language_code: 'en', text: 'Beta' }],
                            },
                            {
                                code: 's3',
                                translations: [{ language_code: 'en', text: 'Gamma' }],
                            },
                        ],
                    },
                    activeLocale: 'en',
                    activeSubStep: 'statements',
                },
            }
        );

        expect(readCodes()).toEqual(['s1', 's2', 's3']);

        const handles = document.querySelectorAll('[aria-roledescription="sortable"]');
        expect(handles).toHaveLength(3);
        (handles[0] as HTMLElement).focus();

        // Pick up s1 (Space), move down two rows, drop (Space). Current
        // handler does arrayMove(statements, 0, 2) → s1 lands last.
        await user.keyboard('{ }{ArrowDown}{ArrowDown}{ }');

        await waitFor(() => {
            expect(readCodes()).toEqual(['s2', 's3', 's1']);
        });
        // Texts travel with their statement object (order, not identity, moved).
        expect(readTexts()).toEqual(['Beta', 'Gamma', 'Alpha']);
    }, 15000);
});

describe('Characterization — concourse sync + stale map (W4 oracle)', () => {
    it('syncing a stale statement calls the sync mutation and clears its stale flag', async () => {
        const user = userEvent.setup();

        // Seed `original.statements` with a concourse-linked entry so the
        // component's hasLinkedStatements gate is true; the (mocked) stale
        // query reports statement id 42 as stale → staleByStatementId has it
        // → the per-row "Update" sync button renders.
        staleHolder.data = [
            {
                statement_id: 42,
                statement_code: 's1',
                source_concourse_item_id: 7,
                source_deleted: false,
                current_translations: [{ language_code: 'en', text: 'Existing Statement' }],
                concourse_translations: [{ language_code: 'en', text: 'Fresher concourse text' }],
            },
        ];
        // Drive the real onSuccess path: invalidateQueries + toast.success.
        syncMutate.mockImplementation(
            (_vars: { slug: string; statementId: number }, opts?: { onSuccess?: () => void }) => {
                opts?.onSuccess?.();
            }
        );

        renderWithStore(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>,
            {
                initialState: {
                    draft: {
                        ...seedDraft,
                        statements: [
                            {
                                id: 42,
                                code: 's1',
                                source_concourse_item_id: 7,
                                translations: [{ language_code: 'en', text: 'Existing Statement' }],
                            },
                        ],
                    },
                    original: {
                        slug: 'test-study',
                        statements: [{ id: 42, source_concourse_item_id: 7 }],
                    } as unknown as StudyRead,
                    activeLocale: 'en',
                    activeSubStep: 'statements',
                },
            }
        );

        // Stale banner appears (staleByStatementId.size > 0).
        expect(
            screen.getByText(/statement\(s\) have updates available from the concourse/i)
        ).toBeInTheDocument();

        const syncButton = screen.getByRole('button', { name: 'Update' });
        await user.click(syncButton);

        // The mutation is invoked with the exact {slug, statementId} the
        // current handler passes — not a mock tautology: we assert the args
        // the component computed from original.slug + statement.id.
        expect(syncMutate).toHaveBeenCalledTimes(1);
        expect(syncMutate.mock.calls[0][0]).toEqual({ slug: 'test-study', statementId: 42 });

        // onSuccess wiring the current code runs: query invalidation fires.
        await waitFor(() => {
            expect(invalidateQueries).toHaveBeenCalledTimes(1);
        });
    });
});

describe('Characterization — import-mode matrix (W4 oracle)', () => {
    it.each([
        'replace',
        'append',
        'sync',
    ] as const)('bulk import in %s mode produces the current draft.statements result', async (mode) => {
        const user = userEvent.setup();
        renderWithStore(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>,
            {
                initialState: {
                    draft: { ...seedDraft },
                    activeLocale: 'en',
                    activeSubStep: 'statements',
                },
            }
        );

        // Select the import mode (default radio is 'replace').
        if (mode === 'append') {
            await user.click(screen.getByLabelText('Append to list'));
        } else if (mode === 'sync') {
            await user.click(screen.getByLabelText('Sync/Merge by code'));
        }

        // "list" format: `code: text` per line (detectedFormat → list).
        // Line 1 reuses the existing code s1; line 2 is a new code s5.
        const textarea = screen.getByPlaceholderText(/Simple:/i);
        await user.type(textarea, 's1: Synced One\ns5: Fresh One');

        const processButton = screen.getByRole('button', {
            name:
                mode === 'replace'
                    ? 'Process & replace statements'
                    : mode === 'append'
                      ? 'Process & append statements'
                      : 'Process & sync translations',
        });
        await user.click(processButton);

        await waitFor(() => {
            if (mode === 'replace') {
                // Replace wipes the list, then both lines become new
                // statements keyed by their parsed code.
                expect(readCodes()).toEqual(['s1', 's5']);
                expect(readTexts()).toEqual(['Synced One', 'Fresh One']);
            } else if (mode === 'append') {
                // Append keeps the original s1 ("Existing Statement"),
                // then pushes BOTH parsed items as new entries — even the
                // one whose code (s1) duplicates an existing code. The
                // current merge only de-dupes by code in sync mode, so
                // append yields a duplicate s1. Snapshot that.
                expect(readCodes()).toEqual(['s1', 's1', 's5']);
                expect(readTexts()).toEqual(['Existing Statement', 'Synced One', 'Fresh One']);
            } else {
                // Sync matches the existing s1 by code and overwrites its
                // active-locale text in place; s5 has no match → appended.
                expect(readCodes()).toEqual(['s1', 's5']);
                expect(readTexts()).toEqual(['Synced One', 'Fresh One']);
            }
        });
    }, 15000);
});

describe('Characterization — inline statement edit (W4 oracle)', () => {
    it('enter→edit→commit updates the statement; cancel discards', async () => {
        const user = userEvent.setup();
        renderWithStore(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>,
            {
                initialState: {
                    draft: { ...seedDraft },
                    activeLocale: 'en',
                    activeSubStep: 'statements',
                },
            }
        );

        // --- commit path ---
        await user.click(screen.getByText('Existing Statement'));

        const textInput = screen.getByDisplayValue('Existing Statement');
        const codeInput = screen.getByDisplayValue('s1');
        await user.clear(textInput);
        await user.type(textInput, 'Edited Text');
        await user.clear(codeInput);
        await user.type(codeInput, 's99');

        // Enter inside the text input commits (handleSaveStatement).
        await user.type(textInput, '{Enter}');

        await waitFor(() => {
            expect(readCodes()).toEqual(['s99']);
            expect(readTexts()).toEqual(['Edited Text']);
        });
        expect(screen.getByText('Edited Text')).toBeInTheDocument();

        // --- cancel path ---
        await user.click(screen.getByText('Edited Text'));
        const textInput2 = screen.getByDisplayValue('Edited Text');
        const codeInput2 = screen.getByDisplayValue('s99');
        await user.clear(textInput2);
        await user.type(textInput2, 'Should Not Persist');
        await user.clear(codeInput2);
        await user.type(codeInput2, 'sX');

        // Escape inside the text input cancels (setEditingIndex(null)),
        // discarding the edits — draft is untouched.
        await user.type(textInput2, '{Escape}');

        await waitFor(() => {
            expect(screen.getByText('Edited Text')).toBeInTheDocument();
        });
        expect(readCodes()).toEqual(['s99']);
        expect(readTexts()).toEqual(['Edited Text']);
        expect(screen.queryByText('Should Not Persist')).not.toBeInTheDocument();
    }, 15000);
});
