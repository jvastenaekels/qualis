import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStudyPersistence } from './useStudyPersistence';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useUpdateStudyApiAdminStudiesSlugPatch } from '@/api/generated';

// Mock dependencies
vi.mock('@/store/useStudyDesigner');
vi.mock('@/api/generated');
vi.mock('@/utils/mergeStudy', () => ({
    mergeStudyUpdates: vi.fn((draft, server) => ({
        success: true,
        merged: { ...server, ...draft }, // Simple merge for testing
    })),
}));
vi.mock('react-router-dom', () => ({
    useParams: () => ({ studySlug: 'test-study' }),
    useBlocker: vi.fn(() => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() })),
}));

describe('useStudyPersistence', () => {
    let mockSetSyncStatus: ReturnType<typeof vi.fn>;
    let mockSetLastSavedAt: ReturnType<typeof vi.fn>;
    let mockUpdateOriginal: ReturnType<typeof vi.fn>;
    let mockUpdateDraft: ReturnType<typeof vi.fn>;
    let mockMutateAsync: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        // Clear localStorage
        localStorage.clear();

        // Setup mocks
        mockSetSyncStatus = vi.fn();
        mockSetLastSavedAt = vi.fn();
        mockUpdateOriginal = vi.fn();
        mockUpdateDraft = vi.fn();
        mockMutateAsync = vi.fn();

        const mockStoreState = {
            draft: null,
            original: null,
            syncStatus: 'synced' as const,
            lastSavedAt: null,
            setSyncStatus: mockSetSyncStatus,
            setLastSavedAt: mockSetLastSavedAt,
            updateOriginal: mockUpdateOriginal,
            updateDraft: mockUpdateDraft,
            setStudy: vi.fn(),
            reset: vi.fn(),
        };

        // Mock both the hook and getState
        vi.mocked(useStudyDesigner).mockReturnValue(
            mockStoreState as unknown as ReturnType<typeof useStudyDesigner>
        );
        (useStudyDesigner as unknown as { getState: () => typeof mockStoreState }).getState = vi
            .fn()
            .mockReturnValue(mockStoreState);

        vi.mocked(useUpdateStudyApiAdminStudiesSlugPatch).mockReturnValue({
            mutateAsync: mockMutateAsync,
        } as unknown as ReturnType<typeof useUpdateStudyApiAdminStudiesSlugPatch>);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // Helper to mock store state properly
    const mockStoreState = (partialState: Partial<ReturnType<typeof useStudyDesigner>>) => {
        const fullState = {
            draft: null,
            original: null,
            syncStatus: 'synced' as const,
            lastSavedAt: null,
            setSyncStatus: mockSetSyncStatus,
            setLastSavedAt: mockSetLastSavedAt,
            updateOriginal: mockUpdateOriginal,
            updateDraft: mockUpdateDraft,
            setStudy: vi.fn(),
            reset: vi.fn(),
            ...partialState,
        };

        vi.mocked(useStudyDesigner).mockReturnValue(
            fullState as unknown as ReturnType<typeof useStudyDesigner>
        );
        (useStudyDesigner as unknown as { getState: () => typeof fullState }).getState = vi
            .fn()
            .mockReturnValue(fullState);

        return fullState;
    };

    it('should not trigger save automatically', () => {
        const draft = { slug: 'test-study', statements: [] };
        mockStoreState({ draft, syncStatus: 'modified' });

        renderHook(() => useStudyPersistence());

        expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('should trigger save when manual save is called', async () => {
        const draft = { slug: 'test-study', statements: [] };
        mockStoreState({ draft, syncStatus: 'modified' });

        const { result } = renderHook(() => useStudyPersistence());

        await act(async () => {
            await result.current.save();
        });

        expect(mockMutateAsync).toHaveBeenCalledWith({
            slug: 'test-study',
            data: draft,
        });
        expect(mockSetSyncStatus).toHaveBeenCalledWith('saving');
        expect(mockSetSyncStatus).toHaveBeenCalledWith('synced');
    });

    it('should backup draft to localStorage immediately', async () => {
        vi.useFakeTimers();
        const _draft = { slug: 'test-study', statements: [] };
        const _original = { id: 'orig-id', slug: 'test-study' };

        // biome-ignore lint/suspicious/noExplicitAny: test mock data
        mockStoreState({ draft: _draft, original: _original as any, syncStatus: 'modified' });

        renderHook(() => useStudyPersistence());

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        const backup = localStorage.getItem('qualis-draft-backup-test-study');
        expect(backup).toContain('"slug":"test-study"');
        expect(backup).toContain('"_study_id":"orig-id"');
        vi.useRealTimers();
    });

    it('should handle 409 conflict and merge', async () => {
        const draft = { slug: 'test-study', statements: ['local-change'] };
        const serverState = { slug: 'test-study', statements: ['server-change'] };
        const original = { slug: 'test-study', statements: [] };

        mockStoreState({ draft, original, syncStatus: 'modified' });

        const conflictError = {
            status: 409,
            details: {
                server_state: serverState,
            },
        };

        mockMutateAsync.mockRejectedValueOnce(conflictError);

        const { result } = renderHook(() => useStudyPersistence());

        await act(async () => {
            await result.current.save();
        });

        expect(mockUpdateOriginal).toHaveBeenCalled();
        expect(mockUpdateDraft).toHaveBeenCalled();
        expect(mockSetSyncStatus).toHaveBeenCalledWith('modified');
    });

    it('should serialise saves: a second save while one is in flight does not re-invoke the mutation', async () => {
        // Characterization test for the syncStatus === 'saving' guard at the top of save().
        // It is the ACTUAL protection against concurrent/out-of-order saves (the AbortController
        // was dead code — its signal was never wired to the mutation). This test locks the
        // serialization contract: while a save is in flight, a second save() short-circuits.
        const draft = { slug: 'test-study', statements: [] };

        // First render: syncStatus 'modified' → save() proceeds and starts an in-flight mutation
        // whose resolution we control, so the save stays "in flight" across the second call.
        let resolveMutation: (value: unknown) => void = () => {};
        mockMutateAsync.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveMutation = resolve;
            })
        );

        mockStoreState({ draft, syncStatus: 'modified' });
        const first = renderHook(() => useStudyPersistence());

        let firstSave: Promise<void> = Promise.resolve();
        act(() => {
            firstSave = first.result.current.save();
        });

        // The in-flight save invoked the mutation exactly once.
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);

        // Re-render with syncStatus now 'saving' — this is the state the store would be in while
        // the mutation is pending. A second save() under this state must short-circuit on the
        // guard and return WITHOUT invoking the mutation again.
        mockStoreState({ draft, syncStatus: 'saving' });
        const second = renderHook(() => useStudyPersistence());

        await act(async () => {
            await second.result.current.save();
        });

        // Still exactly one invocation: the second call returned early on the guard.
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);

        // Let the first (in-flight) save finish cleanly.
        await act(async () => {
            resolveMutation({ slug: 'test-study' });
            await firstSave;
        });

        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('should warn user before unload when changes are unsaved', () => {
        const draft = { slug: 'test-study', statements: ['statement1'] };

        mockStoreState({ draft, syncStatus: 'modified' });

        renderHook(() => useStudyPersistence());

        const event = new Event('beforeunload') as BeforeUnloadEvent;
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        window.dispatchEvent(event);

        expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not warn before unload when changes are synced', () => {
        const draft = { slug: 'test-study', statements: ['statement1'] };

        mockStoreState({ draft, original: draft, syncStatus: 'synced' });

        renderHook(() => useStudyPersistence());

        const event = new Event('beforeunload') as BeforeUnloadEvent;
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        window.dispatchEvent(event);

        expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
});
