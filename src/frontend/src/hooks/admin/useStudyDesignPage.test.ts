/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useStudyDesignPage hook.
 *
 * Covers orchestration semantics — derived flags, modal toggles, defaults
 * application, language switching, step navigation, slug derivation —
 * without rendering JSX. Integration of hook + JSX is covered by the
 * existing StudyDesignPage.test.tsx.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { applyTranslationDefaults, DESIGN_STEPS, useStudyDesignPage } from './useStudyDesignPage';
import type { StudyRead, StudyUpdate } from '@/api/model';
import { useStudyDesigner } from '@/store/useStudyDesigner';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function restoreLocalStorage(): void {
    if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    }
}

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const { mockStudyQuery, mockUpdateMutation, mockParticipantsQuery } = vi.hoisted(() => ({
    mockStudyQuery: vi.fn(),
    mockUpdateMutation: vi.fn(),
    mockParticipantsQuery: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetStudyApiAdminStudiesSlugGet: mockStudyQuery,
    useUpdateStudyApiAdminStudiesSlugPatch: mockUpdateMutation,
    useListStudyParticipantsApiAdminStudiesSlugParticipantsGet: mockParticipantsQuery,
}));

vi.mock('@/api/mutator', () => ({
    customInstance: vi.fn().mockResolvedValue([]),
}));

const mockNavigate = vi.fn();
const mockUseParams = vi.fn();
const mockUseBlocker = vi.fn(() => ({
    state: 'unblocked',
    proceed: vi.fn(),
    reset: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => mockUseParams(),
        useNavigate: () => mockNavigate,
        useBlocker: (...args: unknown[]) => mockUseBlocker(...args),
        useBeforeUnload: vi.fn(),
    };
});

// ── Fixtures ──────────────────────────────────────────────────────

const mockStudy: StudyRead = {
    id: 1,
    slug: 'test-study',
    state: 'draft',
    grid_config: [
        { score: -1, capacity: 2 },
        { score: 0, capacity: 2 },
        { score: 1, capacity: 2 },
    ],
    statements: [
        { code: 's1', translations: [{ language_code: 'en', text: 'S1' }] },
        { code: 's2', translations: [{ language_code: 'en', text: 'S2' }] },
        { code: 's3', translations: [{ language_code: 'en', text: 'S3' }] },
        { code: 's4', translations: [{ language_code: 'en', text: 'S4' }] },
        { code: 's5', translations: [{ language_code: 'en', text: 'S5' }] },
        { code: 's6', translations: [{ language_code: 'en', text: 'S6' }] },
    ],
    branding: {},
    default_language: 'en',
    translations: [
        {
            language_code: 'en',
            title: 'Test Study',
            condition_of_instruction: 'Sort the cards',
            consent_title: 'Consent',
            consent_description: 'Description',
        },
    ],
    participant_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
} as unknown as StudyRead;

function makeStudyQueryResult(overrides: Partial<{ data: StudyRead; isLoading: boolean }> = {}) {
    return {
        data: undefined,
        isLoading: false,
        ...overrides,
    };
}

function makeUpdateMutation() {
    return { mutateAsync: vi.fn(), isPending: false };
}

// ── Tests ─────────────────────────────────────────────────────────

// A study with a finished Finnish translation: Test run needs the edited language to be ready.
const finnishToo = {
    ...mockStudy,
    translations: [
        ...(mockStudy.translations ?? []),
        {
            language_code: 'fi',
            title: 'Tutkimus',
            condition_of_instruction: 'Lajittele',
            consent_title: 'Suostumus',
            consent_description: 'Kuvaus',
        },
    ],
} as unknown as StudyRead;

const fakeTab = { focus: vi.fn() } as unknown as Window;

describe('useStudyDesignPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseParams.mockReturnValue({
            projectSlug: 'my-project',
            studySlug: 'test-study',
        });
        mockStudyQuery.mockReturnValue(makeStudyQueryResult());
        mockUpdateMutation.mockReturnValue(makeUpdateMutation());
        mockParticipantsQuery.mockReturnValue({ data: { items: [] }, isLoading: false });
        // Reset the Zustand store between tests
        useStudyDesigner.setState({
            draft: null,
            original: null,
            activeStep: 'intro',
            activeLocale: 'en',
            syncStatus: 'synced',
            lastSavedAt: null,
        });
    });

    afterEach(() => {
        useStudyDesigner.setState({
            draft: null,
            original: null,
            activeStep: 'intro',
            activeLocale: 'en',
            syncStatus: 'synced',
            lastSavedAt: null,
        });
    });

    it('loads the selected study instead of retaining another study draft', () => {
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));
        const { result, rerender, unmount } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });
        const second = {
            ...mockStudy,
            id: 2,
            slug: 'second-study',
            translations: [{ ...mockStudy.translations[0], title: 'Second study' }],
        };
        act(() => useStudyDesigner.setState({ lastSavedAt: new Date(), syncStatus: 'error' }));
        mockUseParams.mockReturnValue({ projectSlug: 'my-project', studySlug: 'second-study' });
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: second }));
        rerender();
        expect(result.current.draft?.slug).toBe('second-study');
        expect(result.current.currentTranslation?.title).toBe('Second study');
        expect(result.current.original?.id).toBe(2);
        expect(result.current.syncStatus).toBe('synced');
        expect(useStudyDesigner.getState().lastSavedAt).toBeNull();
        unmount();
    });

    it('preserves edits typed during save and uses the returned revision on the next save', async () => {
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));
        let resolve!: (study: StudyRead) => void;
        const mutateAsync = vi.fn(
            (_request: { slug: string; data: StudyUpdate }) =>
                new Promise<StudyRead>((r) => {
                    resolve = r;
                })
        );
        mockUpdateMutation.mockReturnValue({ mutateAsync, isPending: false });
        const { result, unmount } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });
        act(() =>
            useStudyDesigner.getState().updateTranslation('en', (tr) => {
                tr.title = 'Sent title ';
            })
        );
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.save();
        });
        act(() =>
            useStudyDesigner.getState().updateTranslation('en', (tr) => {
                tr.title = 'Newer title';
            })
        );
        const savedStudy = {
            ...mockStudy,
            updated_at: '2026-01-02T00:00:00Z',
            translations: [{ ...mockStudy.translations[0], title: 'Sent title' }],
        };
        await act(async () => {
            resolve(savedStudy);
            await pending;
        });
        expect(result.current.currentTranslation?.title).toBe('Newer title');
        expect(result.current.syncStatus).toBe('modified');
        expect(result.current.original?.translations[0].title).toBe('Sent title');
        expect(result.current.draft?.last_updated_at).toBe('2026-01-02T00:00:00Z');

        mutateAsync.mockResolvedValueOnce({
            ...savedStudy,
            translations: [{ ...savedStudy.translations[0], title: 'Newer title' }],
        });
        await act(async () => {
            await result.current.save();
        });
        expect(mutateAsync.mock.calls[1][0]).toMatchObject({
            slug: 'test-study',
            data: {
                last_updated_at: '2026-01-02T00:00:00Z',
                translations: [{ title: 'Newer title' }],
            },
        });
        expect(result.current.syncStatus).toBe('synced');
        unmount();
    });

    it('ignores a save response belonging to a study that has been left', async () => {
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));
        let resolve!: (study: StudyRead) => void;
        const mutateAsync = vi.fn(
            (_request: { slug: string; data: StudyUpdate }) =>
                new Promise<StudyRead>((r) => {
                    resolve = r;
                })
        );
        mockUpdateMutation.mockReturnValue({ mutateAsync, isPending: false });
        const { result, rerender, unmount } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.save();
        });
        const second = { ...mockStudy, id: 2, slug: 'second-study' };
        mockUseParams.mockReturnValue({ projectSlug: 'my-project', studySlug: 'second-study' });
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: second }));
        rerender();
        await act(async () => {
            resolve(mockStudy);
            await pending;
        });
        expect(result.current.original?.id).toBe(2);
        expect(result.current.draft?.slug).toBe('second-study');
        expect(result.current.syncStatus).toBe('synced');
        unmount();
    });

    it('ignores the previous save while the next study is still loading', async () => {
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));
        let resolve!: (study: StudyRead) => void;
        mockUpdateMutation.mockReturnValue({
            mutateAsync: () =>
                new Promise<StudyRead>((r) => {
                    resolve = r;
                }),
        });
        const { result, rerender, unmount } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.save();
        });
        mockUseParams.mockReturnValue({ projectSlug: 'my-project', studySlug: 'second-study' });
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ isLoading: true }));
        rerender();
        await act(async () => {
            resolve({ ...mockStudy, updated_at: '2026-01-02T00:00:00Z' });
            await pending;
        });
        expect(result.current.original?.updated_at).toBe('2026-01-01T00:00:00Z');
        expect(useStudyDesigner.getState().lastSavedAt).toBeNull();
        unmount();
    });

    it('preserves edits typed while a conflicting save is pending', async () => {
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));
        let reject!: (error: unknown) => void;
        mockUpdateMutation.mockReturnValue({
            mutateAsync: () =>
                new Promise<StudyRead>((_resolve, r) => {
                    reject = r;
                }),
        });
        const { result, unmount } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.save();
        });
        act(() =>
            useStudyDesigner.getState().updateTranslation('en', (tr) => {
                tr.title = 'Newer title';
            })
        );
        await act(async () => {
            reject({
                status: 409,
                details: { server_state: { ...mockStudy, updated_at: '2026-01-02T00:00:00Z' } },
            });
            await pending;
        });
        expect(result.current.currentTranslation?.title).toBe('Newer title');
        expect(result.current.draft?.last_updated_at).toBe('2026-01-02T00:00:00Z');
        expect(result.current.syncStatus).toBe('modified');
        unmount();
    });

    it('does not save the old draft to a route whose study is still loading', async () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockUseParams.mockReturnValue({ projectSlug: 'my-project', studySlug: 'second-study' });
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ isLoading: true }));
        const mutateAsync = vi.fn().mockResolvedValue(mockStudy);
        mockUpdateMutation.mockReturnValue({ mutateAsync });
        const { result, unmount } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });
        await act(async () => {
            await result.current.save();
        });
        expect(mutateAsync).not.toHaveBeenCalled();
        unmount();
    });

    it('derives effectiveSlug from studySlug when present, else from projectSlug', () => {
        mockUseParams.mockReturnValue({ projectSlug: 'p', studySlug: 'study-slug' });
        const { result, rerender } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });
        expect(result.current.effectiveSlug).toBe('study-slug');

        // Fallback to projectSlug if studySlug missing
        mockUseParams.mockReturnValue({ projectSlug: 'project-only' });
        rerender();
        expect(result.current.effectiveSlug).toBe('project-only');
    });

    it('initializes the designer store on first study load', () => {
        const setStudySpy = vi.spyOn(useStudyDesigner.getState(), 'setStudy');
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));

        renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });

        // setStudy should have been invoked with a defaults-augmented study
        expect(setStudySpy).toHaveBeenCalledTimes(1);
        const arg = setStudySpy.mock.calls[0][0];
        expect(arg.slug).toBe('test-study');
        // Defaults applied: instructions filled in from DEFAULT_STUDY_CONTENT
        expect(arg.translations?.[0]?.instructions).toBeTruthy();
    });

    it('resyncs draft to projectedUpdate when server fetch produces no real diff', () => {
        // Pre-seed store with a draft equivalent to mockStudy
        useStudyDesigner.getState().setStudy(mockStudy);
        useStudyDesigner.setState({ syncStatus: 'modified' });

        // Now the query returns the same study — should reset syncStatus to 'synced'
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));

        renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });

        expect(useStudyDesigner.getState().syncStatus).toBe('synced');
    });

    it('exposes derived lock and validation flags from the draft', () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));

        const { result } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.isFullyReadOnly).toBe(false);
        expect(result.current.isStructureLocked).toBe(false);
        expect(result.current.statementsCount).toBe(6);
        expect(result.current.gridCapacity).toBe(6);
        expect(result.current.isGridValid).toBe(true);
        expect(result.current.isIntroValid).toBe(true);
        expect(result.current.isConditionValid).toBe(true);
        expect(result.current.isQSortValid).toBe(true);
        expect(result.current.isLaunchReady).toBe(true);
    });

    it('flags isFullyReadOnly when study state is not draft', () => {
        const activeStudy: StudyRead = { ...mockStudy, state: 'active' } as StudyRead;
        useStudyDesigner.getState().setStudy(activeStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: activeStudy }));

        const { result } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.isFullyReadOnly).toBe(true);
        expect(result.current.isStructureLocked).toBe(true);
    });

    it('detects unbalanced grid (statementsCount !== gridCapacity)', () => {
        const unbalanced: StudyRead = {
            ...mockStudy,
            statements: [...(mockStudy.statements ?? []), { code: 's7', translations: [] }],
        } as StudyRead;
        useStudyDesigner.getState().setStudy(unbalanced);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: unbalanced }));

        const { result } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.statementsCount).toBe(7);
        expect(result.current.gridCapacity).toBe(6);
        expect(result.current.isGridValid).toBe(false);
        expect(result.current.isQSortValid).toBe(false);
        expect(result.current.isLaunchReady).toBe(false);
    });

    it('builds a 5-item required checklist reflecting completion state', () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));

        const { result } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.checklist).toHaveLength(5);
        // All items required and complete in this fixture
        for (const item of result.current.checklist) {
            expect(item.required).toBe(true);
            expect(item.isComplete).toBe(true);
        }
    });

    it('computes step navigation: nextStep, prevStep around active step', () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));

        const { result } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });

        // Default active step is 'intro' (index 0)
        expect(result.current.activeStep).toBe('intro');
        expect(result.current.prevStep).toBeUndefined();
        expect(result.current.nextStep?.id).toBe('pre-sort');

        act(() => {
            result.current.setActiveStep('q-sort');
        });

        expect(result.current.activeStep).toBe('q-sort');
        // q-sort is index 3, prev is condition, next is post-sort
        expect(result.current.prevStep?.id).toBe('condition');
        expect(result.current.nextStep?.id).toBe('post-sort');
    });

    it('language modal open/close toggles isLangModalOpen', () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));

        const { result } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.isLangModalOpen).toBe(false);
        act(() => result.current.openLangModal());
        expect(result.current.isLangModalOpen).toBe(true);
        act(() => result.current.closeLangModal());
        expect(result.current.isLangModalOpen).toBe(false);
    });

    it('setActiveLocale updates the active locale via the store', () => {
        const study: StudyRead = {
            ...mockStudy,
            translations: [
                ...(mockStudy.translations ?? []),
                {
                    language_code: 'fr',
                    title: 'Étude',
                    condition_of_instruction: 'Triez les cartes',
                    consent_title: 'Consentement',
                    consent_description: 'Description',
                },
            ],
        } as StudyRead;
        useStudyDesigner.getState().setStudy(study);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: study }));

        const { result } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.activeLocale).toBe('en');

        act(() => {
            result.current.setActiveLocale('fr');
        });

        expect(result.current.activeLocale).toBe('fr');
        expect(useStudyDesigner.getState().activeLocale).toBe('fr');
    });

    it('exposes activeLanguageCodes (filtered by !is_disabled, falling back to en)', () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));

        const { result } = renderHook(() => useStudyDesignPage(), {
            wrapper: AllTheProviders,
        });

        expect(result.current.activeLanguageCodes).toEqual(['en']);
    });

    it('opens test run even when localStorage is unavailable', () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => fakeTab);

        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('storage unavailable');
            },
        });

        try {
            const { result } = renderHook(() => useStudyDesignPage(), {
                wrapper: AllTheProviders,
            });

            act(() => {
                result.current.handleTestRun();
            });

            expect(openSpy).toHaveBeenCalledWith(
                '/study/test-study?mode=test&lang=en',
                'qualis-pilot-test-study'
            );
        } finally {
            restoreLocalStorage();
            openSpy.mockRestore();
        }
    });

    it('Test run opens the language being edited', () => {
        useStudyDesigner.getState().setStudy(finnishToo);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: finnishToo }));
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => fakeTab);
        localStorage.clear();

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });
        act(() => result.current.setActiveLocale('fi'));
        act(() => result.current.handleTestRun());

        expect(openSpy).toHaveBeenCalledWith(
            '/study/test-study?mode=test&lang=fi',
            'qualis-pilot-test-study'
        );
        // The draft is the only thing handed over; the old resolved snapshot is gone.
        expect(localStorage.getItem('qualis-test-draft-test-study')).not.toBeNull();
        expect(localStorage.getItem('qualis-test-config-test-study')).toBeNull();
        openSpy.mockRestore();
    });

    it('Test run reuses one named tab', () => {
        useStudyDesigner.getState().setStudy(finnishToo);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: finnishToo }));
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => fakeTab);

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });
        act(() => result.current.handleTestRun());
        act(() => result.current.setActiveLocale('fi'));
        act(() => result.current.handleTestRun());

        // Same name both times: the browser navigates the open tab, with the new language.
        expect(openSpy.mock.calls.map((c) => c[1])).toEqual([
            'qualis-pilot-test-study',
            'qualis-pilot-test-study',
        ]);
        expect(openSpy.mock.calls[1][0]).toBe('/study/test-study?mode=test&lang=fi');
        openSpy.mockRestore();
    });

    it.each([
        ['free', 7, true],
        ['forced', 7, false],
        ['flexible', 7, false],
    ])('%s distribution with spare capacity: testable is %s', (mode, _cap, testable) => {
        const spare = {
            ...mockStudy,
            distribution_mode: mode,
            grid_config: [
                { score: -1, capacity: 2 },
                { score: 0, capacity: 3 },
                { score: 1, capacity: 2 },
            ],
        } as unknown as StudyRead;
        useStudyDesigner.getState().setStudy(spare);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: spare }));

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });

        expect(result.current.gridCapacity).toBe(7);
        expect(result.current.isGridValid).toBe(testable);
        expect(result.current.isLaunchReady).toBe(testable);
    });

    it('free distribution with too little capacity cannot be tested', () => {
        const short = {
            ...mockStudy,
            distribution_mode: 'free',
            grid_config: [{ score: 0, capacity: 5 }],
        } as unknown as StudyRead;
        useStudyDesigner.getState().setStudy(short);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: short }));

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });

        expect(result.current.isGridValid).toBe(false);
    });

    it('the disabled Test run says why', () => {
        const unbalanced = {
            ...mockStudy,
            statements: [...(mockStudy.statements ?? []), { code: 's7', translations: [] }],
        } as StudyRead;
        useStudyDesigner.getState().setStudy(unbalanced);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: unbalanced }));

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });

        expect(result.current.isLaunchReady).toBe(false);
        expect(result.current.testRunBlockedReason).toContain('Grid balanced');
        expect(result.current.testRunBlockedReason).not.toContain('Study title');
    });

    it('a ready draft has no blocked reason', () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });

        expect(result.current.testRunBlockedReason).toBeNull();
    });

    it('a blocked test tab leaves no reset key behind and says so', async () => {
        const { toast } = await import('sonner');
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));
        vi.spyOn(window, 'open').mockImplementation(() => null);
        localStorage.clear();

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });
        act(() => result.current.handleTestRun());

        // A key left here would wipe the answers of a running test on its next language switch.
        expect(localStorage.getItem('qualis-pilot-reset-test-study')).toBeNull();
        expect(toast.error).toHaveBeenCalled();
        expect(toast.info).not.toHaveBeenCalled();
    });

    it('a reused test tab is brought to the front', () => {
        useStudyDesigner.getState().setStudy(mockStudy);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: mockStudy }));
        const focus = vi.fn();
        vi.spyOn(window, 'open').mockImplementation(() => ({ focus }) as unknown as Window);

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });
        act(() => result.current.handleTestRun());

        expect(focus).toHaveBeenCalled();
        expect(localStorage.getItem('qualis-pilot-reset-test-study')).toBe('true');
    });

    it('Test run does nothing while the draft is not ready', () => {
        const short = { ...mockStudy, statements: [] } as unknown as StudyRead;
        useStudyDesigner.getState().setStudy(short);
        mockStudyQuery.mockReturnValue(makeStudyQueryResult({ data: short }));
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => fakeTab);
        localStorage.clear();

        const { result } = renderHook(() => useStudyDesignPage(), { wrapper: AllTheProviders });
        act(() => result.current.handleTestRun());

        expect(openSpy).not.toHaveBeenCalled();
        expect(localStorage.getItem('qualis-pilot-reset-test-study')).toBeNull();
    });

    it('DESIGN_STEPS has the canonical 7 steps in expected order', () => {
        expect(DESIGN_STEPS.map((s) => s.id)).toEqual([
            'intro',
            'pre-sort',
            'condition',
            'q-sort',
            'post-sort',
            'branding',
            'interface',
        ]);
    });

    it('applyTranslationDefaults fills missing instructions / consent fields per locale', () => {
        const sparse: StudyRead = {
            ...mockStudy,
            translations: [
                {
                    language_code: 'en',
                    title: 'Sparse',
                    // instructions, consent_title, consent_description, etc. left blank
                },
            ],
        } as StudyRead;

        const augmented = applyTranslationDefaults(sparse);
        const tr = augmented.translations?.[0];

        expect(tr?.title).toBe('Sparse');
        expect(tr?.instructions).toBeTruthy();
        expect(tr?.consent_title).toBeTruthy();
        expect(tr?.consent_description).toBeTruthy();
        expect(tr?.condition_of_instruction).toBeTruthy();
    });
});
