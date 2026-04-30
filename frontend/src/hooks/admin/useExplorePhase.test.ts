/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useExplorePhase hook.
 *
 * Covers form state defaults, state updates, mutation dispatch, and the
 * post-success onCommit handoff — without rendering any JSX.
 * Integration of hook + JSX is covered by AnalysisPage.test.tsx.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { useExplorePhase } from './useExplorePhase';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// Hoisted mocks for generated API hooks
const {
    mockEigenvaluesHook,
    mockAnalysisMutationHook,
    mockListAnalysisRuns,
    mockGetListAnalysisRunsQueryKey,
} = vi.hoisted(() => ({
    mockEigenvaluesHook: vi.fn(),
    mockAnalysisMutationHook: vi.fn(),
    mockListAnalysisRuns: vi.fn(),
    mockGetListAnalysisRunsQueryKey: vi.fn(() => ['list-analysis-runs', 'test-study']),
}));

vi.mock('@/api/generated', () => ({
    useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet: mockEigenvaluesHook,
    useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost: mockAnalysisMutationHook,
    listAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet: mockListAnalysisRuns,
    getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey: mockGetListAnalysisRunsQueryKey,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ studySlug: 'test-study' }),
        useSearchParams: () => [new URLSearchParams(), vi.fn()],
    };
});

// ── Fixtures ──────────────────────────────────────────────────────

const mockEigenvalueData = {
    eigenvalues: [3.0, 1.5, 0.8, 0.4],
    suggested_n_factors: 2,
};

// ── Setup ─────────────────────────────────────────────────────────

function makeIdleEigenvalues() {
    return {
        data: undefined,
        isLoading: false,
        isSuccess: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
    };
}

function makeLoadedEigenvalues() {
    return {
        data: mockEigenvalueData,
        isLoading: false,
        isSuccess: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
    };
}

function makeIdleMutation() {
    return { mutate: vi.fn(), isPending: false };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('useExplorePhase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEigenvaluesHook.mockReturnValue(makeIdleEigenvalues());
        mockAnalysisMutationHook.mockReturnValue(makeIdleMutation());
        mockListAnalysisRuns.mockResolvedValue([]);
    });

    it('has correct initial form state defaults', () => {
        const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
            wrapper: AllTheProviders,
        });

        expect(result.current.extraction).toBe('pca');
        expect(result.current.nFactors).toBe(3);
        expect(result.current.rotation).toBe('varimax');
        expect(result.current.flagging).toBe('auto');
        expect(result.current.manualFlags).toEqual({});
    });

    it('setExtraction and setRotation update form state', () => {
        const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setExtraction('centroid');
        });
        expect(result.current.extraction).toBe('centroid');

        act(() => {
            result.current.setRotation('none');
        });
        expect(result.current.rotation).toBe('none');
    });

    it('setNFactors updates nFactors', () => {
        const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setNFactors(5);
        });
        expect(result.current.nFactors).toBe(5);
    });

    it('setFlagging to auto clears manualFlags', () => {
        const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
            wrapper: AllTheProviders,
        });

        // Switch to manual first; manualFlags is empty initially.
        act(() => {
            result.current.setFlagging('manual');
        });
        expect(result.current.flagging).toBe('manual');

        // Switching back to auto clears the flags
        act(() => {
            result.current.setFlagging('auto');
        });
        expect(result.current.manualFlags).toEqual({});
        expect(result.current.flagging).toBe('auto');
    });

    it('handleRunAnalysis calls mutate with current form values', () => {
        const mockMutate = vi.fn();
        mockAnalysisMutationHook.mockReturnValue({ mutate: mockMutate, isPending: false });
        mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());

        const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setExtraction('centroid');
        });
        act(() => {
            result.current.setRotation('none');
        });
        act(() => {
            result.current.handleRunAnalysis();
        });

        expect(mockMutate).toHaveBeenCalledWith(
            expect.objectContaining({
                slug: 'test-study',
                data: expect.objectContaining({
                    extraction: 'centroid',
                    rotation: 'none',
                    flagging: 'auto',
                    manual_flags: undefined,
                }),
            }),
            expect.any(Object)
        );
    });

    it('maxFactors is capped at eigenvalues.length - 1 (max 10)', () => {
        mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());
        // mockEigenvalueData has 4 eigenvalues → maxFactors = min(4-1, 10) = 3

        const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
            wrapper: AllTheProviders,
        });

        expect(result.current.maxFactors).toBe(3);
    });

    it('exposes eigenvalue-derived data when query succeeds', () => {
        mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());

        const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
            wrapper: AllTheProviders,
        });

        expect(result.current.hasEigenvalues).toBe(true);
        expect(result.current.eigenvalues).toEqual(mockEigenvalueData.eigenvalues);
        expect(result.current.suggestedNFactors).toBe(2);
        expect(result.current.eigenvaluesIsLoading).toBe(false);
        expect(result.current.isTooFewParticipants).toBe(false);
        expect(result.current.isEigenvalueError).toBe(false);
    });

    it('isRunning reflects mutation pending state', () => {
        mockAnalysisMutationHook.mockReturnValue({ mutate: vi.fn(), isPending: true });

        const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
            wrapper: AllTheProviders,
        });

        expect(result.current.isRunning).toBe(true);
    });

    it('calls onCommit with the fresh runId after successful analysis', async () => {
        // Drive mutation onSuccess synchronously: the mocked mutate immediately
        // invokes the per-call onSuccess with a minimal AnalysisResult-shaped
        // payload. The hook then awaits listAnalysisRuns to discover the fresh id.
        const mockMutate = vi.fn(
            (_vars: unknown, opts?: { onSuccess?: (data: { n_factors: number }) => void }) => {
                opts?.onSuccess?.({ n_factors: 3 });
            }
        );
        mockAnalysisMutationHook.mockReturnValue({ mutate: mockMutate, isPending: false });
        mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());
        mockListAnalysisRuns.mockResolvedValue([
            { id: 99, ran_at: '2026-04-29T10:00:00Z', n_factors: 3 },
            { id: 50, ran_at: '2026-04-28T10:00:00Z', n_factors: 2 },
        ]);

        const onCommit = vi.fn();
        const { result } = renderHook(() => useExplorePhase('test-study', onCommit), {
            wrapper: AllTheProviders,
        });

        await waitFor(() => expect(result.current.hasEigenvalues).toBe(true));

        await act(async () => {
            result.current.handleRunAnalysis();
        });

        await waitFor(() => expect(onCommit).toHaveBeenCalledWith(99));
        expect(mockListAnalysisRuns).toHaveBeenCalledWith('test-study');
    });

    it('does not call onCommit when listAnalysisRuns returns empty', async () => {
        const mockMutate = vi.fn(
            (_vars: unknown, opts?: { onSuccess?: (data: { n_factors: number }) => void }) => {
                opts?.onSuccess?.({ n_factors: 3 });
            }
        );
        mockAnalysisMutationHook.mockReturnValue({ mutate: mockMutate, isPending: false });
        mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());
        mockListAnalysisRuns.mockResolvedValue([]);

        const onCommit = vi.fn();
        const { result } = renderHook(() => useExplorePhase('test-study', onCommit), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            result.current.handleRunAnalysis();
        });

        await waitFor(() => expect(mockListAnalysisRuns).toHaveBeenCalled());
        expect(onCommit).not.toHaveBeenCalled();
    });

    describe('judgmental rotation', () => {
        it('manualRotations is empty by default', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            expect(result.current.manualRotations).toEqual([]);
            expect(result.current.isJudgmentalWithoutRotations).toBe(false);
        });

        it('addManualRotation appends a row with default values', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            act(() => {
                result.current.addManualRotation();
            });
            expect(result.current.manualRotations).toHaveLength(1);
            const [row] = result.current.manualRotations;
            expect(row).toMatchObject({ factor_a: 1, factor_b: 2, angle_deg: 0 });
            expect(typeof row?.id).toBe('string');
            expect(row?.id.length).toBeGreaterThan(0);
        });

        it('addManualRotation gives each row a unique stable id', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            act(() => {
                result.current.addManualRotation();
                result.current.addManualRotation();
                result.current.addManualRotation();
            });
            const ids = result.current.manualRotations.map((r) => r.id);
            expect(new Set(ids).size).toBe(3);
        });

        it('updateManualRotation mutates only the targeted row', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            act(() => {
                result.current.addManualRotation();
                result.current.addManualRotation();
            });
            act(() => {
                result.current.updateManualRotation(1, { angle_deg: 45 });
            });
            expect(result.current.manualRotations[0]?.angle_deg).toBe(0);
            expect(result.current.manualRotations[1]?.angle_deg).toBe(45);
        });

        it('removeManualRotation removes the row at the given index', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            act(() => {
                result.current.addManualRotation();
                result.current.addManualRotation();
            });
            expect(result.current.manualRotations).toHaveLength(2);
            act(() => {
                result.current.removeManualRotation(0);
            });
            expect(result.current.manualRotations).toHaveLength(1);
        });

        it('switching rotation away from judgmental clears manualRotations', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            act(() => {
                result.current.setRotation('judgmental');
            });
            act(() => {
                result.current.addManualRotation();
            });
            expect(result.current.manualRotations).toHaveLength(1);

            act(() => {
                result.current.setRotation('varimax');
            });
            expect(result.current.manualRotations).toEqual([]);
        });

        it('isJudgmentalWithoutRotations is true when rotation is judgmental and list is empty', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            act(() => {
                result.current.setRotation('judgmental');
            });
            expect(result.current.isJudgmentalWithoutRotations).toBe(true);

            act(() => {
                result.current.addManualRotation();
            });
            expect(result.current.isJudgmentalWithoutRotations).toBe(false);
        });

        it('handleRunAnalysis sends manual_rotations only when rotation is judgmental', () => {
            const mockMutate = vi.fn();
            mockAnalysisMutationHook.mockReturnValue({ mutate: mockMutate, isPending: false });
            mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());

            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });

            // Default rotation = 'varimax' → manual_rotations should be null
            act(() => {
                result.current.handleRunAnalysis();
            });
            expect(mockMutate).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        rotation: 'varimax',
                        manual_rotations: null,
                    }),
                }),
                expect.any(Object)
            );

            // Switch to judgmental + add a rotation → manual_rotations sent
            act(() => {
                result.current.setRotation('judgmental');
            });
            act(() => {
                result.current.addManualRotation();
            });
            act(() => {
                result.current.updateManualRotation(0, { angle_deg: 30 });
            });
            act(() => {
                result.current.handleRunAnalysis();
            });
            expect(mockMutate).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        rotation: 'judgmental',
                        manual_rotations: [{ factor_a: 1, factor_b: 2, angle_deg: 30 }],
                    }),
                }),
                expect.any(Object)
            );
        });
    });

    describe('bootstrap stability (Zabala & Pascual 2016)', () => {
        it('bootstrapEnabled defaults to false and bootstrapIterations defaults to 1000', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            expect(result.current.bootstrapEnabled).toBe(false);
            expect(result.current.bootstrapIterations).toBe(1000);
        });

        it('setBootstrapEnabled and setBootstrapIterations update state', () => {
            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            act(() => {
                result.current.setBootstrapEnabled(true);
            });
            expect(result.current.bootstrapEnabled).toBe(true);
            act(() => {
                result.current.setBootstrapIterations(500);
            });
            expect(result.current.bootstrapIterations).toBe(500);
        });

        it('handleRunAnalysis sends bootstrap_iterations=null when disabled', () => {
            const mockMutate = vi.fn();
            mockAnalysisMutationHook.mockReturnValue({ mutate: mockMutate, isPending: false });
            mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());

            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });

            act(() => {
                result.current.handleRunAnalysis();
            });
            expect(mockMutate).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ bootstrap_iterations: null }),
                }),
                expect.any(Object)
            );
        });

        it('handleRunAnalysis sends bootstrap_iterations=value when enabled', () => {
            const mockMutate = vi.fn();
            mockAnalysisMutationHook.mockReturnValue({ mutate: mockMutate, isPending: false });
            mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());

            const { result } = renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });

            act(() => {
                result.current.setBootstrapEnabled(true);
                result.current.setBootstrapIterations(500);
            });
            act(() => {
                result.current.handleRunAnalysis();
            });
            expect(mockMutate).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ bootstrap_iterations: 500 }),
                }),
                expect.any(Object)
            );
        });
    });

    describe('eigenvalues query retry policy', () => {
        // The endpoint returns 400 "Need at least 2 valid participants"
        // for fresh studies. Retrying delays the user-visible amber alert
        // and emits 4 console errors — short-circuit retries on 4xx.
        function getRetryFn(): (failureCount: number, error: unknown) => boolean {
            renderHook(() => useExplorePhase('test-study', vi.fn()), {
                wrapper: AllTheProviders,
            });
            const lastCall = mockEigenvaluesHook.mock.calls.at(-1);
            const opts = lastCall?.[1] as
                | { query?: { retry?: (n: number, e: unknown) => boolean } }
                | undefined;
            const retry = opts?.query?.retry;
            if (typeof retry !== 'function') {
                throw new Error('Expected query.retry to be a function');
            }
            return retry;
        }

        it('does not retry on 4xx ApiError responses', async () => {
            const { ApiError } = await import('@/api/client');
            const retry = getRetryFn();

            const apiError400 = new ApiError(400, 'Need at least 2 valid participants');
            const apiError404 = new ApiError(404, 'Not found');

            expect(retry(0, apiError400)).toBe(false);
            expect(retry(1, apiError400)).toBe(false);
            expect(retry(0, apiError404)).toBe(false);
        });

        it('retries on network errors and 5xx up to a small budget', async () => {
            const { ApiError } = await import('@/api/client');
            const retry = getRetryFn();

            const networkError = new Error('Network');
            const apiError503 = new ApiError(503, 'Service Unavailable');

            expect(retry(0, networkError)).toBe(true);
            expect(retry(1, networkError)).toBe(true);
            // Cap at 2 retries — beyond that, the user has waited long enough.
            expect(retry(2, networkError)).toBe(false);

            expect(retry(0, apiError503)).toBe(true);
            expect(retry(2, apiError503)).toBe(false);
        });
    });
});
