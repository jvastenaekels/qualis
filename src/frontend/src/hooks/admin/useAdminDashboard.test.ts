/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useAdminDashboard hook.
 *
 * Covers state-bucket partitioning, alert computation, study-title fallback,
 * navigation handler, and dialog open flags — without rendering JSX.
 * Hook+JSX integration is covered by AdminDashboard.test.tsx.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { useAdminDashboard } from './useAdminDashboard';
import type { StudyRead } from '@/api/model';

const navigate = vi.fn();
const setActiveStudy = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: () => ({ currentProject: { id: 7, slug: 'demo', title: 'Demo' } }),
}));

vi.mock('@/store/useAdminStore', () => ({
    useAdminStore: () => ({ setActiveStudy }),
}));

const { mockStudiesHook, mockConcoursesHook } = vi.hoisted(() => ({
    mockStudiesHook: vi.fn(),
    mockConcoursesHook: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
}));

vi.mock('@/api/generated', () => ({
    useListStudiesApiAdminStudiesGet: mockStudiesHook,
    useListConcoursesApiAdminConcoursesGet: mockConcoursesHook,
}));

function makeStudy(overrides: Partial<StudyRead> & Pick<StudyRead, 'id' | 'slug'>): StudyRead {
    return {
        id: overrides.id,
        slug: overrides.slug,
        state: 'active',
        project_id: 7,
        participant_count: 0,
        end_date: null,
        translations: [],
        ...overrides,
        // biome-ignore lint/suspicious/noExplicitAny: minimal stub
    } as any;
}

beforeEach(() => {
    navigate.mockReset();
    setActiveStudy.mockReset();
    mockStudiesHook.mockReset();
    mockConcoursesHook.mockReset();
    mockConcoursesHook.mockReturnValue({ data: { items: [] }, isLoading: false });
});

describe('useAdminDashboard', () => {
    it('partitions studies into state buckets and excludes other projects', () => {
        const items: StudyRead[] = [
            makeStudy({ id: 1, slug: 'a', state: 'active' }),
            makeStudy({ id: 2, slug: 'b', state: 'draft' }),
            makeStudy({ id: 3, slug: 'c', state: 'paused' }),
            makeStudy({ id: 4, slug: 'd', state: 'closed' }),
            makeStudy({ id: 5, slug: 'e', state: 'archived' }),
            makeStudy({ id: 6, slug: 'f', state: 'active', project_id: 999 }),
        ];
        mockStudiesHook.mockReturnValue({ data: { items }, isLoading: false });

        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });

        expect(result.current.studies?.map((s) => s.slug)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(result.current.activeStudies.map((s) => s.slug)).toEqual(['a']);
        expect(result.current.draftStudies.map((s) => s.slug)).toEqual(['b']);
        expect(result.current.pausedStudies.map((s) => s.slug)).toEqual(['c']);
        expect(result.current.closedStudies.map((s) => s.slug)).toEqual(['d', 'e']);
        expect(result.current.hasStudies).toBe(true);
    });

    it('sums participant counts across all studies', () => {
        mockStudiesHook.mockReturnValue({
            data: {
                items: [
                    makeStudy({ id: 1, slug: 'a', participant_count: 12, state: 'active' }),
                    makeStudy({ id: 2, slug: 'b', participant_count: 5, state: 'closed' }),
                    makeStudy({ id: 3, slug: 'c', participant_count: 0, state: 'draft' }),
                ],
            },
            isLoading: false,
        });

        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });
        expect(result.current.totalParticipants).toBe(17);
    });

    it('produces a deadline alert for active studies closing within 7 days', () => {
        const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        mockStudiesHook.mockReturnValue({
            data: {
                items: [
                    makeStudy({
                        id: 1,
                        slug: 'urgent',
                        state: 'active',
                        end_date: inFiveDays,
                        participant_count: 3,
                    }),
                    makeStudy({
                        id: 2,
                        slug: 'comfortable',
                        state: 'active',
                        end_date: inThirtyDays,
                    }),
                    makeStudy({ id: 3, slug: 'no-deadline', state: 'active', end_date: null }),
                ],
            },
            isLoading: false,
        });

        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });
        expect(result.current.alerts).toHaveLength(1);
        expect(result.current.alerts[0]?.key).toBe('deadline-1');
    });

    it('produces no alerts when no active study has a near deadline', () => {
        mockStudiesHook.mockReturnValue({
            data: { items: [makeStudy({ id: 1, slug: 'a', state: 'active', end_date: null })] },
            isLoading: false,
        });
        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });
        expect(result.current.alerts).toEqual([]);
    });

    it('getStudyTitle prefers current language, then en, then any, then slug', () => {
        mockStudiesHook.mockReturnValue({ data: { items: [] }, isLoading: false });
        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });

        const withCurrent = makeStudy({
            id: 1,
            slug: 'a',
            translations: [
                { language_code: 'en', title: 'EN title', description: '' },
                { language_code: 'fr', title: 'FR title', description: '' },
                // biome-ignore lint/suspicious/noExplicitAny: minimal stub
            ] as any,
        });
        const withEnFallback = makeStudy({
            id: 2,
            slug: 'b',
            translations: [
                { language_code: 'en', title: 'EN only', description: '' },
                // biome-ignore lint/suspicious/noExplicitAny: minimal stub
            ] as any,
        });
        const withAnyFallback = makeStudy({
            id: 3,
            slug: 'c',
            translations: [
                { language_code: 'fi', title: 'FI only', description: '' },
                // biome-ignore lint/suspicious/noExplicitAny: minimal stub
            ] as any,
        });
        const empty = makeStudy({ id: 4, slug: 'd-slug', translations: [] });

        // Default test language is 'en' via i18n test config
        expect(result.current.getStudyTitle(withCurrent)).toBe('EN title');
        expect(result.current.getStudyTitle(withEnFallback)).toBe('EN only');
        expect(result.current.getStudyTitle(withAnyFallback)).toBe('FI only');
        expect(result.current.getStudyTitle(empty)).toBe('d-slug');
    });

    it('handleOpenStudy sets active study and navigates to study URL', () => {
        mockStudiesHook.mockReturnValue({ data: { items: [] }, isLoading: false });
        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });
        act(() => result.current.handleOpenStudy('my-study'));
        expect(setActiveStudy).toHaveBeenCalledWith('my-study');
        expect(navigate).toHaveBeenCalledWith('/app/demo/studies/my-study');
    });

    it('exposes setShowCreateDialog and setShowImportDialog and reflects updates', () => {
        mockStudiesHook.mockReturnValue({ data: { items: [] }, isLoading: false });
        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });
        expect(result.current.showCreateDialog).toBe(false);
        expect(result.current.showImportDialog).toBe(false);
        act(() => result.current.setShowCreateDialog(true));
        expect(result.current.showCreateDialog).toBe(true);
        act(() => result.current.setShowImportDialog(true));
        expect(result.current.showImportDialog).toBe(true);
    });

    it('hasStudies is false when the project has no studies', () => {
        mockStudiesHook.mockReturnValue({ data: { items: [] }, isLoading: false });
        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });
        expect(result.current.hasStudies).toBe(false);
    });

    it('scopes the concourse to the current project', () => {
        mockStudiesHook.mockReturnValue({ data: { items: [] }, isLoading: false });
        mockConcoursesHook.mockReturnValue({
            data: {
                items: [
                    { id: 11, project_id: 999, item_count: 5 },
                    { id: 22, project_id: 7, item_count: 3 },
                ],
            },
            isLoading: false,
            // biome-ignore lint/suspicious/noExplicitAny: minimal stub
        } as any);
        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });
        expect(result.current.concourse?.id).toBe(22);
    });

    it('returns no concourse when the cached list belongs to another project', () => {
        // Guards the onboarding checklist: a stale cross-project cache must not
        // tick the "Collect statements" step for a brand-new project.
        mockStudiesHook.mockReturnValue({ data: { items: [] }, isLoading: false });
        mockConcoursesHook.mockReturnValue({
            data: { items: [{ id: 11, project_id: 999, item_count: 5 }] },
            isLoading: false,
            // biome-ignore lint/suspicious/noExplicitAny: minimal stub
        } as any);
        const { result } = renderHook(() => useAdminDashboard(), { wrapper: AllTheProviders });
        expect(result.current.concourse).toBeUndefined();
    });
});
