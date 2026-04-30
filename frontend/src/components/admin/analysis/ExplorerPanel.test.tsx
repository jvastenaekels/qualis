/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { ExplorerPanel } from './ExplorerPanel';
import type { ExplorePhaseApi } from '@/hooks/admin/useExplorePhase';
import type { PreviewRangeRow } from '@/api/model/previewRangeRow';

function buildExplore(overrides: Partial<ExplorePhaseApi> = {}): ExplorePhaseApi {
    return {
        slug: 'test-slug',
        extraction: 'pca',
        setExtraction: vi.fn(),
        nFactors: 3,
        setNFactors: vi.fn(),
        rotation: 'varimax',
        setRotation: vi.fn(),
        flagging: 'auto',
        setFlagging: vi.fn(),
        manualFlags: {},
        manualRotations: [],
        addManualRotation: vi.fn(),
        updateManualRotation: vi.fn(),
        removeManualRotation: vi.fn(),
        isJudgmentalWithoutRotations: false,
        bootstrapEnabled: false,
        setBootstrapEnabled: vi.fn(),
        bootstrapIterations: 1000,
        setBootstrapIterations: vi.fn(),
        maxFactors: 6,
        hasEigenvalues: true,
        isTooFewParticipants: false,
        isEigenvalueError: false,
        eigenvaluesIsLoading: false,
        eigenvalues: [3.2, 2.1, 0.8, 0.4, 0.2, 0.1],
        suggestedNFactors: 2,
        kaiserN: 2,
        parallelN: 2,
        mapN: 3,
        canPreviewRange: true,
        previewRows: undefined,
        isPreviewing: false,
        handlePreviewRange: vi.fn().mockResolvedValue(undefined),
        handleRefetchEigenvalues: vi.fn(),
        isRunning: false,
        handleRunAnalysis: vi.fn(),
        ...overrides,
    };
}

const SAMPLE_ROWS: PreviewRangeRow[] = [
    {
        n_factors: 2,
        cumulative_variance: 47,
        pct_flagged: 0.8,
        n_distinguishing: 8,
        n_cross_loaders: 0,
        n_consensus: 3,
        min_defining_sorts: 4,
        has_empty_factor: false,
    },
    {
        n_factors: 3,
        cumulative_variance: 58,
        pct_flagged: 0.7,
        n_distinguishing: 12,
        n_cross_loaders: 1,
        n_consensus: 2,
        min_defining_sorts: 4,
        has_empty_factor: false,
    },
];

describe('ExplorerPanel', () => {
    it('renders Diagnostics, Preview range, and Advanced sections', () => {
        renderWithProviders(
            <ExplorerPanel
                explore={buildExplore({ previewRows: SAMPLE_ROWS })}
                advancedContent={<div>placeholder</div>}
            />
        );
        expect(screen.getByText(/Diagnostics/i)).toBeInTheDocument();
        expect(screen.getByText(/Preview range/i)).toBeInTheDocument();
        expect(screen.getByText(/Advanced/i)).toBeInTheDocument();
    });

    it('renders the Commit-and-interpret button wired to handleRunAnalysis', () => {
        const handleRunAnalysis = vi.fn();
        const explore = buildExplore({ previewRows: SAMPLE_ROWS, handleRunAnalysis });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        const cta = screen.getByRole('button', { name: /commit and interpret/i });
        fireEvent.click(cta);
        expect(handleRunAnalysis).toHaveBeenCalledTimes(1);
    });

    it('disables the Commit button while a run is in flight', () => {
        const explore = buildExplore({ previewRows: SAMPLE_ROWS, isRunning: true });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        expect(screen.getByRole('button', { name: /commit and interpret/i })).toBeDisabled();
    });

    it('disables the Commit button when judgmental rotation has no rotations', () => {
        const explore = buildExplore({
            previewRows: SAMPLE_ROWS,
            isJudgmentalWithoutRotations: true,
        });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        expect(screen.getByRole('button', { name: /commit and interpret/i })).toBeDisabled();
    });

    it('selecting a column from PreviewRangeTable updates nFactors via setNFactors', () => {
        const setNFactors = vi.fn();
        const explore = buildExplore({ previewRows: SAMPLE_ROWS, setNFactors });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        fireEvent.click(screen.getByRole('button', { name: /3 factors/i }));
        expect(setNFactors).toHaveBeenCalledWith(3);
    });

    it('shows the gate message when canPreviewRange=false (centroid extraction)', () => {
        const explore = buildExplore({
            extraction: 'centroid',
            canPreviewRange: false,
            previewRows: undefined,
        });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        expect(screen.getByText(/PCA \+ varimax only/i)).toBeInTheDocument();
    });

    it('auto-fires preview-range on mount when canPreviewRange and no rows yet', () => {
        const handlePreviewRange = vi.fn().mockResolvedValue(undefined);
        const explore = buildExplore({
            canPreviewRange: true,
            previewRows: undefined,
            isPreviewing: false,
            maxFactors: 6,
            handlePreviewRange,
        });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        // Auto-fetch: range = 2..min(5, maxFactors-1) → [2, 3, 4, 5, 6] given maxFactors=6
        expect(handlePreviewRange).toHaveBeenCalledTimes(1);
        const arg = handlePreviewRange.mock.calls[0]?.[0];
        expect(arg).toEqual([2, 3, 4, 5, 6]);
    });

    it('does NOT auto-fire preview-range when canPreviewRange is false', () => {
        const handlePreviewRange = vi.fn();
        const explore = buildExplore({
            canPreviewRange: false,
            previewRows: undefined,
            handlePreviewRange,
        });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        expect(handlePreviewRange).not.toHaveBeenCalled();
    });

    it('does NOT re-fire when previewRows is already populated', () => {
        const handlePreviewRange = vi.fn();
        const explore = buildExplore({
            canPreviewRange: true,
            previewRows: SAMPLE_ROWS,
            handlePreviewRange,
        });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        expect(handlePreviewRange).not.toHaveBeenCalled();
    });

    it('does NOT auto-fire when eigenvalues are still loading', () => {
        // Regression: useExplorePhase falls back to maxFactors=10 while
        // eigenvaluesQuery.data is undefined. Without the hasEigenvalues gate,
        // the effect would fire with [2,3,4,5,6] — and for a study of n=3..6
        // participants the backend rejects k > min(8, n-1) with a 400.
        const handlePreviewRange = vi.fn();
        const explore = buildExplore({
            hasEigenvalues: false, // eigenvalues query in flight
            canPreviewRange: true,
            previewRows: undefined,
            isPreviewing: false,
            maxFactors: 10, // stale fallback
            handlePreviewRange,
        });
        renderWithProviders(<ExplorerPanel explore={explore} />);
        expect(handlePreviewRange).not.toHaveBeenCalled();
    });
});
