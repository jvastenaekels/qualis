import { screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { ProcessStepEditor } from './ProcessStepEditor';
import { useStudyDesigner } from '@/store/useStudyDesigner';

// Build a minimal draft with the given list of process steps.
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

describe('ProcessStepEditor — cross-locale step addressing (audit D2)', () => {
    it('deletes a step by id from every locale even when locale orders diverge', async () => {
        const user = userEvent.setup();
        // en (active): [custom, rough]; fr: [rough, custom] — same ids, divergent
        // order. The structural-sync effect is order-insensitive, so the
        // divergence persists. rough_sort_enabled:false surfaces the banner whose
        // Remove button calls deleteStep(activeLocaleIndex). With the old
        // index-based splice, fr would lose the WRONG step.
        const draft = {
            slug: 'test-study',
            state: 'draft',
            default_language: 'en',
            rough_sort_enabled: false,
            presort_config: { enabled: true, fields: {} },
            translations: [
                {
                    language_code: 'en',
                    title: 'EN',
                    process_steps: [
                        {
                            id: 'step_custom_1',
                            title: 'Custom EN',
                            description: '',
                            icon: 'Circle',
                        },
                        { id: 'rough', title: 'Rough EN', description: '', icon: 'Hand' },
                    ],
                },
                {
                    language_code: 'fr',
                    title: 'FR',
                    process_steps: [
                        { id: 'rough', title: 'Rough FR', description: '', icon: 'Hand' },
                        {
                            id: 'step_custom_1',
                            title: 'Custom FR',
                            description: '',
                            icon: 'Circle',
                        },
                    ],
                },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: minimal draft mock
        } as any;

        renderWithStore(<ProcessStepEditor />, { initialState: { draft, activeLocale: 'en' } });

        const banner = screen.getByTestId('process-steps-inconsistent-banner');
        await user.click(within(banner).getByRole('button', { name: /remove/i }));

        const translations = useStudyDesigner.getState().draft?.translations ?? [];
        const byLang = (lang: string) =>
            (translations.find((t) => t.language_code === lang)?.process_steps ?? []).map(
                (s) => s.id
            );

        // 'rough' removed from BOTH locales, 'step_custom_1' survives in both.
        expect(byLang('en')).toEqual(['step_custom_1']);
        expect(byLang('fr')).toEqual(['step_custom_1']);
    });
});

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

describe('ProcessStepEditor — step field accessible names (Task 6.7b)', () => {
    const expandTheOneStep = async (user: ReturnType<typeof userEvent.setup>) => {
        const draft = buildDraft([otherStep]);
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });
        await user.click(screen.getByRole('button', { name: /toggle/i }));
    };

    it('names the "Step title" field and lets its label focus it', async () => {
        const user = userEvent.setup();
        await expandTheOneStep(user);

        const field = await screen.findByRole('textbox', { name: /^step title$/i });
        await user.click(screen.getByText('Step title'));
        expect(field).toHaveFocus();
    });

    it('names the "Short description" and "Color" fields', async () => {
        const user = userEvent.setup();
        await expandTheOneStep(user);

        expect(
            await screen.findByRole('textbox', { name: /^short description$/i })
        ).toBeInTheDocument();
        // The color swatch <input type="color"> has no ARIA role in jsdom, so
        // getByLabelText (which also resolves via htmlFor/id) stands in for
        // getByRole here — same as the datetime-local case elsewhere in 6.7b.
        expect(screen.getByLabelText('Color')).toBeInTheDocument();
    });

    it('renders "Icon" as plain text heading a real, named group of icon buttons (Task 6.7b fix round 1)', async () => {
        const user = userEvent.setup();
        await expandTheOneStep(user);

        const heading = await screen.findByText('Icon');
        expect(heading.tagName).not.toBe('LABEL');

        // IconPicker's root carries role="group" aria-labelledby={heading.id} —
        // getByRole computes the group's real accessible name from that
        // association, not from the heading merely sitting nearby in the DOM.
        expect(screen.getByRole('group', { name: 'Icon' })).toBeInTheDocument();

        // Each button is named via a translated word ("Person"), not the raw
        // lucide identifier ("User") the component key uses internally —
        // getByRole with the identifier would now fail to resolve.
        expect(screen.getByRole('button', { name: 'Person' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'User' })).not.toBeInTheDocument();
    });
});

describe('ProcessStepEditor — delete-step control name (Task 6.7c)', () => {
    it('discriminates the delete button by each step’s own title', () => {
        const draft = buildDraft([profileStep, roughStep]);
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });

        expect(screen.getByRole('button', { name: "Delete Let's meet" })).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Delete First impressions' })
        ).toBeInTheDocument();
    });

    it('falls back to the step id when the step has no title yet', () => {
        const untitledStep = { id: 'step_new_1', title: '', description: '', icon: 'Circle' };
        const draft = buildDraft([untitledStep]);
        renderWithStore(<ProcessStepEditor />, {
            initialState: { draft, activeLocale: 'en' },
        });

        expect(screen.getByRole('button', { name: 'Delete step_new_1' })).toBeInTheDocument();
    });
});
