import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import PostSortConfigEditor from './PostSortConfigEditor';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { useStudyDesigner } from '@/store/useStudyDesigner';

// Mocks removed to use real i18n

describe('PostSortConfigEditor - Email Collection Feature', () => {
    // biome-ignore lint/suspicious/noExplicitAny: weak typing
    const renderEditor = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test',
            state: 'draft',
            postsort_config: {},
            ...(initialStateOverrides.draft || {}),
        };

        return renderWithStore(<PostSortConfigEditor />, {
            initialState: {
                ...initialStateOverrides,
                draft: mergedDraft,
                activeLocale: 'en',
            },
        });
    };

    // biome-ignore lint/suspicious/noExplicitAny: testing user utilities mock
    const switchToStep2 = async (user: any) => {
        await user.click(screen.getByText('Step 2: Questions'));
        await screen.findByText('Participant Follow-up');
    };

    it('renders email collection toggle', async () => {
        const user = userEvent.setup();
        renderEditor({ draft: { postsort_config: {}, grid_config: [] } });
        await switchToStep2(user);

        expect(screen.getByText('Participant Follow-up')).toBeInTheDocument();
    });

    it('shows sub-toggles when email collection is enabled', async () => {
        const user = userEvent.setup();
        renderEditor({
            draft: {
                postsort_config: { email_collection_enabled: true },
                grid_config: [],
            },
        });
        await switchToStep2(user);

        expect(screen.getByText('Offer follow-up')).toBeInTheDocument();
        expect(
            screen.getByText('Offer to subscribe to a mailing list about study outcomes')
        ).toBeInTheDocument();
    });

    it('hides sub-toggles when email collection is disabled', async () => {
        const user = userEvent.setup();
        renderEditor({
            draft: {
                postsort_config: { email_collection_enabled: false },
                grid_config: [],
            },
        });
        await switchToStep2(user);

        expect(screen.queryByText('Offer follow-up')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Offer to subscribe to a mailing list about study outcomes')
        ).not.toBeInTheDocument();
    });

    it('toggles email_collection_enabled with defensive check', async () => {
        const user = userEvent.setup();
        renderEditor({
            draft: {
                postsort_config: { email_collection_enabled: false },
                grid_config: [],
            },
        });
        await switchToStep2(user);

        const switches = screen.getAllByRole('switch');
        const emailToggle = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Participant Follow-up')
        );

        expect(emailToggle).toBeDefined();

        if (emailToggle) {
            await user.click(emailToggle);

            // Access store to verify
            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            // biome-ignore lint/suspicious/noExplicitAny: complex config
            expect((currentDraft.postsort_config as any).email_collection_enabled).toBe(true);
        }
    });

    it('defaults interview_consent_enabled to true when undefined', async () => {
        const user = userEvent.setup();
        renderEditor({
            draft: {
                postsort_config: {
                    email_collection_enabled: true,
                    // undefined interview_consent_enabled
                },
                grid_config: [],
            },
        });
        await switchToStep2(user);

        const switches = screen.getAllByRole('switch');
        const interviewSwitch = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Offer follow-up')
        );

        expect(interviewSwitch).toHaveAttribute('data-state', 'checked');
    });

    it('defaults newsletter_consent_enabled to true when undefined', async () => {
        const user = userEvent.setup();
        renderEditor({
            draft: {
                postsort_config: {
                    email_collection_enabled: true,
                    // undefined newsletter_consent_enabled
                },
                grid_config: [],
            },
        });
        await switchToStep2(user);

        const switches = screen.getAllByRole('switch');
        const newsletterSwitch = switches.find((s) =>
            s
                .closest('.flex')
                ?.textContent?.includes('Offer to subscribe to a mailing list about study outcomes')
        );

        expect(newsletterSwitch).toHaveAttribute('data-state', 'checked');
    });

    it('toggles interview_consent_enabled correctly', async () => {
        const user = userEvent.setup();
        renderEditor({
            draft: {
                postsort_config: {
                    email_collection_enabled: true,
                    interview_consent_enabled: true,
                },
                grid_config: [],
            },
        });
        await switchToStep2(user);

        const switches = screen.getAllByRole('switch');
        const interviewSwitch = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Offer follow-up')
        );

        if (interviewSwitch) {
            await user.click(interviewSwitch);

            // Check store
            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            expect(currentDraft.postsort_config.interview_consent_enabled).toBe(false);
        }
    });
});

describe('PostSortConfigEditor - Extreme Columns Prompts', () => {
    // biome-ignore lint/suspicious/noExplicitAny: weak typing
    const renderEditor = (initialStateOverrides: any = {}) => {
        const mergedDraft = {
            slug: 'test',
            state: 'draft',
            postsort_config: {},
            grid_config: [
                { score: -2, capacity: 1 },
                { score: -1, capacity: 2 },
                { score: 0, capacity: 3 },
                { score: 1, capacity: 2 },
                { score: 2, capacity: 1 },
            ],
            ...(initialStateOverrides.draft || {}),
        };

        return renderWithStore(<PostSortConfigEditor />, {
            initialState: {
                ...initialStateOverrides,
                draft: mergedDraft,
                activeLocale: 'en',
            },
        });
    };

    it('shows distinct prompts for positive and negative columns', () => {
        renderEditor({
            draft: {
                postsort_config: { extreme_columns: [-2, 2] },
            },
        });

        const positiveLabel = screen.getByText(/Prompt for statements \(\+\)/);
        const negativeLabel = screen.getByText(/Prompt for statements \(-\)/);

        expect(positiveLabel).toBeInTheDocument();
        expect(negativeLabel).toBeInTheDocument();
    });

    it('updates specific prompt values in store', () => {
        renderEditor({
            draft: {
                postsort_config: { extreme_columns: [-2, 2] },
            },
        });

        const positiveInput = screen.getByLabelText(/Prompt for statements \(\+\)/);
        const negativeInput = screen.getByLabelText(/Prompt for statements \(-\)/);

        fireEvent.change(positiveInput, { target: { value: 'Why do you agree?' } });
        fireEvent.change(negativeInput, {
            target: { value: 'Why do you disagree?' },
        });

        // biome-ignore lint/suspicious/noExplicitAny: access internal structure
        const currentDraft: any = useStudyDesigner.getState().draft;
        expect(currentDraft.postsort_config.prompts.extreme_positive.en).toBe('Why do you agree?');
        expect(currentDraft.postsort_config.prompts.extreme_negative.en).toBe(
            'Why do you disagree?'
        );
    });

    it('shows only positive prompt if only positive extreme column selected', () => {
        renderEditor({
            draft: {
                postsort_config: { extreme_columns: [2] },
            },
        });

        expect(screen.getByText(/Prompt for statements \(\+\)/)).toBeInTheDocument();
        expect(screen.queryByText(/Prompt for statements \(-\)/)).not.toBeInTheDocument();
    });
});
