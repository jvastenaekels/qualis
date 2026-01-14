import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuestionBuilder from '../components/admin/designer/QuestionBuilder';
import PreSortPage from '../pages/PreSortPage';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useConfigStore } from '@/store/useConfigStore';
import { useResponseStore } from '@/store/useResponseStore';

// Mock translations
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'admin.design.questions.enable_presort': 'Enable Pre-sort Survey',
                'admin.design.questions.add_field': 'Add a new field',
                'admin.design.questions.types.text': 'Text',
                'presort.title': 'Pre-Sort Survey',
                'presort.description': 'Please answer these questions',
                'admin.design.questions.defaults.new_question': 'New question',
                'common.next': 'Next',
                'presort.submit': 'Submit',
            };
            return translations[key] || key;
        },
        i18n: {
            language: 'en',
        },
    }),
    I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Router params
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ slug: 'test-study' }),
    };
});

describe('Study Consistency (Admin -> Participant)', () => {
    it('renders questions added in Admin Designer within the Participant PreSort page', async () => {
        // 1. Setup Admin Environment
        // We use renderWithStore to initialize Admin Store and provide wrappers
        const { unmount } = renderWithStore(<QuestionBuilder type="pre" />, {
            initialState: {
                draft: {
                    slug: 'test-study',
                    state: 'draft',
                    presort_config: {
                        enabled: true,
                        fields: {},
                    },
                },
                activeLocale: 'en',
            },
        });

        // 2. Act (Admin): Add a question and rename it
        // Add a Text question
        const addTextBtn = screen.getByText('Text');
        fireEvent.click(addTextBtn);

        // Rename it to something unique
        // First expand the accordion (it's collapsed by default)
        const toggleBtn = await screen.findByRole('button', { name: /Toggle/i });
        fireEvent.click(toggleBtn);

        const input = await screen.findByDisplayValue('New question');
        const uniqueLabel = 'Consistency Check Question';
        fireEvent.change(input, { target: { value: uniqueLabel } });

        // 3. Bridge: detailed extraction and injection
        // Get the state from Admin Store
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const adminDraft = useStudyDesigner.getState().draft as any;

        // Transform/Validate if necessary (here we assume direct compatibility for parts we test)
        // The participant store expects 'config' object.
        const participantConfig = {
            ...adminDraft,
            // Ensure presort_config is in the shape expected
            presort_config: adminDraft.presort_config,
            ui_labels: adminDraft.translations?.[0]?.ui_labels || {},
        };

        // Initialize Participant Stores
        useConfigStore.setState({ config: participantConfig });

        // Reset Response Store to avoid stale data
        useResponseStore.setState({ presort: {} });

        // Cleanup Admin Component to avoid DOM interference?
        // Ideally we keep it to show they coexist, or unmount.
        // Let's unmount to simulate "View Participant Site" (separate tab usually).
        unmount();

        // 4. Act (Participant): Render PreSortPage
        // We need to wrap it in Providers (Router etc). renderWithStore does that but also inits Admin store.
        // We can reuse renderWithStore but ignore the store part, OR just use AllTheProviders from test-utils
        // but renderWithStore is convenient.
        // Use an empty initial state for admin store to avoid overwriting our work?
        // Actually, renderWithStore resets 'useStudyDesigner'. It does NOT touch 'useConfigStore'.
        // So we can use renderWithStore just for the Providers wrapper.
        renderWithStore(<PreSortPage />, {
            initialState: { draft: null }, // We don't care about admin store here
        });

        // 5. Assert: Verify the Unique Label appears
        expect(await screen.findByText(uniqueLabel)).toBeInTheDocument();
        expect(screen.getByText('Pre-Sort Survey')).toBeInTheDocument();
    });

    it('shows pre-instruction page when enabled in Admin Designer', async () => {
        // 1. Setup Admin Environment - Start with ConditionOfInstructionEditor
        const { unmount } = renderWithStore(
            <div>
                {/* We'll simulate the effect of ConditionOfInstructionEditor */}
                <button
                    type="button"
                    onClick={() => {
                        const designer = useStudyDesigner.getState();
                        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
                        designer.updateTranslation('en', (t: any) => {
                            t.pre_instruction = 'This is important pre-instruction content!';
                        });
                    }}
                >
                    Enable Pre-Instruction
                </button>
            </div>,
            {
                initialState: {
                    draft: {
                        slug: 'test-study',
                        state: 'draft',
                        translations: [
                            {
                                language_code: 'en',
                                condition_of_instruction: 'Test condition',
                                pre_instruction: null,
                            },
                        ],
                        grid_config: [],
                        statements: [{ id: 1, text: 'Statement 1', code: 'S1' }],
                    },
                    activeLocale: 'en',
                },
            }
        );

        // 2. Act (Admin): Enable pre-instruction
        const enableBtn = screen.getByText('Enable Pre-Instruction');
        fireEvent.click(enableBtn);

        // 3. Bridge: Extract admin config and inject into participant
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const adminDraft = useStudyDesigner.getState().draft as any;
        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const enTranslation = adminDraft.translations.find((t: any) => t.language_code === 'en');

        const participantConfig = {
            ...adminDraft,
            title: 'Test Study',
            description: 'Test description',
            instructions: 'Test instructions',
            condition_of_instruction: enTranslation.condition_of_instruction,
            pre_instruction: enTranslation.pre_instruction,
            ui_labels: {},
        };

        useConfigStore.setState({ config: participantConfig });
        useResponseStore.setState({
            rough: { history: [], agree: [], disagree: [], neutral: [] },
        });

        unmount();

        // 4. Act (Participant): Render RoughSortPage
        // Import RoughSortPage dynamically to avoid circular dependencies
        const RoughSortPage = (await import('../pages/RoughSortPage')).default;

        renderWithStore(<RoughSortPage />, {
            initialState: { draft: null },
        });

        // 5. Assert: Pre-instruction content appears
        expect(
            await screen.findByText('This is important pre-instruction content!')
        ).toBeInTheDocument();

        // Verify pre-instruction screen is showing (has the start/next button)
        const startButtons = screen.getAllByText(
            /admin.design.condition.title|common.start|common.next/i
        );
        expect(startButtons.length).toBeGreaterThan(0);
    });
});
