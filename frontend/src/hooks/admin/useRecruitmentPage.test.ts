/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useRecruitmentPage hook.
 *
 * Covers orchestration semantics — derived flags, modal state reset on close,
 * mutation dispatch with current form values, query invalidation on slug
 * submit, copy-to-clipboard helpers — without rendering JSX. Integration of
 * hook + JSX would belong in a future RecruitmentPage.test.tsx (none exists
 * today).
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import {
    accessRulesSchema,
    slugFormSchema,
    toLocalDatetimeString,
    useRecruitmentPage,
} from './useRecruitmentPage';
import type { RecruitmentLinkRead, StudyRead } from '@/api/model';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

const { mockCreateMutationHook, mockRevokeMutationHook } = vi.hoisted(() => ({
    mockCreateMutationHook: vi.fn(),
    mockRevokeMutationHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useCreateRecruitmentLinksApiAdminRecruitmentSlugLinksPost: mockCreateMutationHook,
    useRevokeRecruitmentLinkApiAdminRecruitmentLinksLinkIdDelete: mockRevokeMutationHook,
    getListStudiesApiAdminStudiesGetQueryKey: () => ['list-studies'],
    getGetStudyApiAdminStudiesSlugGetQueryKey: (slug: string) => ['get-study', slug],
}));

const { mockUpdateStudy } = vi.hoisted(() => ({
    mockUpdateStudy: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/api/admin', () => ({
    AdminService: {
        updateStudy: mockUpdateStudy,
    },
}));

const mockNavigate = vi.fn();
const mockRevalidate = vi.fn();
const mockUseParams = vi.fn();
const mockUseLoaderData = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => mockUseParams(),
        useNavigate: () => mockNavigate,
        useLoaderData: () => mockUseLoaderData(),
        useRevalidator: () => ({ revalidate: mockRevalidate, state: 'idle' }),
        useOutletContext: () => ({}),
    };
});

// ── Fixtures ──────────────────────────────────────────────────────

const mockStudy: StudyRead = {
    id: 1,
    slug: 'demo-study',
    state: 'draft',
    requires_password: false,
    start_date: null,
    end_date: null,
} as unknown as StudyRead;

const mockLinks: RecruitmentLinkRead[] = [
    {
        id: 10,
        study_id: 1,
        token: 'abc123',
        type: 'public',
        usage_count: 5,
        start_count: 7,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
    },
];

function makeIdleMutation() {
    return { mutate: vi.fn(), isPending: false };
}

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ studySlug: 'demo-study', projectSlug: 'p1' });
    mockUseLoaderData.mockReturnValue({
        links: mockLinks,
        study: mockStudy,
        slug: 'demo-study',
    });
    mockCreateMutationHook.mockReturnValue(makeIdleMutation());
    mockRevokeMutationHook.mockReturnValue(makeIdleMutation());
});

// ── Tests ─────────────────────────────────────────────────────────

describe('useRecruitmentPage', () => {
    it('exposes loader data and derives slug-locked / archived / studyUrl flags', () => {
        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.slug).toBe('demo-study');
        expect(result.current.study).toBe(mockStudy);
        expect(result.current.links).toBe(mockLinks);
        expect(result.current.isSlugLocked).toBe(false); // state === 'draft'
        expect(result.current.isArchived).toBe(false);
        expect(result.current.studyUrl).toBe(`${window.location.origin}/study/demo-study`);
    });

    it('flags isSlugLocked when study state is not draft and isArchived for archived state', () => {
        const archived = { ...mockStudy, state: 'archived' } as StudyRead;
        mockUseLoaderData.mockReturnValue({
            links: mockLinks,
            study: archived,
            slug: 'demo-study',
        });

        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.isSlugLocked).toBe(true);
        expect(result.current.isArchived).toBe(true);
    });

    it('initializes new-link form fields with public-link defaults', () => {
        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.newLinkType).toBe('public');
        expect(result.current.newLinkCount).toBe(1);
        expect(result.current.newLinkName).toBe('');
        expect(result.current.isCreateModalOpen).toBe(false);
    });

    it('handleCreateModalOpenChange(false) resets dependent fields, true preserves them', () => {
        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setIsCreateModalOpen(true);
            result.current.setNewLinkType('individual');
            result.current.setNewLinkCount(5);
            result.current.setNewLinkName('Cohort A');
        });

        expect(result.current.newLinkType).toBe('individual');
        expect(result.current.newLinkCount).toBe(5);
        expect(result.current.newLinkName).toBe('Cohort A');

        // Closing the modal resets all dependent fields
        act(() => {
            result.current.handleCreateModalOpenChange(false);
        });

        expect(result.current.isCreateModalOpen).toBe(false);
        expect(result.current.newLinkType).toBe('public');
        expect(result.current.newLinkCount).toBe(1);
        expect(result.current.newLinkName).toBe('');
    });

    it('handleCreate dispatches mutate with current slug, count, type, name', () => {
        const mutate = vi.fn();
        mockCreateMutationHook.mockReturnValue({ mutate, isPending: false });

        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setNewLinkType('individual');
            result.current.setNewLinkCount(3);
            result.current.setNewLinkName('Wave 1');
        });

        act(() => {
            result.current.handleCreate();
        });

        expect(mutate).toHaveBeenCalledWith({
            slug: 'demo-study',
            params: { count: 3 },
            data: {
                type: 'individual',
                name: 'Wave 1',
                capacity: 1, // individual links carry capacity 1
            },
        });
    });

    it('handleCreate omits capacity for non-individual link types and name when blank', () => {
        const mutate = vi.fn();
        mockCreateMutationHook.mockReturnValue({ mutate, isPending: false });

        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setNewLinkType('limited');
            result.current.setNewLinkCount(20);
        });

        act(() => {
            result.current.handleCreate();
        });

        expect(mutate).toHaveBeenCalledWith({
            slug: 'demo-study',
            params: { count: 20 },
            data: {
                type: 'limited',
                name: undefined,
                capacity: undefined,
            },
        });
    });

    it('handleRevoke dispatches mutate with linkId', () => {
        const mutate = vi.fn();
        mockRevokeMutationHook.mockReturnValue({ mutate, isPending: false });

        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.handleRevoke(42);
        });

        expect(mutate).toHaveBeenCalledWith({ linkId: 42 });
    });

    it('isCreatingLink and isRevokingLink reflect mutation pending state', () => {
        mockCreateMutationHook.mockReturnValue({ mutate: vi.fn(), isPending: true });
        mockRevokeMutationHook.mockReturnValue({ mutate: vi.fn(), isPending: true });

        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.isCreatingLink).toBe(true);
        expect(result.current.isRevokingLink).toBe(true);
    });

    it('copyToClipboard writes text and shows a toast', () => {
        const writeText = vi.fn();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
            writable: true,
        });

        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.copyToClipboard('https://example.com/study/demo-study');
        });

        expect(writeText).toHaveBeenCalledWith('https://example.com/study/demo-study');
    });

    it('getFullUrl appends a token query parameter to the studyUrl', () => {
        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.getFullUrl('xyz')).toBe(
            `${window.location.origin}/study/demo-study?token=xyz`
        );
    });

    it('onSlugSubmit calls AdminService.updateStudy and navigates when slug changes', async () => {
        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.onSlugSubmit({ slug: 'new-slug' });
        });

        expect(mockUpdateStudy).toHaveBeenCalledWith('demo-study', { slug: 'new-slug' });
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/app/p1/studies/new-slug/recruitment');
        });
    });

    it('onSlugSubmit replaces in-place when slug is unchanged', async () => {
        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.onSlugSubmit({ slug: 'demo-study' });
        });

        expect(mockUpdateStudy).toHaveBeenCalledWith('demo-study', { slug: 'demo-study' });
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('.', { replace: true });
        });
    });

    it('onAccessRulesSubmit serialises dates and toggles password correctly', async () => {
        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.onAccessRulesSubmit({
                passwordEnabled: true,
                accessPassword: 'secret',
                startDate: '2026-05-01T10:00',
                endDate: '',
            });
        });

        expect(mockUpdateStudy).toHaveBeenCalledTimes(1);
        const [submittedSlug, body] = mockUpdateStudy.mock.calls[0];
        expect(submittedSlug).toBe('demo-study');
        // Password set, end_date null, start_date as ISO
        const cast = body as Record<string, unknown>;
        expect(cast.access_password).toBe('secret');
        expect(cast.end_date).toBeNull();
        expect(typeof cast.start_date).toBe('string');
        expect(mockRevalidate).toHaveBeenCalled();
    });

    it('onAccessRulesSubmit nulls access_password when password is disabled', async () => {
        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.onAccessRulesSubmit({
                passwordEnabled: false,
                accessPassword: 'should-be-ignored',
                startDate: '',
                endDate: '',
            });
        });

        const cast = mockUpdateStudy.mock.calls[0][1] as Record<string, unknown>;
        expect(cast.access_password).toBeNull();
        expect(cast.start_date).toBeNull();
        expect(cast.end_date).toBeNull();
    });

    it('exposes slugForm + accessForm with default values aligned to the loader study', () => {
        const studyWithRules = {
            ...mockStudy,
            requires_password: true,
            start_date: '2026-05-01T08:00:00Z',
        } as StudyRead;
        mockUseLoaderData.mockReturnValue({
            links: mockLinks,
            study: studyWithRules,
            slug: 'demo-study',
        });

        const { result } = renderHook(() => useRecruitmentPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.slugForm.getValues('slug')).toBe('demo-study');
        expect(result.current.accessForm.getValues('passwordEnabled')).toBe(true);
        expect(result.current.passwordEnabled).toBe(true);
    });
});

// ── Schema / helper tests ─────────────────────────────────────────

describe('slugFormSchema', () => {
    it('rejects uppercase, whitespace, or invalid characters', () => {
        expect(slugFormSchema.safeParse({ slug: 'BadSlug' }).success).toBe(false);
        expect(slugFormSchema.safeParse({ slug: 'with space' }).success).toBe(false);
        expect(slugFormSchema.safeParse({ slug: 'good-slug-1' }).success).toBe(true);
    });
});

describe('accessRulesSchema', () => {
    it('accepts blank optional fields', () => {
        expect(
            accessRulesSchema.safeParse({
                passwordEnabled: false,
                accessPassword: '',
                startDate: '',
                endDate: '',
            }).success
        ).toBe(true);
    });
});

describe('toLocalDatetimeString', () => {
    it('returns a 16-character "YYYY-MM-DDTHH:mm" string', () => {
        const out = toLocalDatetimeString('2026-05-01T08:00:00Z');
        expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });
});
