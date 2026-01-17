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

    it('renders instruction input', () => {
        renderEditor();

        // Check for Grid Sort Instruction
        expect(screen.getByText('Grid Sort Instruction')).toBeInTheDocument();

        // Check for Preliminary Sort Instruction
        expect(screen.getByText('Preliminary Sort Instruction')).toBeInTheDocument();

        // There are two "Instruction Text" labels now (one for each section)
        const labels = screen.getAllByText('Instruction Text');
        expect(labels).toHaveLength(2);
    });

    it('updates grid sort instruction field', () => {
        renderEditor();

        // Since there are multiple inputs with label "Instruction Text"
        const inputs = screen.getAllByLabelText('Instruction Text');
        const gridInput = inputs[1]; // Grid Sort is the second card

        fireEvent.change(gridInput, { target: { value: 'Test grid instruction' } });

        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
        expect(enTranslation.condition_of_instruction).toBe('Test grid instruction');
    });

    it('updates preliminary sort instruction field', () => {
        renderEditor();

        const inputs = screen.getAllByLabelText('Instruction Text');
        const preInput = inputs[0]; // Pre-Sort is the first card

        fireEvent.change(preInput, { target: { value: 'Test pre instruction' } });

        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
        expect(enTranslation.pre_instruction).toBe('Test pre instruction');
    });

    it('displays existing values from draft', () => {
        renderEditor({
            draft: {
                translations: [
                    {
                        language_code: 'en',
                        condition_of_instruction: 'Existing grid instruction',
                        pre_instruction: 'Existing pre instruction',
                    },
                ],
            },
        });

        const inputs = screen.getAllByLabelText('Instruction Text') as HTMLInputElement[];
        expect(inputs[0].value).toBe('Existing pre instruction');
        expect(inputs[1].value).toBe('Existing grid instruction');
    });

    it('returns null when draft is missing', () => {
        renderWithStore(<ConditionOfInstructionEditor />, {
            initialState: { draft: null },
        });

        expect(screen.queryByText('Condition of Instruction (Grid Sort)')).not.toBeInTheDocument();
    });
});
