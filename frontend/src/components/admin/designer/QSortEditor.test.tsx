import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('QSortEditor', () => {
    const mockUpdateDraft = vi.fn();
    const mockDraft = {
        statements: [
            {
                code: 's1',
                translations: [{ language_code: 'en', text: 'Existing Statement' }],
            },
        ],
        grid_config: [{ score: 0, capacity: 1 }],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useStudyDesigner as any).mockReturnValue({
            draft: mockDraft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });
    });

    it('renders the editor with sub-tabs', async () => {
        render(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>
        );
        expect(await screen.findByRole('tab', { name: /Statements/i })).toBeInTheDocument();
        expect(await screen.findByRole('tab', { name: /Distribution/i })).toBeInTheDocument();
    });

    it('handles bulk statement import (Replace mode)', () => {
        render(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>
        );

        const textarea = screen.getByPlaceholderText(/Paste your statements here/i);
        fireEvent.change(textarea, {
            target: { value: 'S1: New Statement 1\nS2: New Statement 2' },
        });

        const replaceButton = screen.getByRole('button', { name: /Process & Replace/i });
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
        render(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>
        );

        // Switch to append
        const appendRadio = screen.getByLabelText(/Append/i);
        fireEvent.click(appendRadio);

        const textarea = screen.getByPlaceholderText(/Paste your statements here/i);
        fireEvent.change(textarea, { target: { value: 'S2: Appended' } });

        const appendButton = screen.getByRole('button', { name: /Process & Append/i });
        fireEvent.click(appendButton);

        const updateFn = mockUpdateDraft.mock.calls[0][0];
        const draft = { statements: [{ code: 's1', translations: [{ text: 'existing' }] }] };
        updateFn(draft);

        expect(draft.statements).toHaveLength(2);
        expect(draft.statements[0].code).toBe('s1');
        expect(draft.statements[1].code).toBe('S2');
    });

    it('supports TSV format in bulk import', () => {
        render(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>
        );

        const textarea = screen.getByPlaceholderText(/Paste your statements here/i);
        fireEvent.change(textarea, { target: { value: 'TSV1\tTab Separated Text' } });

        const replaceButton = screen.getByRole('button', { name: /Process & Replace/i });
        fireEvent.click(replaceButton);

        const updateFn = mockUpdateDraft.mock.calls[0][0];
        const draft = { statements: [] };
        updateFn(draft);

        expect(draft.statements[0].code).toBe('TSV1');
        expect(draft.statements[0].translations[0].text).toBe('Tab Separated Text');
    });

    it('clears all statements with confirmation', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

        render(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>
        );

        const clearButton = screen.getByText(/Clear All/i);
        fireEvent.click(clearButton);

        expect(confirmSpy).toHaveBeenCalled();
        expect(mockUpdateDraft).toHaveBeenCalled();

        const updateFn = mockUpdateDraft.mock.calls[0][0];
        const draft = { statements: [{ code: 's1' }] };
        updateFn(draft);
        expect(draft.statements).toHaveLength(0);
    });

    it('can delete individual statements', () => {
        render(
            <TooltipProvider>
                <QSortEditor />
            </TooltipProvider>
        );

        // Find delete button for the first statement
        // We find the container by the 'group' class which wraps the statement item
        const statementItem = screen.getByText('Existing Statement').closest('.group');
        expect(statementItem).toBeInTheDocument();

        // There are two buttons: the text itself (for edit) and the delete button
        // We want the delete button (the second one)
        const deleteButton = within(statementItem!).getAllByRole('button')[1];
        fireEvent.click(deleteButton);

        expect(mockUpdateDraft).toHaveBeenCalled();
        const updateFn = mockUpdateDraft.mock.calls[0][0];
        const draft = { statements: [{ code: 's1' }] };
        updateFn(draft);
        expect(draft.statements).toHaveLength(0);
    });
});
