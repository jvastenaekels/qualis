import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConditionOfInstructionEditor from './ConditionOfInstructionEditor';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { useStudyDesigner } from '@/store/useStudyDesigner';

describe('ConditionOfInstructionEditor', () => {
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    const renderEditor = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test-study',
            state: 'draft',
            translations: [
                {
                    language_code: 'en',
                    condition_of_instruction: '',
                    pre_instruction: '',
                },
            ],
            ...(initialStateOverrides.draft || {}),
        };

        return renderWithStore(<ConditionOfInstructionEditor />, {
            initialState: {
                ...initialStateOverrides,
                draft: mergedDraft,
                activeLocale: 'en',
            },
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders both instruction inputs', () => {
        renderEditor();

        expect(screen.getByText('Condition of Instruction (Grid Sort)')).toBeInTheDocument();
        expect(screen.getByText('Instruction for preliminary sort')).toBeInTheDocument();

        // There are two "Instruction Text" labels now
        const labels = screen.getAllByText('Instruction Text');
        expect(labels).toHaveLength(2);
    });

    it('updates grid sort instruction field', () => {
        renderEditor();

        const input = screen.getAllByLabelText('Instruction Text')[0];
        fireEvent.change(input, { target: { value: 'Test grid instruction' } });

        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
        expect(enTranslation.condition_of_instruction).toBe('Test grid instruction');
    });

    it('updates preliminary sort instruction field', () => {
        renderEditor();

        const input = screen.getAllByLabelText('Instruction Text')[1];
        fireEvent.change(input, { target: { value: 'Test pre-instruction' } });

        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
        expect(enTranslation.pre_instruction).toBe('Test pre-instruction');
    });

    it('displays existing values from draft', () => {
        renderEditor({
            draft: {
                translations: [
                    {
                        language_code: 'en',
                        condition_of_instruction: 'Existing grid instruction',
                        pre_instruction: 'Existing pre-instruction',
                    },
                ],
            },
        });

        const inputs = screen.getAllByLabelText('Instruction Text') as HTMLInputElement[];
        expect(inputs[0].value).toBe('Existing grid instruction');
        expect(inputs[1].value).toBe('Existing pre-instruction');
    });

    it('returns null when draft is missing', () => {
        renderWithStore(<ConditionOfInstructionEditor />, {
            initialState: { draft: null },
        });

        expect(screen.queryByText('Condition of Instruction (Grid Sort)')).not.toBeInTheDocument();
    });
});
