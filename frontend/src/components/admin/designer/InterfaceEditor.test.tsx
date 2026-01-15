import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import InterfaceEditor from './InterfaceEditor';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { useStudyDesigner } from '@/store/useStudyDesigner';

// Mock removed

describe('InterfaceEditor', () => {
    // biome-ignore lint/suspicious/noExplicitAny: weak typing
    const renderEditor = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test',
            state: 'draft',
            translations: [
                {
                    language_code: 'en',
                    ui_labels: {
                        'welcome.start': 'Custom Start',
                    },
                },
            ],
            ...(initialStateOverrides.draft || {}),
        };

        return renderWithStore(<InterfaceEditor />, {
            initialState: {
                ...initialStateOverrides,
                draft: mergedDraft,
                activeLocale: 'en',
            },
        });
    };

    it('returns null if draft is missing', () => {
        // renderWithStore sets default draft to null if not provided in defaultDataValues?
        // Actually renderWithStore sets defaults. We need to explicitly set draft to null to test this.
        // But renderWithStore merges with defaults. Our Helper merges with default draft.
        // We should call renderWithStore directly for this edge case.
        renderWithStore(<InterfaceEditor />, { initialState: { draft: null } });
        // The container will typically be empty or null
        // But queries might fail if we expect elements.
        // If it returns null, we can check container is empty.
        // We can't access container easily from here without destructuring.
        // Let's use a query that should NOT be there.
        expect(screen.queryByText('Start Button')).not.toBeInTheDocument();
    });

    it('renders navigation button configuration', () => {
        renderEditor();

        // Check for labels
        expect(screen.getByText('Start Button')).toBeInTheDocument();
        expect(screen.getByText('Next Step Button')).toBeInTheDocument();
        expect(screen.getByText('Submit Button')).toBeInTheDocument();

        // Check for existing value from draft
        expect(screen.getByDisplayValue('Custom Start')).toBeInTheDocument();
    });

    it('renders sorting terminology configuration', () => {
        renderEditor();

        expect(screen.getByText('Most Agree')).toBeInTheDocument();
        expect(screen.getByText('Most Disagree')).toBeInTheDocument();
        expect(screen.getAllByText('Neutral').length).toBeGreaterThanOrEqual(1);
    });

    it('updates labels via updateTranslation', () => {
        renderEditor();

        const nextButtonInput = screen.getByPlaceholderText('Next step');
        fireEvent.change(nextButtonInput, { target: { value: 'Forward' } });

        // Verify store update
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
        expect(enTranslation.ui_labels['common.next']).toBe('Forward');
    });

    it('handles empty values by deleting keys', () => {
        renderEditor();

        // Assuming we started with a value (mocked in defaultDraft for 'welcome.start')
        const startInput = screen.getByDisplayValue('Custom Start');
        fireEvent.change(startInput, { target: { value: '' } });

        // Verify store update
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
        expect(enTranslation.ui_labels['welcome.start']).toBeUndefined();
    });
});
