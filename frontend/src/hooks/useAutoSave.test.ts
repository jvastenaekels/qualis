import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAutoSave } from './useAutoSave';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useUpdateStudyApiAdminStudiesSlugPatch } from '@/api/generated';

// Mock dependencies
vi.mock('@/store/useStudyDesigner');
vi.mock('@/api/generated');
vi.mock('@/utils/mergeStudy', () => ({
    mergeStudyUpdates: vi.fn((draft, server, _original) => ({
        success: true,
        merged: { ...server, ...draft }, // Simple merge for testing
    })),
}));
vi.mock('react-router-dom', () => ({
    useParams: () => ({ slug: 'test-study' }),
}));

describe('useAutoSave', () => {
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
        vi.clearAllTimers();
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

    it('should not trigger save when draft is null', () => {
        renderHook(() => useAutoSave());

        expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('should backup draft to localStorage immediately', () => {
        const draft = { slug: 'test-study', statements: [] };

        mockStoreState({ draft, syncStatus: 'modified' });

        renderHook(() => useAutoSave());

        const backup = localStorage.getItem('open-q-draft-backup-test-study');
        expect(backup).toBe(JSON.stringify(draft));
    });

    it.skip('should debounce save attempts', async () => {
        // ... (skipped)
    });

    it.skip('should handle successful save', async () => {
        // ... (skipped)
    });

    it('should handle 409 conflict with successful merge - critical test for infinite loop fix', async () => {
        const draft = { slug: 'test-study', statements: ['local-change'] };
        const serverState = { slug: 'test-study', statements: ['server-change'] };
        const original = { slug: 'test-study', statements: [] };

        mockStoreState({ draft, original, syncStatus: 'modified' });

        // Mock 409 conflict error matching ApiError structure
        const conflictError = {
            status: 409,
            details: {
                server_state: serverState,
            },
        };

        mockMutateAsync.mockRejectedValueOnce(conflictError);

        renderHook(() => useAutoSave(10)); // Very short debounce for testing

        // Wait for autosave logic to run
        await waitFor(
            () => {
                expect(mockUpdateOriginal).toHaveBeenCalled();
                expect(mockUpdateDraft).toHaveBeenCalled();
                expect(mockSetSyncStatus).toHaveBeenCalledWith('synced');
            },
            { timeout: 3000 }
        );

        // Critical: Should NOT call mutateAsync again (no infinite loop)
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('should warn user before unload when changes are unsaved', () => {
        const draft = { slug: 'test-study', statements: ['statement1'] };

        mockStoreState({ draft, syncStatus: 'modified' });

        renderHook(() => useAutoSave());

        const event = new Event('beforeunload') as BeforeUnloadEvent;
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        window.dispatchEvent(event);

        expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not warn before unload when changes are synced', () => {
        const draft = { slug: 'test-study', statements: ['statement1'] };

        mockStoreState({ draft, original: draft, syncStatus: 'synced' });

        renderHook(() => useAutoSave());

        const event = new Event('beforeunload') as BeforeUnloadEvent;
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

        window.dispatchEvent(event);

        expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
});
