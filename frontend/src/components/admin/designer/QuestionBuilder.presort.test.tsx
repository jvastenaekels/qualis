import { screen, fireEvent, within } from '@testing-library/react';
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
        expect(screen.getByText('Enable Pre-sort Survey')).toBeInTheDocument();
    });

    it('migrates from legacy to new structure when toggling presort', async () => {
        const legacyDraft = {
            presort_config: {
                q1: { type: 'text', label: 'Name', required: true },
            },
        };

        renderBuilder({ draft: legacyDraft });

        const toggle = screen.getByRole('switch');

        // Turn OFF
        fireEvent.click(toggle);

        // Verify state
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        let currentDraft: any = useStudyDesigner.getState().draft;
        expect(currentDraft.presort_config.enabled).toBe(false);
        expect(Object.keys(currentDraft.presort_config.fields)).toContain('q1');

        // Turn ON
        fireEvent.click(toggle);
        currentDraft = useStudyDesigner.getState().draft;
        expect(currentDraft.presort_config.enabled).toBe(true);
    });

    it('updates fields in new structure', async () => {
        const newDraft = {
            presort_config: {
                enabled: true,
                fields: {
                    q1: { type: 'text', label: 'Old Name', required: true },
                },
            },
        };

        renderBuilder({ draft: newDraft });

        // Find toggle button and click it
        const toggleBtn = screen.getByRole('button', { name: /Toggle/i });
        fireEvent.click(toggleBtn);

        // Wait for input to appear and change it
        const input = await screen.findByDisplayValue('Old Name');
        fireEvent.change(input, { target: { value: 'New Name' } });

        // Check store
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // Depending on logic, it might have converted to localized object or stayed string
        // The component logic handles string -> string or object -> object.
        // If it started as string, it stays string (based on QuestionItem logic).
        // Let's check both possibilities.
        const label = currentDraft.presort_config.fields.q1.label;
        if (typeof label === 'string') {
            expect(label).toBe('New Name');
        } else {
            expect(label.en).toBe('New Name');
        }
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
        expect(screen.getByText('Enable Pre-sort Survey')).toBeInTheDocument();
    });
});
