/**
 * Tests for InterfaceEditor component
 *
 * Verifies that the interface customization editor correctly renders input fields
 * and updates the study design draft when changes are made.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InterfaceEditor from './InterfaceEditor';

// Mock dependencies
const mockUpdateTranslation = vi.fn();
const mockUseStudyDesigner = vi.fn();

vi.mock('@/store/useStudyDesigner', () => ({
    useStudyDesigner: () => mockUseStudyDesigner(),
}));

describe('InterfaceEditor', () => {
    const defaultDraft = {
        translations: [
            {
                language_code: 'en',
                ui_labels: {
                    'welcome.start': 'Custom Start',
                },
            },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseStudyDesigner.mockReturnValue({
            draft: defaultDraft,
            activeLocale: 'en',
            updateTranslation: mockUpdateTranslation,
        });
    });

    it('returns null if draft is missing', () => {
        mockUseStudyDesigner.mockReturnValue({ draft: null });
        const { container } = render(<InterfaceEditor />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders navigation button configuration', () => {
        render(<InterfaceEditor />);

        // Check for labels
        expect(screen.getByText('Start button')).toBeInTheDocument();
        expect(screen.getByText('Next step button')).toBeInTheDocument();
        expect(screen.getByText('Submit button')).toBeInTheDocument();

        // Check for existing value from draft
        const startInput = screen.getByDisplayValue('Custom Start');
        expect(startInput).toBeInTheDocument();
    });

    it('renders sorting terminology configuration', () => {
        render(<InterfaceEditor />);

        expect(screen.getByText('Most Agree')).toBeInTheDocument();
        expect(screen.getByText('Most Disagree')).toBeInTheDocument();
        expect(screen.getAllByText('Neutral').length).toBeGreaterThanOrEqual(1);
    });

    it('updates labels via updateTranslation', () => {
        render(<InterfaceEditor />);

        const nextButtonInput = screen.getByPlaceholderText('Next step');
        fireEvent.change(nextButtonInput, { target: { value: 'Forward' } });

        expect(mockUpdateTranslation).toHaveBeenCalledWith('en', expect.any(Function));

        // Verify the callback logic
        const callback = mockUpdateTranslation.mock.calls[0][1];
        const translationObj = { ui_labels: {} };
        callback(translationObj);

        expect(translationObj.ui_labels['common.next']).toBe('Forward');
    });

    it('handles empty values by deleting keys', () => {
        render(<InterfaceEditor />);

        // Assuming we started with a value (mocked in defaultDraft for 'welcome.start')
        const startInput = screen.getByDisplayValue('Custom Start');
        fireEvent.change(startInput, { target: { value: '' } });

        expect(mockUpdateTranslation).toHaveBeenCalled();

        const callback = mockUpdateTranslation.mock.calls[0][1];
        const translationObj = { ui_labels: { 'welcome.start': 'Custom Start' } };
        callback(translationObj);

        expect(translationObj.ui_labels['welcome.start']).toBeUndefined();
    });
});
