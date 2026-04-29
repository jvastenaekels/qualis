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

        // Closed-by-default sections: their interior content should NOT be visible.
        // Consent title input ('Informed consent' value) is gated by the consent accordion
        expect(screen.queryByDisplayValue('Informed consent')).not.toBeInTheDocument();
        // Methodology memo accordion trigger exists but is closed
        const memoTrigger = screen.getByRole('button', {
            name: /Methodology memo|Mémo méthodologique/i,
        });
        expect(memoTrigger).toHaveAttribute('data-state', 'closed');
    });

    it('expands a collapsed section when its trigger is clicked (B1)', async () => {
        const user = userEvent.setup();
        renderEditor();

        // Click the Methodology memo accordion trigger
        const memoTrigger = screen.getByRole('button', {
            name: /Methodology memo|Mémo méthodologique/i,
        });
        await user.click(memoTrigger);

        // Trigger is now open (accordion expanded)
        expect(memoTrigger).toHaveAttribute('data-state', 'open');
    });
});
