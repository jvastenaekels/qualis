import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PostSortConfigEditor from './PostSortConfigEditor';
import { useStudyDesigner } from '@/store/useStudyDesigner';

vi.mock('@/store/useStudyDesigner', () => ({
    useStudyDesigner: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'admin.design.postsort.extreme.title': 'Extreme columns',
                'admin.design.postsort.extreme.desc': 'Select columns for follow-up',
                'admin.design.postsort.random_comments.title': 'Allow random comments',
                'admin.design.postsort.random_comments.desc': 'Let participants comment',
                'admin.design.postsort.custom.title': 'Custom questions',
                'admin.design.postsort.custom.desc': 'Add custom questions',
                'admin.design.postsort.missing.title': 'Ask about missing statements',
                'admin.design.postsort.missing.desc': 'Ask if topics were missing',
                'admin.design.postsort.general.title': 'Ask for general feedback',
                'admin.design.postsort.general.desc': 'General comments at the end',
                'admin.design.postsort.email.title': 'Email Collection',
                'admin.design.postsort.email.desc': 'Collect emails',
                'admin.design.postsort.email.interview': 'Interview Consent',
                'admin.design.postsort.email.results': 'Results Consent',
            };
            return translations[key] || key;
        },
    }),
}));

describe('PostSortConfigEditor - Email Collection Feature', () => {
    const mockUpdateDraft = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders email collection toggle', () => {
        const draft = {
            postsort_config: {},
            grid_config: [],
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<PostSortConfigEditor />);

        expect(screen.getByText('Email Collection')).toBeInTheDocument();
    });

    it('shows sub-toggles when email collection is enabled', () => {
        const draft = {
            postsort_config: {
                email_collection_enabled: true,
            },
            grid_config: [],
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<PostSortConfigEditor />);

        expect(screen.getByText('Interview Consent')).toBeInTheDocument();
        expect(screen.getByText('Results Consent')).toBeInTheDocument();
    });

    it('hides sub-toggles when email collection is disabled', () => {
        const draft = {
            postsort_config: {
                email_collection_enabled: false,
            },
            grid_config: [],
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<PostSortConfigEditor />);

        expect(screen.queryByText('Interview Consent')).not.toBeInTheDocument();
        expect(screen.queryByText('Results Consent')).not.toBeInTheDocument();
    });

    it('toggles email_collection_enabled with defensive check', () => {
        const draft = {
            postsort_config: {
                email_collection_enabled: false,
            },
            grid_config: [],
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<PostSortConfigEditor />);

        const switches = screen.getAllByRole('switch');
        const emailToggle = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Email Collection')
        );

        if (emailToggle) {
            fireEvent.click(emailToggle);

            expect(mockUpdateDraft).toHaveBeenCalled();
            const updateFn = mockUpdateDraft.mock.calls[0][0];
            const testDraft = { postsort_config: {} };
            updateFn(testDraft);

            // biome-ignore lint/suspicious/noExplicitAny: test assertion
            expect((testDraft.postsort_config as any).email_collection_enabled).toBe(true);
        }
    });

    it('prevents redundant updates with defensive check', () => {
        const draft = {
            postsort_config: {
                email_collection_enabled: true,
            },
            grid_config: [],
        };

        let callCount = 0;
        const countingUpdateDraft = vi.fn((fn) => {
            callCount++;
            fn(draft);
        });

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft,
            activeLocale: 'en',
            updateDraft: countingUpdateDraft,
        });

        const { rerender } = render(<PostSortConfigEditor />);

        // Re-render should not trigger update
        rerender(<PostSortConfigEditor />);

        // Update should only be called via user interaction, not on re-render
        expect(callCount).toBe(0);
    });

    it('defaults interview_consent_enabled to true when undefined', () => {
        const draft = {
            postsort_config: {
                email_collection_enabled: true,
                // interview_consent_enabled is undefined
            },
            grid_config: [],
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<PostSortConfigEditor />);

        const switches = screen.getAllByRole('switch');
        const interviewSwitch = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Interview Consent')
        );

        // Should be checked by default (via ?? true)
        expect(interviewSwitch).toHaveAttribute('data-state', 'checked');
    });

    it('defaults newsletter_consent_enabled to true when undefined', () => {
        const draft = {
            postsort_config: {
                email_collection_enabled: true,
                // newsletter_consent_enabled is undefined
            },
            grid_config: [],
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<PostSortConfigEditor />);

        const switches = screen.getAllByRole('switch');
        const newsletterSwitch = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Results Consent')
        );

        // Should be checked by default (via ?? true)
        expect(newsletterSwitch).toHaveAttribute('data-state', 'checked');
    });

    it('toggles interview_consent_enabled correctly', () => {
        const draft = {
            postsort_config: {
                email_collection_enabled: true,
                interview_consent_enabled: true,
            },
            grid_config: [],
        };

        // biome-ignore lint/suspicious/noExplicitAny: mock
        (useStudyDesigner as any).mockReturnValue({
            draft,
            activeLocale: 'en',
            updateDraft: mockUpdateDraft,
        });

        render(<PostSortConfigEditor />);

        const switches = screen.getAllByRole('switch');
        const interviewSwitch = switches.find((s) =>
            s.closest('.flex')?.textContent?.includes('Interview Consent')
        );

        if (interviewSwitch) {
            fireEvent.click(interviewSwitch);

            expect(mockUpdateDraft).toHaveBeenCalled();
            const updateFn = mockUpdateDraft.mock.calls[0][0];
            const testDraft = { postsort_config: { interview_consent_enabled: true } };
            updateFn(testDraft);

            // biome-ignore lint/suspicious/noExplicitAny: test assertion
            expect((testDraft.postsort_config as any).interview_consent_enabled).toBe(false);
        }
    });
});
