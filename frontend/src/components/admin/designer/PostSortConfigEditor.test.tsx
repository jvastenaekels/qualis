import { screen, fireEvent } from '@testing-library/react';
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

    it('renders email collection toggle', () => {
        renderEditor({ draft: { postsort_config: {}, grid_config: [] } });

        expect(screen.getByText('Participant Follow-up')).toBeInTheDocument();
    });

    it('shows sub-toggles when email collection is enabled', () => {
        renderEditor({
            draft: {
                postsort_config: { email_collection_enabled: true },
                grid_config: [],
            },
        });

        expect(screen.getByText('Offer follow-up interview')).toBeInTheDocument();
        expect(
            screen.getByText('Offer to subscribe to a mailing list about study outcomes')
        ).toBeInTheDocument();
    });

    it('hides sub-toggles when email collection is disabled', () => {
        renderEditor({
            draft: {
                postsort_config: { email_collection_enabled: false },
                grid_config: [],
            },
        });

        expect(screen.queryByText('Offer follow-up interview')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Offer to subscribe to a mailing list about study outcomes')
        ).not.toBeInTheDocument();
    });

    it('toggles email_collection_enabled with defensive check', () => {
        renderEditor({
            draft: {
                postsort_config: { email_collection_enabled: false },
                grid_config: [],
            },
        });

        const switches = screen.getAllByRole('switch');
        const emailToggle = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Participant Follow-up')
        );

        expect(emailToggle).toBeDefined();

        if (emailToggle) {
            fireEvent.click(emailToggle);

            // Access store to verify
            // biome-ignore lint/suspicious/noExplicitAny: access internal structure
            const currentDraft: any = useStudyDesigner.getState().draft;
            expect(currentDraft.postsort_config.email_collection_enabled).toBe(true);
        }
    });

    it('defaults interview_consent_enabled to true when undefined', () => {
        renderEditor({
            draft: {
                postsort_config: {
                    email_collection_enabled: true,
                    // undefined interview_consent_enabled
                },
                grid_config: [],
            },
        });

        const switches = screen.getAllByRole('switch');
        const interviewSwitch = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Offer follow-up interview')
        );

        expect(interviewSwitch).toHaveAttribute('data-state', 'checked');
    });

    it('defaults newsletter_consent_enabled to true when undefined', () => {
        renderEditor({
            draft: {
                postsort_config: {
                    email_collection_enabled: true,
                    // undefined newsletter_consent_enabled
                },
                grid_config: [],
            },
        });

        const switches = screen.getAllByRole('switch');
        const newsletterSwitch = switches.find((s) =>
            s
                .closest('.flex')
                ?.textContent?.includes('Offer to subscribe to a mailing list about study outcomes')
        );

        expect(newsletterSwitch).toHaveAttribute('data-state', 'checked');
    });

    it('toggles interview_consent_enabled correctly', () => {
        renderEditor({
            draft: {
                postsort_config: {
                    email_collection_enabled: true,
                    interview_consent_enabled: true,
                },
                grid_config: [],
            },
        });

        const switches = screen.getAllByRole('switch');
        const interviewSwitch = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Offer follow-up interview')
        );

        if (interviewSwitch) {
            fireEvent.click(interviewSwitch);

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

        const positiveLabel = screen.getByText(/Prompt for extreme cards \(\+\)/);
        const negativeLabel = screen.getByText(/Prompt for extreme cards \(-\)/);

        expect(positiveLabel).toBeInTheDocument();
        expect(negativeLabel).toBeInTheDocument();
    });

    it('updates specific prompt values in store', () => {
        renderEditor({
            draft: {
                postsort_config: { extreme_columns: [-2, 2] },
            },
        });

        const positiveInput = screen.getByLabelText(/Prompt for extreme cards \(\+\)/);
        const negativeInput = screen.getByLabelText(/Prompt for extreme cards \(-\)/);

        fireEvent.change(positiveInput, { target: { value: 'Why do you agree?' } });
        fireEvent.change(negativeInput, { target: { value: 'Why do you disagree?' } });

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

        expect(screen.getByText(/Prompt for extreme cards \(\+\)/)).toBeInTheDocument();
        expect(screen.queryByText(/Prompt for extreme cards \(-\)/)).not.toBeInTheDocument();
    });
});
