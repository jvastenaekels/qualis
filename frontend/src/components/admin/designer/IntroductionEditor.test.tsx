import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import IntroductionEditor from './IntroductionEditor';
import { useStudyDesigner } from '@/store/useStudyDesigner';

// Mock MarkdownEditor to simplify testing (it's tested separately)
vi.mock('./MarkdownEditor', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock component props
    default: ({ id, label, value, onChange, placeholder }: any) => (
        <div data-testid={`markdown-editor-${id}`}>
            <label htmlFor={id}>{label}</label>
            <textarea
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
            />
        </div>
    ),
}));

// Mock ProcessStepEditor to simplify testing and avoid DND context issues
vi.mock('@/components/admin/designer/ProcessStepEditor', () => ({
    ProcessStepEditor: () => <div data-testid="process-step-editor" />,
}));

describe('IntroductionEditor', () => {
    const mockTranslations = [
        {
            language_code: 'en',
            title: 'Test Study Title',
            subtitle: 'Test Subtitle',
            objective: 'Test Objective',
            instructions: 'Test Instructions',
            consent_title: null,
            consent_description: null,
            consent_accept: null,
            consent_decline: null,
        },
        {
            language_code: 'fr',
            title: 'Titre du test',
            subtitle: 'Sous-titre',
            objective: 'Objectif',
            instructions: 'Instructions',
            consent_title: null,
            consent_description: null,
            consent_accept: null,
            consent_decline: null,
        },
    ];

    const mockDraft = {
        id: 1,
        slug: 'test-study',
        title: 'Test',
        state: 'draft',
        grid_config: [],
        presort_config: {},
        postsort_config: {},
        translations: mockTranslations,
        statements: [],
    };

    beforeEach(() => {
        // Reset store and set mock draft
        useStudyDesigner.getState().resetDraft();
        useStudyDesigner.setState({
            // biome-ignore lint/suspicious/noExplicitAny: test mock data
            draft: mockDraft as any,
            activeLocale: 'en',
        });
    });

    describe('Content Editing', () => {
        it('displays current translation content', () => {
            renderWithProviders(<IntroductionEditor />);

            expect(screen.getByDisplayValue('Test Study Title')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Test Subtitle')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Test Objective')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Test Instructions')).toBeInTheDocument();
        });

        it('updates title field', async () => {
            const user = userEvent.setup();
            renderWithProviders(<IntroductionEditor />);

            const titleInput = screen.getByRole('textbox', {
                name: /admin.design.intro.fields.title$/i,
            });
            await user.clear(titleInput);
            await user.type(titleInput, 'Updated Title');

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const translation = draft?.translations?.find((t) => t.language_code === 'en');
                expect(translation?.title).toBe('Updated Title');
            });
        });

        it('updates subtitle field', async () => {
            const user = userEvent.setup();
            renderWithProviders(<IntroductionEditor />);

            const subtitleInput = screen.getByRole('textbox', {
                name: /admin.design.intro.fields.subtitle$/i,
            });
            await user.clear(subtitleInput);
            await user.type(subtitleInput, 'Updated Subtitle');

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const translation = draft?.translations?.find((t) => t.language_code === 'en');
                expect(translation?.subtitle).toBe('Updated Subtitle');
            });
        });

        it('updates objective field with markdown', async () => {
            const user = userEvent.setup();
            renderWithProviders(<IntroductionEditor />);

            const objectiveEditor = screen.getByLabelText(/objective/i);
            await user.clear(objectiveEditor);
            await user.type(objectiveEditor, '**Bold** objective');

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const translation = draft?.translations?.find((t) => t.language_code === 'en');
                expect(translation?.objective).toBe('**Bold** objective');
            });
        });

        it('updates instructions field with markdown', async () => {
            const user = userEvent.setup();
            renderWithProviders(<IntroductionEditor />);

            const instructionsEditor = screen.getByLabelText(
                'admin.design.intro.fields.task_overview'
            );
            await user.clear(instructionsEditor);
            await user.type(instructionsEditor, '_Italic_ instructions');

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const translation = draft?.translations?.find((t) => t.language_code === 'en');
                expect(translation?.instructions).toBe('_Italic_ instructions');
            });
        });

        it('handles empty values gracefully', () => {
            useStudyDesigner.setState({
                draft: {
                    ...mockDraft,
                    translations: [
                        {
                            language_code: 'en',
                            title: '',
                            subtitle: '',
                            objective: '',
                            instructions: '',
                        },
                    ],
                    // biome-ignore lint/suspicious/noExplicitAny: test mock data
                } as any,
            });

            renderWithProviders(<IntroductionEditor />);

            // Should render empty inputs without crashing
            const titleInput = screen.getByRole('textbox', {
                name: /admin.design.intro.fields.title$/i,
            });
            expect(titleInput).toHaveValue('');
        });
    });

    describe('Translation Management', () => {
        it('shows content for active locale', () => {
            useStudyDesigner.setState({ activeLocale: 'en' });
            renderWithProviders(<IntroductionEditor />);

            expect(screen.getByDisplayValue('Test Study Title')).toBeInTheDocument();
        });

        it('switches content when locale changes', () => {
            const { rerender } = renderWithProviders(<IntroductionEditor />);

            // Initially English
            expect(screen.getByDisplayValue('Test Study Title')).toBeInTheDocument();

            // Switch to French
            useStudyDesigner.setState({ activeLocale: 'fr' });
            rerender(<IntroductionEditor />);

            expect(screen.getByDisplayValue('Titre du test')).toBeInTheDocument();
        });

        it('updates correct translation when editing', async () => {
            const user = userEvent.setup();

            // Start with French
            useStudyDesigner.setState({ activeLocale: 'fr' });
            renderWithProviders(<IntroductionEditor />);

            const titleInput = screen.getByRole('textbox', {
                name: /admin.design.intro.fields.title$/i,
            });
            await user.clear(titleInput);
            await user.type(titleInput, 'Nouveau titre');

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const frTranslation = draft?.translations?.find((t) => t.language_code === 'fr');
                const enTranslation = draft?.translations?.find((t) => t.language_code === 'en');

                // French translation updated
                expect(frTranslation?.title).toBe('Nouveau titre');
                // English translation unchanged
                expect(enTranslation?.title).toBe('Test Study Title');
            });
        });

        it('handles missing translation for locale', () => {
            useStudyDesigner.setState({
                draft: {
                    ...mockDraft,
                    translations: [mockTranslations[0]], // Only English
                    // biome-ignore lint/suspicious/noExplicitAny: test mock data
                } as any,
                activeLocale: 'fi', // Finnish not available
            });

            renderWithProviders(<IntroductionEditor />);

            // Should render with empty fields
            const titleInput = screen.getByRole('textbox', {
                name: /admin.design.intro.fields.title$/i,
            });
            expect(titleInput).toHaveValue('');
        });
    });

    describe('Consent Section', () => {
        it('shows consent toggle', () => {
            renderWithProviders(<IntroductionEditor />);

            const consentSwitch = screen.getByRole('switch', {
                name: 'admin.design.intro.consent_title',
            });
            expect(consentSwitch).toBeInTheDocument();
        });

        it('consent is initially disabled when fields are null', () => {
            renderWithProviders(<IntroductionEditor />);

            const consentSwitch = screen.getByRole('switch', {
                name: 'admin.design.intro.consent_title',
            });
            expect(consentSwitch).not.toBeChecked();
        });

        it('enables consent section when toggled', async () => {
            const user = userEvent.setup();
            renderWithProviders(<IntroductionEditor />);

            const consentSwitch = screen.getByRole('switch', {
                name: 'admin.design.intro.consent_title',
            });
            await user.click(consentSwitch);

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const translation = draft?.translations?.find((t) => t.language_code === 'en');

                // Consent fields should be populated with defaults
                expect(translation?.consent_title).toBeTruthy();
                expect(translation?.consent_description).toBeTruthy();
            });
        });

        it('disables consent section when toggled off', async () => {
            const user = userEvent.setup();

            // Start with consent enabled
            useStudyDesigner.setState({
                draft: {
                    ...mockDraft,
                    translations: [
                        {
                            ...mockTranslations[0],
                            consent_title: 'Consent Title',
                            consent_description: 'Consent Description',
                        },
                    ],
                    // biome-ignore lint/suspicious/noExplicitAny: test mock data
                } as any,
            });

            renderWithProviders(<IntroductionEditor />);

            const consentSwitch = screen.getByRole('switch', {
                name: 'admin.design.intro.consent_title',
            });
            expect(consentSwitch).toBeChecked();

            await user.click(consentSwitch);

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const translation = draft?.translations?.find((t) => t.language_code === 'en');

                // Consent fields should be null
                expect(translation?.consent_title).toBeNull();
                expect(translation?.consent_description).toBeNull();
            });
        });

        it('displays consent fields when enabled', () => {
            useStudyDesigner.setState({
                draft: {
                    ...mockDraft,
                    translations: [
                        {
                            ...mockTranslations[0],
                            consent_title: 'Consent Title',
                            consent_description: 'Consent Description',
                        },
                    ],
                    // biome-ignore lint/suspicious/noExplicitAny: test mock data
                } as any,
            });

            renderWithProviders(<IntroductionEditor />);

            // IntroductionEditor only shows consent_title and consent_description
            // consent_accept and consent_decline are managed in InterfaceEditor
            expect(screen.getByDisplayValue('Consent Title')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Consent Description')).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('returns null when no draft is available', () => {
            useStudyDesigner.setState({ draft: null });

            const { container } = renderWithProviders(<IntroductionEditor />);
            expect(container).toBeEmptyDOMElement();
        });

        it('handles very long text content', async () => {
            const user = userEvent.setup();
            const longText = 'A'.repeat(100);

            renderWithProviders(<IntroductionEditor />);

            const titleInput = screen.getByRole('textbox', {
                name: /admin.design.intro.fields.title$/i,
            });
            await user.clear(titleInput);
            await user.type(titleInput, longText, { delay: 0 }); // No delay for long text

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const translation = draft?.translations?.find((t) => t.language_code === 'en');
                expect(translation?.title).toBe(longText);
            });
        });

        it('handles special characters in text', async () => {
            const user = userEvent.setup();
            const specialText = '<script>alert("XSS")</script>';

            renderWithProviders(<IntroductionEditor />);

            const titleInput = screen.getByRole('textbox', {
                name: /admin.design.intro.fields.title$/i,
            });
            await user.clear(titleInput);
            await user.type(titleInput, specialText);

            await waitFor(() => {
                const draft = useStudyDesigner.getState().draft;
                const translation = draft?.translations?.find((t) => t.language_code === 'en');
                expect(translation?.title).toBe(specialText);
            });
        });
    });

    describe('UI Labels', () => {
        it('displays section titles', () => {
            renderWithProviders(<IntroductionEditor />);

            // Check for key translation keys that appear in section headers
            expect(screen.getByText('admin.design.intro.welcome_title')).toBeInTheDocument();
            expect(screen.getByText('admin.design.intro.process_title')).toBeInTheDocument();
            expect(screen.getByText('admin.design.intro.consent_title')).toBeInTheDocument();
        });
    });
});
