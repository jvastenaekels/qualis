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
});
