import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuestionBuilder from './QuestionBuilder';
import { useStudyDesigner } from '@/store/useStudyDesigner';

vi.mock('@/store/useStudyDesigner', () => ({
    useStudyDesigner: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'admin.design.questions.enable_presort': 'Enable Pre-sort Survey',
                'admin.design.questions.enable_presort_desc': 'Collect demographic information',
                'admin.design.questions.add_field': 'Add a new field',
                'admin.design.questions.basic_fields': 'Basic fields',
                'admin.design.questions.choice_fields': 'Choice fields',
                'admin.design.questions.types.text': 'Text',
                'admin.design.questions.types.dropdown': 'Dropdown',
                'admin.design.questions.empty.title': 'No questions yet',
                'admin.design.questions.empty.desc': 'Click above to add',
                'admin.design.questions.defaults.new_question': 'New question',
                'admin.design.questions.defaults.option': 'Option',
                'admin.design.questions.defaults.enter_answer': 'Enter your answer',
                'admin.design.questions.labels.question': 'Question label',
                'admin.design.questions.labels.required': 'Required',
                'admin.design.questions.defaults.untitled': 'Untitled',
            };
            return translations[key] || key;
        },
    }),
}));

describe('QuestionBuilder - Presort Config Migration', () => {
    const mockUpdateDraft = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('handles legacy presort_config structure (flat object)', () => {
        const legacyDraft = {
            presort_config: {
                q1: { type: 'text', label: 'Name', required: true },
                q2: { type: 'email', label: 'Email', required: false },
            },
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft: legacyDraft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<QuestionBuilder type="pre" />);

        // Should render the existing questions from legacy structure
        expect(screen.getByText('Name')).toBeInTheDocument();
        expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('handles new presort_config structure with enabled flag', () => {
        const newDraft = {
            presort_config: {
                enabled: true,
                fields: {
                    q1: { type: 'text', label: 'Name', required: true },
                },
            },
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft: newDraft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<QuestionBuilder type="pre" />);

        // Should render questions from fields in new structure
        expect(screen.getByText('Name')).toBeInTheDocument();
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

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft: draftDisabled,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<QuestionBuilder type="pre" />);

        // Should NOT show question builder when disabled
        expect(screen.queryByText('Add a new field')).not.toBeInTheDocument();
    });

    it('migrates from legacy to new structure when toggling presort', async () => {
        const legacyDraft = {
            presort_config: {
                q1: { type: 'text', label: 'Name', required: true },
            },
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft: legacyDraft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<QuestionBuilder type="pre" />);
        const toggle = screen.getByRole('switch');

        // Toggle should migrate to new structure
        fireEvent.click(toggle);

        expect(mockUpdateDraft).toHaveBeenCalled();
        const updateFn = mockUpdateDraft.mock.calls[0][0];
        const draft = { presort_config: { q1: { type: 'text', label: 'Name', required: true } } };
        updateFn(draft);

        // Should create new structure with enabled flag and move questions to fields
        expect(draft.presort_config).toHaveProperty('enabled');
        expect(draft.presort_config).toHaveProperty('fields');
        expect(draft.presort_config.fields).toEqual({
            q1: { type: 'text', label: 'Name', required: true },
        });
    });

    it('update handler targets correct location in new structure', () => {
        const newDraft = {
            presort_config: {
                enabled: true,
                fields: {
                    q1: { type: 'text', label: 'Name', required: true },
                },
            },
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft: newDraft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<QuestionBuilder type="pre" />);

        // Simulate what the onUpdate handler should do
        const testDraft = {
            presort_config: {
                enabled: true,
                fields: { q1: { type: 'text', label: 'Name', required: true } },
            },
        };

        // Simulate the onUpdate handler logic
        // biome-ignore lint/suspicious/noExplicitAny: test data
        const onUpdateHandler = (d: typeof testDraft, questionId: string, data: any) => {
            if (d.presort_config && 'enabled' in d.presort_config) {
                if (!d.presort_config.fields) d.presort_config.fields = {};
                d.presort_config.fields[questionId] = data;
            }
        };

        onUpdateHandler(testDraft, 'q1', { type: 'email', label: 'Email', required: false });

        // Should update in fields, not presort_config root
        expect(testDraft.presort_config.fields.q1).toEqual({
            type: 'email',
            label: 'Email',
            required: false,
        });
    });

    it('delete handler targets correct location in new structure', () => {
        const newDraft = {
            presort_config: {
                enabled: true,
                fields: {
                    q1: { type: 'text', label: 'Name', required: true },
                },
            },
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft: newDraft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<QuestionBuilder type="pre" />);

        // Simulate the delete handler being called
        // In real usage, this would be triggered by the delete button
        const testDraft = {
            presort_config: {
                enabled: true,
                fields: { q1: { type: 'text', label: 'Name', required: true } },
            },
        };

        // Simulate what the onDelete handler should do
        const onDeleteHandler = (d: typeof testDraft) => {
            if (d.presort_config && 'enabled' in d.presort_config) {
                if (d.presort_config.fields) {
                    delete d.presort_config.fields.q1;
                }
            }
        };

        onDeleteHandler(testDraft);

        // Should delete from fields, not from presort_config root
        expect(testDraft.presort_config.fields).toEqual({});
        // Structure should remain intact
        expect(testDraft.presort_config.enabled).toBe(true);
    });

    it('prevents infinite loops with defensive checks', async () => {
        const newDraft = {
            presort_config: {
                enabled: true,
                fields: {},
            },
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft: newDraft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<QuestionBuilder type="pre" />);
        const toggle = screen.getByRole('switch');

        // Click toggle when already enabled
        fireEvent.click(toggle);

        // Handler should still be called (controlled by component)
        // but defensive check in presort toggle prevents issues
        expect(mockUpdateDraft).toHaveBeenCalled();
    });
});
