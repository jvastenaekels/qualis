/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Accessibility regression test for RecruitmentPage's "Access rules" switches.
 *
 * The page's own JSX is what's under test — bypass useRecruitmentPage entirely
 * (same approach as ConcourseDetailPage.test.tsx) so the test controls the
 * study/form fixtures directly, with no query/router/API plumbing to fake out.
 */

import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import RecruitmentPage from './RecruitmentPage';
import type {
    AccessRulesValues,
    RecruitmentPageApi,
    SlugFormValues,
} from '@/hooks/admin/useRecruitmentPage';
import type { StudyRead } from '@/api/model';

const { mockUseRecruitmentPage } = vi.hoisted(() => ({
    mockUseRecruitmentPage: vi.fn(),
}));

vi.mock('@/hooks/admin/useRecruitmentPage', () => ({
    useRecruitmentPage: mockUseRecruitmentPage,
}));

const mockStudy: StudyRead = {
    id: 1,
    slug: 'demo-study',
    state: 'draft',
    requires_password: false,
    start_date: null,
    end_date: null,
} as unknown as StudyRead;

/** Real react-hook-form instances — the page reads .register/.watch/.getValues/.setValue directly. */
function useTestForms() {
    const slugForm = useForm<SlugFormValues>({ defaultValues: { slug: 'demo-study' } });
    const accessForm = useForm<AccessRulesValues>({
        defaultValues: { passwordEnabled: false, accessPassword: '', startDate: '', endDate: '' },
    });
    return { slugForm, accessForm };
}

function baseApi(overrides: Partial<RecruitmentPageApi> = {}): RecruitmentPageApi {
    const { result } = renderHook(() => useTestForms());
    return {
        slug: 'demo-study',
        navigate: vi.fn(),
        study: mockStudy,
        links: [],
        isSlugLocked: false,
        isArchived: false,
        studyUrl: 'https://example.com/study/demo-study',
        slugForm: result.current.slugForm,
        accessForm: result.current.accessForm,
        passwordEnabled: false,
        showWindowPickers: false,
        setShowWindowPickers: vi.fn(),
        onSlugSubmit: vi.fn(),
        onAccessRulesSubmit: vi.fn(),
        isCreateModalOpen: false,
        setIsCreateModalOpen: vi.fn(),
        handleCreateModalOpenChange: vi.fn(),
        newLinkType: 'public',
        setNewLinkType: vi.fn(),
        newLinkCount: 1,
        setNewLinkCount: vi.fn(),
        newLinkName: '',
        setNewLinkName: vi.fn(),
        isCreatingLink: false,
        isRevokingLink: false,
        handleCreate: vi.fn(),
        handleRevoke: vi.fn(),
        copyToClipboard: vi.fn(),
        getFullUrl: vi.fn((token: string) => `https://example.com/study/demo-study?token=${token}`),
        ...overrides,
    };
}

describe('RecruitmentPage — access rule switches (a11y)', () => {
    it('renders exactly two access-rule switches', () => {
        // Positive baseline: proves the assertions below fail (if they do)
        // because of the accessible NAME wiring, not because the switches
        // are missing from the DOM.
        mockUseRecruitmentPage.mockReturnValue(baseApi());
        renderWithProviders(<RecruitmentPage />);

        expect(screen.getAllByRole('switch')).toHaveLength(2);
    });

    it('gives the password switch an accessible name explicitly wired to its visible label', () => {
        mockUseRecruitmentPage.mockReturnValue(baseApi());
        renderWithProviders(<RecruitmentPage />);

        const passwordSwitch = screen.getByRole('switch', { name: /require a password/i });
        expect(passwordSwitch).toBeInTheDocument();
        // Discriminator: the sibling `<label htmlFor>` already resolves a
        // name above via HTML's implicit label-for-button association (this
        // holds in both jsdom and real Chromium — verified live, see
        // task-3.4-report.md), so the `getByRole(..., { name })` query above
        // passes even on the unfixed source and can't prove this fix. An
        // explicit aria-labelledby is what makes the name resolution robust
        // instead of dependent on that implicit, non-native-widget fallback
        // — and its presence is what actually fails pre-fix.
        expect(passwordSwitch).toHaveAttribute('aria-labelledby', 'password-toggle-label');
    });

    it('gives the collection-window switch an accessible name explicitly wired to its visible label', () => {
        mockUseRecruitmentPage.mockReturnValue(baseApi());
        renderWithProviders(<RecruitmentPage />);

        const windowSwitch = screen.getByRole('switch', { name: /limit collection window/i });
        expect(windowSwitch).toBeInTheDocument();
        expect(windowSwitch).toHaveAttribute('aria-labelledby', 'window-toggle-label');
    });
});

describe('RecruitmentPage — access-rule rows share one shape (Task 6.2)', () => {
    it('renders both access-rule rows with the same container treatment', () => {
        mockUseRecruitmentPage.mockReturnValue(baseApi());
        renderWithProviders(<RecruitmentPage />);

        const rows = screen.getAllByTestId('access-rule-row');
        expect(rows).toHaveLength(2);
        expect(rows[0].className).toBe(rows[1].className);
    });
});

describe('RecruitmentPage — group headings are real text, not dangling labels (Task 6.7b)', () => {
    // "Full URL" and "Collection window" head a read-only URL readout and a
    // pair of already-individually-labelled date fields, respectively —
    // neither is a single control a <Label htmlFor> could truthfully point
    // at. They were <Label> elements with no `for` target at all (a dangling
    // form label announced as pointing nowhere); the fix drops the <Label>
    // component for plain text, which this test confirms structurally.

    it('renders "Full URL" as plain text next to the read-only URL readout', () => {
        mockUseRecruitmentPage.mockReturnValue(baseApi());
        renderWithProviders(<RecruitmentPage />);

        const heading = screen.getByText('Full URL');
        expect(heading.tagName).not.toBe('LABEL');
        expect(screen.getByText('https://example.com/study/demo-study')).toBeInTheDocument();
    });

    it('renders "Collection window" as plain text, and still lets "Opens at" focus its input', async () => {
        const user = userEvent.setup();
        mockUseRecruitmentPage.mockReturnValue(baseApi({ showWindowPickers: true }));
        renderWithProviders(<RecruitmentPage />);

        const heading = screen.getByText('Collection window');
        expect(heading.tagName).not.toBe('LABEL');

        // The two date fields beneath the heading already carry their own
        // Label/htmlFor and are untouched by this fix — confirm the edit
        // above them didn't collateral-damage that real pairing. (A
        // `datetime-local` input has no ARIA role, so getByLabelText —
        // which also resolves via htmlFor/id — stands in for getByRole here.)
        const opensAt = screen.getByLabelText('Opens at');
        await user.click(screen.getByText('Opens at'));
        expect(opensAt).toHaveFocus();
    });
});
