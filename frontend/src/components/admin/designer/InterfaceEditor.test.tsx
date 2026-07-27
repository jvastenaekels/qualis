import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        expect(screen.queryByText('Start button')).not.toBeInTheDocument();
    });

    it('renders navigation button configuration', () => {
        renderEditor();

        // Check for labels
        expect(screen.getByText('Start button')).toBeInTheDocument();
        expect(screen.getByText('Next step button')).toBeInTheDocument();
        expect(screen.getByText('Submit button')).toBeInTheDocument();

        // Check for existing value from draft
        expect(screen.getByDisplayValue('Custom Start')).toBeInTheDocument();
    });

    it('renders sorting terminology configuration', () => {
        renderEditor();

        expect(screen.getByText('Most agree')).toBeInTheDocument();
        expect(screen.getByText('Most disagree')).toBeInTheDocument();
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

    describe('accessible names (Task 6.7b)', () => {
        it('names the "Next step button" field and lets its label focus it', async () => {
            const user = userEvent.setup();
            renderEditor();

            const field = screen.getByRole('textbox', { name: /next step button/i });
            await user.click(screen.getByText('Next step button'));
            expect(field).toHaveFocus();
        });

        it('names the terminology fields distinctly per stance and per group', () => {
            renderEditor();

            // "Agree"/"Most agree" are unique across the two term groups —
            // getByRole computes the real accessible name, so this only
            // passes if each group's htmlFor/id pairing resolved to the
            // right sibling Input rather than colliding across groups.
            expect(screen.getByRole('textbox', { name: /^agree$/i })).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /^most agree$/i })).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /^disagree$/i })).toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: /^most disagree$/i })).toBeInTheDocument();
        });

        it('names the "What we ask"/"Why it matters" step-help fields for every visible step', () => {
            renderEditor();

            // Every step in the Step Guidance card renders its own What/Why
            // pair with a per-step id (`step-help-${step.id}-${field}`) — if
            // any two steps collided on id, some of these would resolve to
            // the wrong control or fail to resolve at all.
            const whatFields = screen.getAllByRole('textbox', { name: /^what we ask$/i });
            const whyFields = screen.getAllByRole('textbox', { name: /^why it matters$/i });
            expect(whatFields.length).toBeGreaterThanOrEqual(2);
            expect(whatFields).toHaveLength(whyFields.length);
        });
    });

    describe('control names (Task 6.7c)', () => {
        it('names the navigation-button info tooltip trigger per field', () => {
            renderEditor();

            expect(screen.getByRole('button', { name: 'About Start button' })).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'About Next step button' })
            ).toBeInTheDocument();
        });

        it('discriminates the remove-tip button by the tip text, falling back to an ordinal when empty', () => {
            renderEditor({
                draft: {
                    translations: [
                        {
                            language_code: 'en',
                            ui_labels: {},
                            methodology_tips: ['Sort intuitively first', ''],
                        },
                    ],
                },
            });

            expect(
                screen.getByRole('button', { name: 'Remove Sort intuitively first' })
            ).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Remove Tip 2' })).toBeInTheDocument();
        });
    });
});
