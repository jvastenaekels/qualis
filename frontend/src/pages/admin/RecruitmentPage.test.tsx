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

import { fireEvent, renderHook } from '@testing-library/react';
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

/**
 * Builds the mocked useRecruitmentPage() return value from a given pair of
 * form instances. Split out from `baseApi` so callers that need the forms
 * mounted in the same render tree as RecruitmentPage (see the Task 6.6
 * Harness below) can supply their own instead of getting ones from an
 * unrelated `renderHook()` tree.
 */
function baseApiFromForms(
    forms: {
        slugForm?: RecruitmentPageApi['slugForm'];
        accessForm: RecruitmentPageApi['accessForm'];
    },
    overrides: Partial<RecruitmentPageApi> = {}
): RecruitmentPageApi {
    return {
        slug: 'demo-study',
        navigate: vi.fn(),
        study: mockStudy,
        links: [],
        isSlugLocked: false,
        isArchived: false,
        studyUrl: 'https://example.com/study/demo-study',
        slugForm: forms.slugForm as RecruitmentPageApi['slugForm'],
        accessForm: forms.accessForm,
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

function baseApi(overrides: Partial<RecruitmentPageApi> = {}): RecruitmentPageApi {
    const { result } = renderHook(() => useTestForms());
    return baseApiFromForms(
        { slugForm: result.current.slugForm, accessForm: result.current.accessForm },
        overrides
    );
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

describe('RecruitmentPage — clear-date buttons track the watched form values (Task 6.6)', () => {
    // This guards the BEHAVIOUR (the clear button shows once a date is
    // entered and hides once it's cleared), not the MECHANISM. Vitest does
    // not run the React Compiler, so it can't reproduce the frozen-memo
    // defect itself: on plain (uncompiled) React, `accessForm.watch(...)`
    // called inline in JSX already re-renders correctly via react-hook-form's
    // own subscription — the freeze only appears once the compiler folds the
    // whole block into a memo keyed on `accessForm`/`isArchived`/
    // `showWindowPickers`/`t`. It can only be observed under a compiled
    // build — see task-6.4-6.8-report.md.
    //
    // DO NOT "simplify" the fix to `const startDate =
    // accessForm.watch('startDate')` in the component body. That was tried
    // and it does NOT work: `accessForm` is useRef-backed with stable
    // identity, so the compiler emits `if ($[0] !== accessForm)` around the
    // read and the value is computed once and reused forever — the identical
    // bug, one level up. `useWatch({control, name})` is a hook call the
    // compiler cannot fold into a memo guard, so the watched values become
    // cache keys for the block that renders the buttons. Rationale in full
    // at RecruitmentPage.tsx:103-116.
    //
    // This suite passes on BOTH the fixed and the unfixed source, so it will
    // not catch that regression. This comment is the only guard rail here.
    //
    // baseApi()'s accessForm comes from a `useForm()` mounted via a separate
    // `renderHook()` tree, so it never causes a re-render of RecruitmentPage
    // itself when a field changes (RHF's re-render subscription belongs to
    // whichever component *called* `useForm()`). This harness instead calls
    // useForm() from inside the very tree under test, so field changes
    // re-render RecruitmentPage the same way production's
    // useRecruitmentPage() (called directly inside RecruitmentPage) does.
    function Harness({ showWindowPickers }: { showWindowPickers: boolean }) {
        const { slugForm, accessForm } = useTestForms();
        mockUseRecruitmentPage.mockReturnValue(
            baseApiFromForms({ slugForm, accessForm }, { showWindowPickers })
        );
        return <RecruitmentPage />;
    }

    // `datetime-local` is a segmented widget jsdom doesn't drive well via
    // userEvent.type — fireEvent.change (the RTL-documented approach for
    // this input type) sets the value directly and still fires the same
    // React onChange that react-hook-form's `register` subscribes to.

    it('shows the clear button once a start date is entered, and hides it once cleared', async () => {
        renderWithProviders(<Harness showWindowPickers />);

        expect(screen.queryByRole('button', { name: /clear date/i })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Opens at'), {
            target: { value: '2026-08-01T10:00' },
        });
        expect(await screen.findByRole('button', { name: /clear date/i })).toBeVisible();

        fireEvent.change(screen.getByLabelText('Opens at'), { target: { value: '' } });
        expect(screen.queryByRole('button', { name: /clear date/i })).not.toBeInTheDocument();
    });

    it('shows the clear button once an end date is entered, and hides it once cleared', async () => {
        renderWithProviders(<Harness showWindowPickers />);

        fireEvent.change(screen.getByLabelText('Closes at'), {
            target: { value: '2026-08-15T10:00' },
        });
        expect(await screen.findByRole('button', { name: /clear date/i })).toBeVisible();

        fireEvent.change(screen.getByLabelText('Closes at'), { target: { value: '' } });
        expect(screen.queryByRole('button', { name: /clear date/i })).not.toBeInTheDocument();
    });
});
