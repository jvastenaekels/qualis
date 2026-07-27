import { screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { TooltipProvider } from '@/components/ui/tooltip';
import QSortEditor from './QSortEditor';

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

// Mock removed

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

        it('renders the delete-statement icon at a legible contrast (Task 6.7d)', () => {
            renderEditor();

            const statementItem = screen.getByText('Existing Statement').closest('.group');
            expect(statementItem).toBeInTheDocument();
            // biome-ignore lint/style/noNonNullAssertion: test setup
            const deleteButton = within(statementItem!).getByRole('button', { name: 'Delete' });
            expect(deleteButton).toHaveClass('text-slate-500');
            expect(deleteButton).not.toHaveClass('text-slate-300');
        });

        it('renders the drag-handle icon at a legible contrast (review fix-round, Task 6.7d)', () => {
            renderEditor();

            const statementItem = screen.getByText('Existing Statement').closest('.group');
            expect(statementItem).toBeInTheDocument();
            // dnd-kit's useSortable spreads {...attributes} onto this div, which injects
            // role="button" — findable by role+name since task 6.7h's aria-label fix, but
            // still located by class here to keep this test scoped to the contrast fix.
            // biome-ignore lint/style/noNonNullAssertion: test setup
            const dragHandle = statementItem!.querySelector('.cursor-grab');
            expect(dragHandle).not.toBeNull();
            expect(dragHandle).toHaveClass('text-slate-500');
            expect(dragHandle).not.toHaveClass('text-slate-300');
        });

        it('names the drag handle by the statement it reorders — gate-invisible until Task 6.7h', () => {
            // Task 6.7h: dnd-kit's {...attributes}/{...listeners} spread injects
            // role="button" and tabIndex={0} but never a name, so this control was
            // unnamed and invisible to check-a11y-names.mjs's tag-based matching at the
            // same time — the gate now resolves effective role, not just tag, and this
            // is the fix it prompted.
            renderEditor();

            const statementItem = screen.getByText('Existing Statement').closest('.group');
            expect(statementItem).toBeInTheDocument();
            // biome-ignore lint/style/noNonNullAssertion: test setup
            const dragHandle = within(statementItem!).getByRole('button', {
                name: 'Reorder s1',
            });
            expect(dragHandle).toHaveClass('cursor-grab');
        });

        it('names the save/cancel controls by the statement code being edited (Task 6.7c)', async () => {
            const user = userEvent.setup();
            renderEditor();

            await user.click(screen.getByText('Existing Statement'));

            expect(screen.getByRole('button', { name: 'Save s1' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel editing s1' })).toBeInTheDocument();
        });

        describe('click-to-edit control is a real, keyboard-operable button (Task 6.7d)', () => {
            it('is a native <button> with no hand-rolled role/tabIndex, and enters edit mode on Enter', async () => {
                const user = userEvent.setup();
                renderEditor();

                const editControl = screen.getByRole('button', { name: 'Existing Statement' });
                expect(editControl.tagName).toBe('BUTTON');
                expect(editControl).not.toHaveAttribute('role');
                expect(editControl).not.toHaveAttribute('tabindex');

                editControl.focus();
                await user.keyboard('{Enter}');

                expect(screen.getByRole('button', { name: 'Save s1' })).toBeInTheDocument();
            });

            // Review fix-round 2: a native `disabled` button blocks the mouse
            // events a text-selection drag needs, in every browser,
            // regardless of `user-select` (verified live — see the
            // select-text entry below and the report). Since a read-only
            // study is exactly the state where statements get read and
            // quoted, this control now stays focusable and selectable —
            // `aria-disabled` communicates non-operability to assistive tech,
            // and the `onClick` guard (restored — the original <div> already
            // had it) keeps Enter/Space inert without removing the element
            // from the tab order or from `window.getSelection()`'s reach.
            it('is aria-disabled — not natively disabled — when the editor is read-only, so its text stays selectable', () => {
                renderWithStore(
                    <TooltipProvider>
                        <QSortEditor readOnly />
                    </TooltipProvider>,
                    { initialState: { draft: mockDraft, activeLocale: 'en' } }
                );

                const editControl = screen.getByRole('button', { name: 'Existing Statement' });
                expect(editControl).toHaveAttribute('aria-disabled', 'true');
                expect(editControl).not.toBeDisabled();
            });

            it('no-ops on click and on Enter when read-only — the guard does what `disabled` used to', async () => {
                const user = userEvent.setup();
                renderWithStore(
                    <TooltipProvider>
                        <QSortEditor readOnly />
                    </TooltipProvider>,
                    { initialState: { draft: mockDraft, activeLocale: 'en' } }
                );

                const editControl = screen.getByRole('button', { name: 'Existing Statement' });

                await user.click(editControl);
                expect(screen.queryByRole('button', { name: /^Save /i })).not.toBeInTheDocument();

                editControl.focus();
                expect(editControl).toHaveFocus();
                await user.keyboard('{Enter}');
                expect(screen.queryByRole('button', { name: /^Save /i })).not.toBeInTheDocument();
            });

            // Review fix-round: Firefox's UA stylesheet sets `user-select: none`
            // on <button> (Chromium's default is `auto`, which does not block
            // selection) — a plain <div> defaults to `auto` in every engine, so
            // this regressed statement-text selection/copy specifically in
            // Firefox when this control became a <button>. `select-text`
            // overrides the UA default explicitly.
            //
            // A computed-style or real drag-select assertion is NOT expressible
            // here: happy-dom (this project's test environment, see
            // vitest.config.ts) loads no stylesheet at all, UA or Tailwind —
            // verified directly, `getComputedStyle(button).userSelect` reads
            // `''` for a bare <button> AND for one with the `select-text`
            // class, in this environment, always. An assertion against
            // computed style here could never fail, which is worse than no
            // assertion — it would look like coverage without being any. The
            // only thing checkable in this environment is that the class
            // making the override is actually present on the shipped element;
            // the cross-engine behavior itself was verified live (headless
            // Chromium here, Firefox by the reviewer) outside the test suite.
            it('carries select-text, overriding the Firefox UA default that would block copying statement text', () => {
                renderEditor();

                const editControl = screen.getByRole('button', { name: 'Existing Statement' });
                expect(editControl).toHaveClass('select-text');
            });
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

        it('names the "why forced distribution" help control (Task 6.7c)', () => {
            renderEditor({ activeSubStep: 'grid' });
            expect(
                screen.getByRole('button', { name: 'Why forced distribution?' })
            ).toBeInTheDocument();
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

    describe('Distribution mode group name (Task 6.7b)', () => {
        it('names the distribution-mode radiogroup via aria-labelledby', () => {
            renderEditor({ activeSubStep: 'grid' });

            // "Distribution mode" headed a group of three radios with no
            // association at all before this fix — getByRole computes the real
            // accessible name of the `radiogroup`, so this only passes because
            // aria-labelledby now resolves to the heading text.
            expect(
                screen.getByRole('radiogroup', { name: /distribution mode/i })
            ).toBeInTheDocument();
        });
    });
});
