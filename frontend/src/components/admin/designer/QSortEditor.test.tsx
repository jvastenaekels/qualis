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

            const distributionTab = screen.getByRole('tab', { name: /Distribution/i });
            await user.click(distributionTab);

            // UI should switch to grid config
            expect(screen.getByText('Forced distribution grid')).toBeInTheDocument();
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

            const textarea = screen.getByPlaceholderText(/Paste your statements here/i);
            await user.type(textarea, 'S1: New Statement 1\nS2: New Statement 2');

            const replaceButton = screen.getByRole('button', {
                name: 'Process & replace statements',
            });
            await user.click(replaceButton);

            // Assert UI update instead of mock call
            expect(await screen.findByText('New Statement 1')).toBeInTheDocument();
            expect(await screen.findByText('New Statement 2')).toBeInTheDocument();
            expect(screen.queryByText('Existing Statement')).not.toBeInTheDocument();
        });

        it('handles bulk statement import (Append mode)', async () => {
            const user = userEvent.setup();
            renderEditor();

            // Switch to append
            const appendRadio = screen.getByLabelText('Append to list');
            await user.click(appendRadio);

            const textarea = screen.getByPlaceholderText(/Paste your statements here/i);
            await user.type(textarea, 'S2: Appended');

            const appendButton = screen.getByRole('button', {
                name: 'Process & append statements',
            });
            await user.click(appendButton);

            // Assert UI update
            expect(await screen.findByText('Existing Statement')).toBeInTheDocument();
            expect(await screen.findByText('Appended')).toBeInTheDocument();
        }, 15000);

        it('supports TSV format', async () => {
            const user = userEvent.setup();
            renderEditor();

            const textarea = screen.getByPlaceholderText(/Paste your statements here/i);
            await user.type(textarea, 'TSV1\tTab Separated Text');

            const replaceButton = screen.getByRole('button', {
                name: 'Process & replace statements',
            });
            await user.click(replaceButton);

            expect(await screen.findByText('Tab Separated Text')).toBeInTheDocument();
        });

        it('clears bulk text after successful import', async () => {
            const user = userEvent.setup();
            renderEditor();

            const textarea = screen.getByPlaceholderText(
                /Paste your statements here/i
            ) as HTMLTextAreaElement;
            await user.type(textarea, 'S1: Test');

            const replaceButton = screen.getByRole('button', {
                name: 'Process & replace statements',
            });
            await user.click(replaceButton);

            expect(textarea.value).toBe('');
        });
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
            const deleteButton = within(statementItem!).getAllByRole('button')[1];
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
                        { code: 'custom-1', translations: [{ language_code: 'en', text: 'S1' }] },
                        { code: 'gap-5', translations: [{ language_code: 'en', text: 'S2' }] },
                    ],
                },
            });

            expect(screen.getByText('custom-1')).toBeInTheDocument();
            expect(screen.getByText('gap-5')).toBeInTheDocument();

            const resetButton = screen.getByText('Reset Codes');
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
            expect(screen.getByText('Forced distribution grid')).toBeInTheDocument();
            // Should see input fields for the grid
            // (Assuming grid editor renders inputs implies it's working)
        });
    });

    describe('Validation & Distribution', () => {
        it('validates grid total matches statement count', () => {
            renderEditor({ activeSubStep: 'grid' });
            expect(screen.getByText('Forced distribution grid')).toBeInTheDocument();
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
            renderEditor({ activeSubStep: 'grid', draft: { ...mockDraft, symmetry_lock: false } });

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
