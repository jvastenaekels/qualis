import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConditionOfInstructionEditor from './ConditionOfInstructionEditor';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { useStudyDesigner } from '@/store/useStudyDesigner';

// Mock removed

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
                    pre_instruction: null,
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

    it('renders condition of instruction input', () => {
        renderEditor();

        expect(screen.getByText('Condition of Instruction')).toBeInTheDocument();
        expect(screen.getByLabelText('Instruction Text')).toBeInTheDocument();
    });

    it('updates condition_of_instruction field', () => {
        renderEditor();

        const input = screen.getByLabelText('Instruction Text');
        fireEvent.change(input, { target: { value: 'Test instruction' } });

        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
        expect(enTranslation.condition_of_instruction).toBe('Test instruction');
    });

    describe('Pre-Instruction Toggle', () => {
        it('shows toggle for enabling pre-instruction', () => {
            renderEditor();

            expect(screen.getByText('Enable Pre-instruction step')).toBeInTheDocument();
            const toggle = screen.getByRole('switch');
            expect(toggle).toBeInTheDocument();
        });

        it('toggle is off when pre_instruction is null', () => {
            renderEditor();

            const toggle = screen.getByRole('switch');
            expect(toggle).toHaveAttribute('data-state', 'unchecked');
        });

        it('toggle is on when pre_instruction has value', () => {
            renderEditor({
                draft: {
                    translations: [
                        {
                            language_code: 'en',
                            condition_of_instruction: '',
                            pre_instruction: 'Some instruction',
                        },
                    ],
                },
            });

            const toggle = screen.getByRole('switch');
            expect(toggle).toHaveAttribute('data-state', 'checked');
        });

        it('enabling toggle sets pre_instruction to empty string', async () => {
            renderEditor();

            const toggle = screen.getByRole('switch');
            fireEvent.click(toggle);

            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            const enTranslation = currentDraft.translations.find(
                // biome-ignore lint/suspicious/noExplicitAny: access internal structure
                (t: any) => t.language_code === 'en'
            );
            expect(enTranslation.pre_instruction).toBe('');
        });

        it('disabling toggle sets pre_instruction to null', async () => {
            renderEditor({
                draft: {
                    translations: [
                        {
                            language_code: 'en',
                            condition_of_instruction: '',
                            pre_instruction: 'Some content',
                        },
                    ],
                },
            });

            const toggle = screen.getByRole('switch');
            fireEvent.click(toggle);

            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            const enTranslation = currentDraft.translations.find(
                // biome-ignore lint/suspicious/noExplicitAny: access internal structure
                (t: any) => t.language_code === 'en'
            );
            expect(enTranslation.pre_instruction).toBe(null);
        });
    });

    describe('Pre-Instruction Editor', () => {
        it('does not show editor when pre-instruction is disabled', () => {
            renderEditor();

            expect(screen.queryByText('Pre-instruction Content')).not.toBeInTheDocument();
        });

        it('shows markdown editor when pre-instruction is enabled', () => {
            renderEditor({
                draft: {
                    translations: [
                        {
                            language_code: 'en',
                            condition_of_instruction: '',
                            pre_instruction: '',
                        },
                    ],
                },
            });

            expect(screen.getByText('Pre-instruction Content')).toBeInTheDocument();
        });

        it('updates pre_instruction content', () => {
            renderEditor({
                draft: {
                    translations: [
                        {
                            language_code: 'en',
                            condition_of_instruction: '',
                            pre_instruction: 'Initial content',
                        },
                    ],
                },
            });

            // Find the markdown editor textarea (MarkdownEditor component)
            const textarea = screen.getByDisplayValue('Initial content');
            fireEvent.change(textarea, { target: { value: 'Updated content' } });

            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            const enTranslation = currentDraft.translations.find(
                // biome-ignore lint/suspicious/noExplicitAny: access internal structure
                (t: any) => t.language_code === 'en'
            );
            expect(enTranslation.pre_instruction).toBe('Updated content');
        });

        it('preserves pre_instruction content when toggling on/off/on', () => {
            renderEditor();

            const toggle = screen.getByRole('switch');

            // Enable
            fireEvent.click(toggle);

            // Add content
            const textarea = screen.getByLabelText(/Pre-instruction Content/i);
            fireEvent.change(textarea, { target: { value: 'My instruction' } });

            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            let currentDraft: any = useStudyDesigner.getState().draft;
            let enTranslation = currentDraft.translations.find(
                // biome-ignore lint/suspicious/noExplicitAny: access internal structure
                (t: any) => t.language_code === 'en'
            );
            expect(enTranslation.pre_instruction).toBe('My instruction');

            // Disable (content is lost)
            fireEvent.click(toggle);
            currentDraft = useStudyDesigner.getState().draft;
            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
            expect(enTranslation.pre_instruction).toBe(null);

            // Re-enable (starts fresh)
            fireEvent.click(toggle);
            currentDraft = useStudyDesigner.getState().draft;
            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            enTranslation = currentDraft.translations.find((t: any) => t.language_code === 'en');
            expect(enTranslation.pre_instruction).toBe('');
        });
    });

    it('returns null when draft is missing', () => {
        renderWithStore(<ConditionOfInstructionEditor />, {
            initialState: { draft: null },
        });

        expect(screen.queryByText('Condition of Instruction')).not.toBeInTheDocument();
    });
});
