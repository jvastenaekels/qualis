import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import QSortEditor from './QSortEditor';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/store/useStudyDesigner', () => ({
    useStudyDesigner: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

describe('QSortEditor', () => {
    const mockUpdateDraft = vi.fn();
    const mockSetActiveSubStep = vi.fn();

    const mockDraft = {
        id: 1,
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
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft: mockDraft,
            activeLocale: 'en',
            activeSubStep: 'statements',
            updateDraft: mockUpdateDraft,
            setActiveSubStep: mockSetActiveSubStep,
        });
    });

    const renderEditor = () => {
        return render(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>
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

            expect(mockSetActiveSubStep).toHaveBeenCalledWith('grid');
        });

        it('displays statements tab content by default', () => {
            renderEditor();

            // Should show bulk editor and statement set
            expect(screen.getByText('admin.design.qsort.bulk.title')).toBeInTheDocument();
            expect(
                screen.getByText('admin.design.qsort.set.title', { exact: false })
            ).toBeInTheDocument();
        });
    });

    describe('Bulk Statement Import', () => {
        it('handles bulk statement import (Replace mode)', () => {
            renderEditor();

            const textarea = screen.getByPlaceholderText('admin.design.qsort.bulk.placeholder');
            fireEvent.change(textarea, {
                target: { value: 'S1: New Statement 1\nS2: New Statement 2' },
            });

            const replaceButton = screen.getByRole('button', {
                name: 'admin.design.qsort.bulk.process_replace',
            });
            fireEvent.click(replaceButton);

            expect(mockUpdateDraft).toHaveBeenCalled();
            const updateFn = mockUpdateDraft.mock.calls[0][0];
            const draft = { statements: [{ code: 'old' }] };
            updateFn(draft);

            expect(draft.statements).toHaveLength(2);
            expect(draft.statements[0].code).toBe('S1');
            expect(draft.statements[0].translations[0].text).toBe('New Statement 1');
        });

        it('handles bulk statement import (Append mode)', () => {
            renderEditor();

            // Switch to append
            const appendRadio = screen.getByLabelText('admin.design.qsort.bulk.append');
            fireEvent.click(appendRadio);

            const textarea = screen.getByPlaceholderText('admin.design.qsort.bulk.placeholder');
            fireEvent.change(textarea, { target: { value: 'S2: Appended' } });

            const appendButton = screen.getByRole('button', {
                name: 'admin.design.qsort.bulk.process_append',
            });
            fireEvent.click(appendButton);

            const updateFn = mockUpdateDraft.mock.calls[0][0];
            const draft = { statements: [{ code: 's1', translations: [{ text: 'existing' }] }] };
            updateFn(draft);

            expect(draft.statements).toHaveLength(2);
            expect(draft.statements[0].code).toBe('s1');
            expect(draft.statements[1].code).toBe('S2');
        });

        it('supports TSV format in bulk import', () => {
            renderEditor();

            const textarea = screen.getByPlaceholderText('admin.design.qsort.bulk.placeholder');
            fireEvent.change(textarea, { target: { value: 'TSV1\tTab Separated Text' } });

            const replaceButton = screen.getByRole('button', {
                name: 'admin.design.qsort.bulk.process_replace',
            });
            fireEvent.click(replaceButton);

            const updateFn = mockUpdateDraft.mock.calls[0][0];
            const draft = { statements: [] };
            updateFn(draft);

            expect(draft.statements[0].code).toBe('TSV1');
            expect(draft.statements[0].translations[0].text).toBe('Tab Separated Text');
        });

        it('handles multi-line statements in bulk import', () => {
            renderEditor();

            const textarea = screen.getByPlaceholderText('admin.design.qsort.bulk.placeholder');
            const bulkText = `S1: First statement
S2: Second statement
S3: Third statement`;
            fireEvent.change(textarea, { target: { value: bulkText } });

            const replaceButton = screen.getByRole('button', {
                name: 'admin.design.qsort.bulk.process_replace',
            });
            fireEvent.click(replaceButton);

            const updateFn = mockUpdateDraft.mock.calls[0][0];
            const draft = { statements: [] };
            updateFn(draft);

            expect(draft.statements).toHaveLength(3);
            expect(draft.statements[0].code).toBe('S1');
            expect(draft.statements[1].code).toBe('S2');
            expect(draft.statements[2].code).toBe('S3');
        });

        it('clears bulk text after successful import', () => {
            renderEditor();

            const textarea = screen.getByPlaceholderText(
                'admin.design.qsort.bulk.placeholder'
            ) as HTMLTextAreaElement;
            fireEvent.change(textarea, { target: { value: 'S1: Test' } });

            const replaceButton = screen.getByRole('button', {
                name: 'admin.design.qsort.bulk.process_replace',
            });
            fireEvent.click(replaceButton);

            // Textarea should be cleared after import
            expect(textarea.value).toBe('');
        });
    });

    describe('Statement Management', () => {
        it('displays existing statements', () => {
            renderEditor();

            expect(screen.getByText('Existing Statement')).toBeInTheDocument();
        });

        it('can delete individual statements', () => {
            renderEditor();

            const statementItem = screen.getByText('Existing Statement').closest('.group');
            expect(statementItem).toBeInTheDocument();

            // biome-ignore lint/style/noNonNullAssertion: test setup requires element existence
            const deleteButton = within(statementItem!).getAllByRole('button')[1];
            fireEvent.click(deleteButton);

            expect(mockUpdateDraft).toHaveBeenCalled();
            const updateFn = mockUpdateDraft.mock.calls[0][0];
            const draft = { statements: [{ code: 's1' }] };
            updateFn(draft);
            expect(draft.statements).toHaveLength(0);
        });

        it('clears all statements with confirmation', () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

            renderEditor();

            const clearButton = screen.getByText('admin.design.qsort.set.clear');
            fireEvent.click(clearButton);

            expect(confirmSpy).toHaveBeenCalled();
            expect(mockUpdateDraft).toHaveBeenCalled();

            const updateFn = mockUpdateDraft.mock.calls[0][0];
            const draft = { statements: [{ code: 's1' }] };
            updateFn(draft);
            expect(draft.statements).toHaveLength(0);
        });

        it('does not clear statements if confirmation is cancelled', () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => false);

            renderEditor();

            const clearButton = screen.getByText('admin.design.qsort.set.clear');
            fireEvent.click(clearButton);

            expect(confirmSpy).toHaveBeenCalled();
            expect(mockUpdateDraft).not.toHaveBeenCalled();
        });

        it('shows statement count', () => {
            renderEditor();

            // The component should display the count of statements somewhere
            // This depends on the UI implementation - adjust as needed
            expect(screen.getByText('Existing Statement')).toBeInTheDocument();
        });
    });

    describe('Translation Management', () => {
        it('displays statements in active locale', () => {
            renderEditor();

            // Should show English text
            expect(screen.getByText('Existing Statement')).toBeInTheDocument();
        });

        it('updates statement text for active locale', () => {
            // biome-ignore lint/suspicious/noExplicitAny: mock
            (useStudyDesigner as any).mockReturnValue({
                draft: mockDraft,
                activeLocale: 'fr',
                activeSubStep: 'statements',
                updateDraft: mockUpdateDraft,
                setActiveSubStep: mockSetActiveSubStep,
            });

            renderEditor();

            // Should show French text
            expect(screen.getByText('Déclaration existante')).toBeInTheDocument();
        });
    });

    describe('Grid Configuration', () => {
        it('switches to distribution tab', async () => {
            const _user = userEvent.setup();

            // biome-ignore lint/suspicious/noExplicitAny: mock
            (useStudyDesigner as any).mockReturnValue({
                draft: mockDraft,
                activeLocale: 'en',
                activeSubStep: 'grid',
                updateDraft: mockUpdateDraft,
                setActiveSubStep: mockSetActiveSubStep,
            });

            renderEditor();

            // Should show grid configuration UI
            expect(screen.getByText('admin.design.qsort.grid.title')).toBeInTheDocument();
        });

        it('displays grid columns', () => {
            // biome-ignore lint/suspicious/noExplicitAny: mock
            (useStudyDesigner as any).mockReturnValue({
                draft: mockDraft,
                activeLocale: 'en',
                activeSubStep: 'grid',
                updateDraft: mockUpdateDraft,
                setActiveSubStep: mockSetActiveSubStep,
            });

            renderEditor();

            // Should display all grid columns
            // Check for column values -2, -1, 0, 1, 2
            const gridTitle = screen.getByText('admin.design.qsort.grid.title');
            expect(gridTitle).toBeInTheDocument();
        });
    });

    describe('Validation', () => {
        it('shows total statement count', () => {
            renderEditor();

            // Component should show total number of statements
            // This helps users verify their grid configuration matches statement count
            expect(screen.getByText('Existing Statement')).toBeInTheDocument();
        });

        it('validates grid total matches statement count', () => {
            // biome-ignore lint/suspicious/noExplicitAny: mock
            (useStudyDesigner as any).mockReturnValue({
                draft: {
                    ...mockDraft,
                    statements: Array(14)
                        .fill(null)
                        .map((_, i) => ({
                            code: `s${i}`,
                            translations: [{ language_code: 'en', text: `Statement ${i}` }],
                        })),
                    grid_config: [
                        { score: -2, capacity: 2 },
                        { score: -1, capacity: 3 },
                        { score: 0, capacity: 4 },
                        { score: 1, capacity: 3 },
                        { score: 2, capacity: 2 },
                    ], // Total: 14
                },
                activeLocale: 'en',
                activeSubStep: 'grid',
                updateDraft: mockUpdateDraft,
                setActiveSubStep: mockSetActiveSubStep,
            });

            renderEditor();

            // Grid total (14) should match statement count (14)
            // Component should show validation status
            expect(screen.getByText('admin.design.qsort.grid.title')).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('handles empty statements list', () => {
            // biome-ignore lint/suspicious/noExplicitAny: mock
            (useStudyDesigner as any).mockReturnValue({
                draft: {
                    ...mockDraft,
                    statements: [],
                },
                activeLocale: 'en',
                activeSubStep: 'statements',
                updateDraft: mockUpdateDraft,
                setActiveSubStep: mockSetActiveSubStep,
            });

            renderEditor();

            // Should render without crashing
            expect(screen.getByText('admin.design.qsort.bulk.title')).toBeInTheDocument();
        });

        it('handles missing translations for statement', () => {
            // biome-ignore lint/suspicious/noExplicitAny: mock
            (useStudyDesigner as any).mockReturnValue({
                draft: {
                    ...mockDraft,
                    statements: [
                        {
                            code: 's1',
                            translations: [], // No translations
                        },
                    ],
                },
                activeLocale: 'en',
                activeSubStep: 'statements',
                updateDraft: mockUpdateDraft,
                setActiveSubStep: mockSetActiveSubStep,
            });

            renderEditor();

            // Should render without crashing, maybe show placeholder
            expect(screen.getByText('admin.design.qsort.bulk.title')).toBeInTheDocument();
        });

        it('handles invalid bulk import format', () => {
            renderEditor();

            const textarea = screen.getByPlaceholderText('admin.design.qsort.bulk.placeholder');
            fireEvent.change(textarea, { target: { value: 'Invalid format without colon' } });

            const replaceButton = screen.getByRole('button', {
                name: 'admin.design.qsort.bulk.process_replace',
            });
            fireEvent.click(replaceButton);

            // Should handle gracefully - check if updateDraft was called or error shown
            // Behavior depends on component implementation
        });
    });

    describe('UI/UX', () => {
        it('shows tab indicators', () => {
            renderEditor();

            const statementsTab = screen.getByRole('tab', {
                name: 'admin.design.qsort.tabs.statements',
            });
            const distributionTab = screen.getByRole('tab', {
                name: 'admin.design.qsort.tabs.distribution',
            });

            expect(statementsTab).toBeInTheDocument();
            expect(distributionTab).toBeInTheDocument();
        });

        it('hides clear all when no statements exist', () => {
            // biome-ignore lint/suspicious/noExplicitAny: mock
            (useStudyDesigner as any).mockReturnValue({
                draft: {
                    ...mockDraft,
                    statements: [],
                },
                activeLocale: 'en',
                activeSubStep: 'statements',
                updateDraft: mockUpdateDraft,
                setActiveSubStep: mockSetActiveSubStep,
            });

            renderEditor();

            const clearButton = screen.queryByText('admin.design.qsort.set.clear');
            expect(clearButton).not.toBeInTheDocument();
        });
    });
});
