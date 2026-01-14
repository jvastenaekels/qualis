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

        expect(screen.getByText('Condition of Instruction (Grid Sort)')).toBeInTheDocument();

        // There is one "Instruction Text" label now
        const labels = screen.getAllByText('Instruction Text');
        expect(labels).toHaveLength(1);
    });

    it('updates grid sort instruction field', () => {
        renderEditor();

        const input = screen.getByLabelText('Instruction Text');
        fireEvent.change(input, { target: { value: 'Test grid instruction' } });

        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
        expect(enTranslation.condition_of_instruction).toBe('Test grid instruction');
    });

    it('displays existing values from draft', () => {
        renderEditor({
            draft: {
                translations: [
                    {
                        language_code: 'en',
                        condition_of_instruction: 'Existing grid instruction',
                    },
                ],
            },
        });

        const input = screen.getByLabelText('Instruction Text') as HTMLInputElement;
        expect(input.value).toBe('Existing grid instruction');
    });

    it('returns null when draft is missing', () => {
        renderWithStore(<ConditionOfInstructionEditor />, {
            initialState: { draft: null },
        });

        expect(screen.queryByText('Condition of Instruction (Grid Sort)')).not.toBeInTheDocument();
    });
});
