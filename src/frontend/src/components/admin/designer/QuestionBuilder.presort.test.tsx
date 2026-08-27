import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import QuestionBuilder from './QuestionBuilder';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { useStudyDesigner } from '@/store/useStudyDesigner';

// Mock removed

describe('QuestionBuilder - Presort Config Migration', () => {
    // biome-ignore lint/suspicious/noExplicitAny: weak typing for test utility
    const renderBuilder = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test',
            state: 'draft',
            presort_config: {},
            ...(initialStateOverrides.draft || {}),
        };

        return renderWithStore(<QuestionBuilder type="pre" />, {
            initialState: {
                ...initialStateOverrides,
                draft: mergedDraft,
                activeLocale: 'en',
            },
        });
    };

    it('handles legacy presort_config structure (flat object)', async () => {
        const legacyDraft = {
            presort_config: {
                q1: { type: 'text', label: 'Legacy Name', required: true },
            },
        };

        renderBuilder({ draft: legacyDraft });

        // Use getByText because input is hidden in collapsed accordion
        expect(await screen.findByText('Legacy Name')).toBeInTheDocument();
    });

    it('handles new presort_config structure with enabled flag', async () => {
        const newDraft = {
            presort_config: {
                enabled: true,
                fields: {
                    q1: { type: 'text', label: 'New Name', required: true },
                },
            },
        };

        renderBuilder({ draft: newDraft });

        expect(await screen.findByText('New Name')).toBeInTheDocument();
    });

    it('shows builder only when presort is enabled in new structure', () => {
        const draftDisabled = {
            presort_config: {
                enabled: false,
                fields: {
                    q1: { type: 'text', label: 'Hidden Question', required: true },
                },
            },
        };

        renderBuilder({ draft: draftDisabled });

        // Should NOT show question builder content (fields)
        expect(screen.queryByText('Hidden Question')).not.toBeInTheDocument();
        // Should show enable toggle
        expect(screen.getByText('Enable pre-sort survey')).toBeInTheDocument();
    });

    it('migrates from legacy to new structure when toggling presort', async () => {
        const user = userEvent.setup();
        const legacyDraft = {
            translations: [{ language_code: 'en' }],
            presort_config: {
                q1: { type: 'text', label: 'Name', required: true },
            },
        };

        renderBuilder({ draft: legacyDraft });

        const toggle = screen.getByRole('switch');
        // Legacy starts ON
        expect(toggle).toBeChecked();

        // Turn OFF
        await user.click(toggle);

        // Verify state
        await waitFor(() => {
            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            expect(currentDraft.presort_config.enabled).toBe(false);
            expect(Object.keys(currentDraft.presort_config.fields)).toContain('q1');
        });

        // Turn ON
        await user.click(toggle);
        await waitFor(() => {
            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            expect(currentDraft.presort_config.enabled).toBe(true);
        });
    });

    it('updates fields in new structure', async () => {
        const user = userEvent.setup();
        const newDraft = {
            translations: [{ language_code: 'en' }],
            presort_config: {
                enabled: true,
                fields: {
                    q1: { type: 'text', label: 'Old Name', required: true },
                },
            },
        };

        renderBuilder({ draft: newDraft });

        // Find toggle button and click it
        const toggleBtn = await screen.findByTestId('question-accordion-trigger');
        await user.click(toggleBtn);

        // Wait for input to appear
        const input = await screen.findByDisplayValue('Old Name');
        await user.clear(input);
        await user.type(input, 'New Name');

        // Verify DOM updated
        await screen.findByDisplayValue('New Name');

        // Check store with proper wait
        await waitFor(() => {
            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            const label = currentDraft.presort_config.fields.q1.label;

            if (typeof label === 'string') {
                expect(label).toBe('New Name');
            } else {
                expect(label.en).toBe('New Name');
            }
        });
    });

    it('deletes fields correctly', async () => {
        const newDraft = {
            presort_config: {
                enabled: true,
                fields: {
                    q1: { type: 'text', label: 'To Delete', required: true },
                },
            },
        };

        renderBuilder({ draft: newDraft });

        const questionText = await screen.findByText('To Delete');
        const questionContainer = questionText.closest('.group');

        expect(questionContainer).toBeInTheDocument();

        if (questionContainer) {
            const buttons = within(questionContainer as HTMLElement).getAllByRole('button');
            // Find button with Trash icon
            const trashBtn = buttons.find((btn) => btn.querySelector('.lucide-trash-2'));

            expect(trashBtn).toBeDefined();
            if (trashBtn) {
                fireEvent.click(trashBtn);
            }

            // Verify deleted (text should be gone)
            expect(screen.queryByText('To Delete')).not.toBeInTheDocument();
        }
    });

    it('prevents infinite loops with defensive checks', async () => {
        const newDraft = {
            presort_config: {
                enabled: true,
                fields: {},
            },
        };

        renderBuilder({ draft: newDraft });
        expect(screen.getByText('Enable pre-sort survey')).toBeInTheDocument();
    });
});
