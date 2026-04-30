import { screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { ProcessStepEditor } from './ProcessStepEditor';
import { useStudyDesigner } from '@/store/useStudyDesigner';

// Build a minimal draft with the given list of process steps.
// biome-ignore lint/suspicious/noExplicitAny: convenient partial mock for the StudyUpdate draft
const buildDraft = (
    // biome-ignore lint/suspicious/noExplicitAny: minimal step shape for tests
    steps: any[],
    overrides: Record<string, unknown> = {}
    // biome-ignore lint/suspicious/noExplicitAny: convenient partial mock
): any => ({
    slug: 'test-study',
    state: 'draft',
    default_language: 'en',
    rough_sort_enabled: true,
    presort_config: { enabled: true, fields: {} },
    translations: [
        {
            language_code: 'en',
            title: 'Test Study',
            subtitle: '',
            objective: '',
            instructions: '',
            process_steps: steps,
        },
    ],
    ...overrides,
});

const profileStep = {
    id: 'profile',
    title: "Let's meet",
    description: 'Pre-sort survey',
    icon: 'Hand',
};

const roughStep = {
    id: 'rough',
    title: 'First impressions',
    description: 'Rough triage',
    icon: 'Hand',
};

const otherStep = {
    id: 'step_custom_1',
    title: 'Custom step',
    description: 'Some custom phase',
    icon: 'Circle',
};

describe('ProcessStepEditor — inconsistent feature flags banner', () => {
    it('renders the banner when rough_sort_enabled is false and a rough step exists', () => {
        const draft = buildDraft([otherStep, roughStep], { rough_sort_enabled: false });
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });

        const banner = screen.getByTestId('process-steps-inconsistent-banner');
        expect(banner).toBeInTheDocument();
        expect(banner).toHaveTextContent(/rough sort|rough_sort_disabled|First impressions/i);
    });

    it('renders the banner when presort is disabled and a profile step exists', () => {
        const draft = buildDraft([profileStep, otherStep], {
            presort_config: { enabled: false, fields: {} },
        });
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });

        const banner = screen.getByTestId('process-steps-inconsistent-banner');
        expect(banner).toBeInTheDocument();
        expect(banner).toHaveTextContent(/pre-?sort|Let's meet/i);
    });

    it('hides the banner when no inconsistencies exist', () => {
        const draft = buildDraft([profileStep, roughStep, otherStep]);
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });

        expect(screen.queryByTestId('process-steps-inconsistent-banner')).not.toBeInTheDocument();
    });

    it('removes the offending entry when Remove is clicked (rough)', async () => {
        const user = userEvent.setup();
        const draft = buildDraft([otherStep, roughStep], { rough_sort_enabled: false });
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });

        const banner = screen.getByTestId('process-steps-inconsistent-banner');
        const removeBtn = within(banner).getByRole('button', { name: /remove/i });
        await user.click(removeBtn);

        // Banner should be gone after removal.
        expect(screen.queryByTestId('process-steps-inconsistent-banner')).not.toBeInTheDocument();

        // Store should no longer contain the rough step.
        const state = useStudyDesigner.getState();
        const ids = state.draft?.translations?.[0].process_steps?.map((s) => s.id) ?? [];
        expect(ids).not.toContain('rough');
        expect(ids).toContain('step_custom_1');
    });

    it('removes the offending entry when Remove is clicked (profile)', async () => {
        const user = userEvent.setup();
        const draft = buildDraft([profileStep, otherStep], {
            presort_config: { enabled: false, fields: {} },
        });
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });

        const banner = screen.getByTestId('process-steps-inconsistent-banner');
        const removeBtn = within(banner).getByRole('button', { name: /remove/i });
        await user.click(removeBtn);

        expect(screen.queryByTestId('process-steps-inconsistent-banner')).not.toBeInTheDocument();

        const state = useStudyDesigner.getState();
        const ids = state.draft?.translations?.[0].process_steps?.map((s) => s.id) ?? [];
        expect(ids).not.toContain('profile');
        expect(ids).toContain('step_custom_1');
    });

    it('shows two banner items when both inconsistencies exist simultaneously', () => {
        const draft = buildDraft([profileStep, roughStep, otherStep], {
            rough_sort_enabled: false,
            presort_config: { enabled: false, fields: {} },
        });
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });

        const banner = screen.getByTestId('process-steps-inconsistent-banner');
        const items = within(banner).getAllByTestId('process-steps-inconsistent-item');
        expect(items).toHaveLength(2);
    });
});
