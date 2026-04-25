import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect } from 'vitest';
import { FactorCharacteristicsTable } from './FactorCharacteristicsTable';
import type { AnalysisResult } from '@/api/model';

// ── Fixture ────────────────────────────────────────────────────────────────────
// 2 factors with distinct, recognisable values so we can assert on exact
// formatted output (toFixed precision) without floating-point ambiguity.
// correlation_matrix has one off-diagonal value > 0.5 to trigger the
// "High correlation" sr-only a11y marker.

const FIXTURE: AnalysisResult = {
    n_participants: 8,
    n_statements: 10,
    n_factors: 2,
    extraction: 'centroid',
    rotation: 'varimax',
    eigenvalues: [4.0, 2.0],
    total_variance_explained: 60.0,
    loadings: [],
    rotated_loadings: [],
    flags: [],
    participants: [],
    statement_scores: [],
    distinguishing: [],
    consensus: [],
    factor_characteristics: [
        {
            factor: 1,
            eigenvalue: 4.0,
            variance_explained: 40.0,
            cumulative_variance: 40.0,
            n_flagged: 5,
            avg_rel_coef: 0.81,
            composite_reliability: 0.85,
            se_factor_scores: 0.387,
        },
        {
            factor: 2,
            eigenvalue: 2.0,
            variance_explained: 20.0,
            cumulative_variance: 60.0,
            n_flagged: 3,
            avg_rel_coef: 0.79,
            composite_reliability: 0.721,
            se_factor_scores: 0.529,
        },
    ],
    // Off-diagonal = 0.63 → above the 0.5 threshold → "High correlation" marker
    correlation_matrix: [
        [1.0, 0.63],
        [0.63, 1.0],
    ],
};

// Empty-characteristics fixture for the empty-state test
const EMPTY_CHARS_FIXTURE: AnalysisResult = {
    ...FIXTURE,
    factor_characteristics: [],
};

// Single-factor fixture: n_factors = 1 → correlation section must not render
const SINGLE_FACTOR_FIXTURE: AnalysisResult = {
    ...FIXTURE,
    n_factors: 1,
    factor_characteristics: [FIXTURE.factor_characteristics[0]],
    correlation_matrix: [[1.0]],
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FactorCharacteristicsTable', () => {
    // ── Test 1: empty state when factor_characteristics is empty ─────────────
    it('shows an empty-state message when factor_characteristics is empty', () => {
        renderWithProviders(<FactorCharacteristicsTable result={EMPTY_CHARS_FIXTURE} />);

        expect(screen.getByText(/No factor characteristics available/i)).toBeInTheDocument();

        // The statistics table must not be rendered
        expect(screen.queryByText(/Factor Statistics/i)).not.toBeInTheDocument();
    });

    // ── Test 2: renders one column header per factor (F1, F2, …) ─────────────
    // Note: F1/F2 appear in both the stats table and the correlation matrix,
    // so we use getAllByRole and assert on count (2 tables × 1 header each = 2).
    it('renders column headers for each factor in the statistics table', () => {
        renderWithProviders(<FactorCharacteristicsTable result={FIXTURE} />);

        // 2 factors × 2 tables (stats + correlation) = 4 total F1/F2 headers
        const f1Headers = screen.getAllByRole('columnheader', { name: 'F1' });
        const f2Headers = screen.getAllByRole('columnheader', { name: 'F2' });
        expect(f1Headers.length).toBeGreaterThanOrEqual(1);
        expect(f2Headers.length).toBeGreaterThanOrEqual(1);

        // The statistics table caption is sr-only; verify it's present
        expect(
            screen.getByText(/Factor characteristics and reliability statistics/i)
        ).toBeInTheDocument();
    });

    // ── Test 3: numeric values rendered with correct precision ────────────────
    it('renders eigenvalue with 3 decimal places, variance with 1 decimal place', () => {
        renderWithProviders(<FactorCharacteristicsTable result={FIXTURE} />);

        // Eigenvalues: 4.000 and 2.000 — these exact strings only appear in the stats table
        expect(screen.getByText('4.000')).toBeInTheDocument();
        expect(screen.getByText('2.000')).toBeInTheDocument();

        // Variance explained: unique enough values
        expect(screen.getByText('20.0')).toBeInTheDocument();

        // Composite reliability: 0.850 and 0.721 — 3 dp, unique
        expect(screen.getByText('0.850')).toBeInTheDocument();
        expect(screen.getByText('0.721')).toBeInTheDocument();

        // SE of factor scores: 0.387 and 0.529 — 3 dp, unique
        expect(screen.getByText('0.387')).toBeInTheDocument();
        expect(screen.getByText('0.529')).toBeInTheDocument();
    });

    // ── Test 4: high-correlation sr-only a11y marker ──────────────────────────
    it('shows a "High correlation" sr-only span for off-diagonal values above 0.5', () => {
        renderWithProviders(<FactorCharacteristicsTable result={FIXTURE} />);

        // The correlation matrix section should be rendered (n_factors >= 2)
        expect(screen.getByText(/Factor Correlations/i)).toBeInTheDocument();

        // The sr-only High correlation text must appear (0.63 > 0.5 threshold)
        // getAllByText is used because the matrix is symmetric and both cells render it
        const markers = screen.getAllByText(/High correlation/i);
        expect(markers.length).toBeGreaterThanOrEqual(1);

        // Each marker must be a screen-reader-only element (Tailwind sr-only class)
        for (const marker of markers) {
            expect(marker).toHaveClass('sr-only');
        }
    });

    // ── Test 5: correlation section absent for a single-factor result ─────────
    it('does not render the Factor Correlations section when n_factors is 1', () => {
        renderWithProviders(<FactorCharacteristicsTable result={SINGLE_FACTOR_FIXTURE} />);

        expect(screen.queryByText(/Factor Correlations/i)).not.toBeInTheDocument();
    });

    // ── Test 6: summary footer renders totals correctly ───────────────────────
    it('renders the summary footer with total variance, method, N, and statement count', () => {
        renderWithProviders(<FactorCharacteristicsTable result={FIXTURE} />);

        // Total variance = 60.0%
        expect(screen.getByText(/60\.0%/i)).toBeInTheDocument();

        // Method line: "CENTROID + varimax"
        expect(screen.getByText(/CENTROID/i)).toBeInTheDocument();
        expect(screen.getByText(/varimax/i)).toBeInTheDocument();

        // N = 8 | 10 statements
        expect(screen.getByText(/N = 8/i)).toBeInTheDocument();
        expect(screen.getByText(/10/i)).toBeInTheDocument();
    });
});
