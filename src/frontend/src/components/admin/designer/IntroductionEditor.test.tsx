import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import IntroductionEditor from './IntroductionEditor';

describe('IntroductionEditor — Wave B progressive disclosure', () => {
    // biome-ignore lint/suspicious/noExplicitAny: convenient partial mock
    const mockDraft: any = {
        slug: 'test-study',
        state: 'draft',
        default_language: 'en',
        translations: [
            {
                language_code: 'en',
                title: 'Test Study',
                subtitle: '',
                objective: '',
                instructions: '',
                consent_title: 'Informed consent',
                consent_description: 'Consent body',
                process_steps: [
                    {
                        id: 'step-1',
                        title: 'Welcome',
                        description: 'A short description that should preview',
                        icon: 'Hand',
                    },
                ],
            },
        ],
    };

    const renderEditor = () =>
        renderWithStore(<IntroductionEditor />, {
            initialState: { draft: mockDraft, activeLocale: 'en' },
        });

    it('renders Présentation expanded by default and other sections collapsed (B1)', () => {
        renderEditor();

        // Présentation section content visible (Title input pre-filled with mock title)
        expect(screen.getByDisplayValue('Test Study')).toBeInTheDocument();

        // Closed-by-default consent section: the consent_title input value
        // ('Informed consent') is gated by the accordion and should not be in the DOM.
        expect(screen.queryByDisplayValue('Informed consent')).not.toBeInTheDocument();
    });

    it('expands a collapsed section when its trigger is clicked (B1)', async () => {
        const user = userEvent.setup();
        renderEditor();

        // The consent accordion trigger exists and starts closed.
        // Label is the i18n section title (admin.design.intro.consent_title),
        // not the per-translation consent_title field on the draft.
        const consentTrigger = screen.getByRole('button', {
            name: /Consent form|Formulaire de consentement/i,
        });
        expect(consentTrigger).toHaveAttribute('data-state', 'closed');

        await user.click(consentTrigger);
        expect(consentTrigger).toHaveAttribute('data-state', 'open');

        // Once open, the gated consent_title input becomes visible.
        expect(screen.getByDisplayValue('Informed consent')).toBeInTheDocument();
    });
});

describe('IntroductionEditor — field accessible names (Task 6.7b)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: convenient partial mock
    const mockDraft: any = {
        slug: 'test-study',
        state: 'draft',
        default_language: 'en',
        translations: [
            {
                language_code: 'en',
                title: 'Test Study',
                subtitle: '',
                objective: '',
                instructions: '',
                consent_title: 'Informed consent',
                consent_description: 'Consent body',
                process_steps: [
                    {
                        id: 'step-1',
                        title: 'Welcome',
                        description: 'A short description that should preview',
                        icon: 'Hand',
                    },
                ],
            },
        ],
    };

    const renderEditor = () =>
        renderWithStore(<IntroductionEditor />, {
            initialState: { draft: mockDraft, activeLocale: 'en' },
        });

    it('names the "Default language" select and lets its label open it', async () => {
        const user = userEvent.setup();
        renderEditor();

        // The trigger's own content is the selected language's code ("EN");
        // pairing the Label overrides that with the field's purpose.
        const trigger = screen.getByRole('combobox', { name: /default language/i });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');

        await user.click(screen.getByText('Default language'));
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('names the "Study objective" markdown field and lets its label focus it', async () => {
        const user = userEvent.setup();
        renderEditor();

        // MarkdownEditor's id lives on a <textarea> it renders internally
        // (a separate component/file); the pairing is still a real DOM
        // htmlFor/id match once rendered, which this focus assertion proves.
        const field = screen.getByRole('textbox', { name: /study objective/i });
        await user.click(screen.getByText('Study objective'));
        expect(field).toHaveFocus();
    });

    it('names the "Study steps overview" (task overview) markdown field', async () => {
        const user = userEvent.setup();
        renderEditor();

        const processTrigger = screen.getByRole('button', {
            name: /Study steps overview|Aperçu des étapes de l'étude/i,
        });
        await user.click(processTrigger);

        const field = await screen.findByRole('textbox', { name: /^introduction$/i });
        await user.click(screen.getByText('Introduction'));
        expect(field).toHaveFocus();
    });

    it('names the "Legal text / agreement" (consent description) markdown field', async () => {
        const user = userEvent.setup();
        renderEditor();

        const consentTrigger = screen.getByRole('button', {
            name: /Consent form|Formulaire de consentement/i,
        });
        await user.click(consentTrigger);

        const field = await screen.findByRole('textbox', { name: /legal text \/ agreement/i });
        await user.click(screen.getByText('Legal text / agreement'));
        expect(field).toHaveFocus();
    });
});
