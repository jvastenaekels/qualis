/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useAnalysisPage hook.
 *
 * Covers form state defaults, state updates, mutation dispatch, and
 * historical run navigation — without rendering any JSX.
 * Integration of hook + JSX is covered by the existing AnalysisPage.test.tsx.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { useAnalysisPage } from './useAnalysisPage';
import type { AnalysisResult, AnalysisRunSummary } from '@/api/model';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// Hoisted mocks for generated API hooks
const { mockEigenvaluesHook, mockAnalysisMutationHook } = vi.hoisted(() => ({
    mockEigenvaluesHook: vi.fn(),
    mockAnalysisMutationHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet: mockEigenvaluesHook,
    useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost: mockAnalysisMutationHook,
}));

vi.mock('@/utils/analysisXlsxExport', () => ({
    generateAnalysisXlsx: vi.fn().mockResolvedValue(
        new Blob(['xlsx'], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
    ),
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

const mockResult: AnalysisResult = {
    n_participants: 3,
    n_statements: 4,
    n_factors: 2,
    extraction: 'pca',
    rotation: 'varimax',
    eigenvalues: [3.0, 1.5],
    total_variance_explained: 56.0,
    loadings: [
        [0.8, 0.1],
        [0.7, 0.2],
        [0.1, 0.9],
    ],
    rotated_loadings: [
        [0.82, 0.08],
        [0.71, 0.18],
        [0.05, 0.91],
    ],
    flags: [
        [true, false],
        [true, false],
        [false, true],
    ],
    participants: [
        { db_id: 1, label: 'P001', loadings: [0.82, 0.08], flagged_factors: [1] },
        { db_id: 2, label: 'P002', loadings: [0.71, 0.18], flagged_factors: [1] },
        { db_id: 3, label: 'P003', loadings: [0.05, 0.91], flagged_factors: [2] },
    ],
    statement_scores: [
        {
            statement_id: 1,
            code: 'S1',
            text: 'Statement one',
            z_scores: [1.2, -0.5],
            factor_arrays: [1, -1],
        },
        {
            statement_id: 2,
            code: 'S2',
            text: 'Statement two',
            z_scores: [0.3, 0.8],
            factor_arrays: [0, 1],
        },
    ],
    distinguishing: [
        {
            statement_id: 1,
            code: 'S1',
            text: 'Statement one',
            z_scores: [1.2, -0.5],
            factor_arrays: [1, -1],
            significance: { '1-2': 'p<0.05' },
        },
    ],
    consensus: [],
    factor_characteristics: [
        {
            factor: 1,
            eigenvalue: 3.0,
            variance_explained: 37.5,
            cumulative_variance: 37.5,
            n_flagged: 2,
            avg_rel_coef: 0.8,
            composite_reliability: 0.889,
            se_factor_scores: 0.333,
        },
        {
            factor: 2,
            eigenvalue: 1.5,
            variance_explained: 18.75,
            cumulative_variance: 56.0,
            n_flagged: 1,
            avg_rel_coef: 0.8,
            composite_reliability: 0.8,
            se_factor_scores: 0.447,
        },
    ],
    correlation_matrix: [
        [1.0, 0.05],
        [0.05, 1.0],
    ],
};

const mockRun: AnalysisRunSummary = {
    id: 42,
    ran_at: '2026-04-20T10:00:00Z',
    extraction_method: 'pca',
    n_factors: 2,
    rotation_method: 'varimax',
    flagging_mode: 'auto',
    ran_by_email: 'researcher@example.com',
    notes: null,
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

describe('useAnalysisPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEigenvaluesHook.mockReturnValue(makeIdleEigenvalues());
        mockAnalysisMutationHook.mockReturnValue(makeIdleMutation());
    });

    it('has correct initial form state defaults', () => {
        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        expect(result.current.extraction).toBe('pca');
        expect(result.current.nFactors).toBe(3);
        expect(result.current.rotation).toBe('varimax');
        expect(result.current.flagging).toBe('auto');
        expect(result.current.manualFlags).toEqual({});
        expect(result.current.result).toBeNull();
        expect(result.current.viewingRun).toBeNull();
        expect(result.current.isViewingHistorical).toBe(false);
    });

    it('setExtraction and setRotation update form state', () => {
        const { result } = renderHook(() => useAnalysisPage('test-study'), {
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
        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setNFactors(5);
        });
        expect(result.current.nFactors).toBe(5);
    });

    it('setFlagging to auto clears manualFlags', () => {
        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        // Switch to manual first to set some flags via toggle
        act(() => {
            result.current.setFlagging('manual');
        });
        act(() => {
            result.current.handleToggleFlag(1, 2);
        });
        expect(result.current.manualFlags[1]).toEqual([2]);

        // Switching back to auto clears the flags
        act(() => {
            result.current.setFlagging('auto');
        });
        expect(result.current.manualFlags).toEqual({});
        expect(result.current.flagging).toBe('auto');
    });

    it('handleToggleFlag toggles a factor for a participant (one at a time)', () => {
        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        // Toggle on
        act(() => {
            result.current.handleToggleFlag(1, 2);
        });
        expect(result.current.manualFlags[1]).toEqual([2]);

        // Toggle off (same factor)
        act(() => {
            result.current.handleToggleFlag(1, 2);
        });
        expect(result.current.manualFlags[1]).toEqual([]);

        // Toggle a different factor replaces the previous (Q-method standard: one per participant)
        act(() => {
            result.current.handleToggleFlag(1, 1);
        });
        act(() => {
            result.current.handleToggleFlag(1, 2);
        });
        expect(result.current.manualFlags[1]).toEqual([2]);
    });

    it('handleRunAnalysis calls mutate with current form values', () => {
        const mockMutate = vi.fn();
        mockAnalysisMutationHook.mockReturnValue({ mutate: mockMutate, isPending: false });
        mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());

        const { result } = renderHook(() => useAnalysisPage('test-study'), {
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

    it('handleLoadHistoricalRun sets result and viewingRun, enabling isViewingHistorical', () => {
        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.handleLoadHistoricalRun(mockResult, mockRun);
        });

        expect(result.current.result).toBe(mockResult);
        expect(result.current.viewingRun).toBe(mockRun);
        expect(result.current.isViewingHistorical).toBe(true);
    });

    it('handleClearHistoricalView clears viewingRun without clearing result', () => {
        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.handleLoadHistoricalRun(mockResult, mockRun);
        });
        expect(result.current.isViewingHistorical).toBe(true);

        act(() => {
            result.current.handleClearHistoricalView();
        });
        expect(result.current.viewingRun).toBeNull();
        expect(result.current.isViewingHistorical).toBe(false);
        // result is not cleared — it stays showing the historical data
        expect(result.current.result).toBe(mockResult);
    });

    it('maxFactors is capped at eigenvalues.length - 1 (max 10)', () => {
        mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());
        // mockEigenvalueData has 4 eigenvalues → maxFactors = min(4-1, 10) = 3

        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        expect(result.current.maxFactors).toBe(3);
    });

    it('handleLoadHistoricalRun with null args clears viewingRun (deleted run case)', () => {
        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.handleLoadHistoricalRun(mockResult, mockRun);
        });
        expect(result.current.isViewingHistorical).toBe(true);

        // Simulate deletion callback: null args
        act(() => {
            result.current.handleLoadHistoricalRun(
                null as unknown as AnalysisResult,
                null as unknown as AnalysisRunSummary
            );
        });
        expect(result.current.viewingRun).toBeNull();
        expect(result.current.isViewingHistorical).toBe(false);
    });

    it('exposes eigenvalue-derived data when query succeeds', () => {
        mockEigenvaluesHook.mockReturnValue(makeLoadedEigenvalues());

        const { result } = renderHook(() => useAnalysisPage('test-study'), {
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

        const { result } = renderHook(() => useAnalysisPage('test-study'), {
            wrapper: AllTheProviders,
        });

        expect(result.current.isRunning).toBe(true);
    });

    describe('judgmental rotation', () => {
        it('manualRotations is empty by default', () => {
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
                wrapper: AllTheProviders,
            });
            expect(result.current.manualRotations).toEqual([]);
            expect(result.current.isJudgmentalWithoutRotations).toBe(false);
        });

        it('addManualRotation appends a row with default values', () => {
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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

            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
                wrapper: AllTheProviders,
            });
            expect(result.current.bootstrapEnabled).toBe(false);
            expect(result.current.bootstrapIterations).toBe(1000);
        });

        it('setBootstrapEnabled and setBootstrapIterations update state', () => {
            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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

            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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

            const { result } = renderHook(() => useAnalysisPage('test-study'), {
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

    describe('showFactorNarratives toggle (localStorage-persisted)', () => {
        const studySlug = 'narratives-toggle-study';
        const lsKey = `qualis-analysis-show-narratives-${studySlug}`;

        beforeEach(() => {
            window.localStorage.removeItem(lsKey);
        });

        it('defaults to true when no localStorage entry exists', () => {
            const { result } = renderHook(() => useAnalysisPage(studySlug), {
                wrapper: AllTheProviders,
            });
            expect(result.current.showFactorNarratives).toBe(true);
        });

        it('initializes from localStorage when a previous preference exists', () => {
            window.localStorage.setItem(lsKey, 'false');
            const { result } = renderHook(() => useAnalysisPage(studySlug), {
                wrapper: AllTheProviders,
            });
            expect(result.current.showFactorNarratives).toBe(false);
        });

        it('setShowFactorNarratives writes the value to localStorage', () => {
            const { result } = renderHook(() => useAnalysisPage(studySlug), {
                wrapper: AllTheProviders,
            });

            act(() => {
                result.current.setShowFactorNarratives(false);
            });

            expect(result.current.showFactorNarratives).toBe(false);
            expect(window.localStorage.getItem(lsKey)).toBe('false');

            act(() => {
                result.current.setShowFactorNarratives(true);
            });

            expect(window.localStorage.getItem(lsKey)).toBe('true');
        });

        it('uses a per-study localStorage key (does not leak across studies)', () => {
            window.localStorage.setItem('qualis-analysis-show-narratives-other-study', 'false');
            const { result } = renderHook(() => useAnalysisPage(studySlug), {
                wrapper: AllTheProviders,
            });
            // The other-study preference must NOT bleed into this study's hook.
            expect(result.current.showFactorNarratives).toBe(true);
        });
    });

    describe('eigenvalues query retry policy', () => {
        // The endpoint returns 400 "Need at least 2 valid participants"
        // for fresh studies. Retrying delays the user-visible amber alert
        // and emits 4 console errors — short-circuit retries on 4xx.
        function getRetryFn(): (failureCount: number, error: unknown) => boolean {
            renderHook(() => useAnalysisPage('test-study'), {
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
