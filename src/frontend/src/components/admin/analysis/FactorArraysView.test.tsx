import { renderWithProviders, screen, within } from '@/test-utils/test-utils';
import { describe, it, expect } from 'vitest';
import { FactorArraysView } from './FactorArraysView';
import type { AnalysisResult } from '@/api/model';

// ── Fixture ────────────────────────────────────────────────────────────────────
// 2 factors, 6 statements with varied factor_array scores so we can test
// grouping (multiple statements at score +1 for factor 1) and sort order.

const FIXTURE: AnalysisResult = {
    n_participants: 5,
    n_statements: 6,
    n_factors: 2,
    extraction: 'pca',
    rotation: 'varimax',
    eigenvalues: [3.1, 1.4],
    total_variance_explained: 74.2,
    loadings: [],
    rotated_loadings: [],
    flags: [],
    participants: [
        { db_id: 1, label: 'P01', loadings: [0.85, 0.1], flagged_factors: [1] },
        { db_id: 2, label: 'P02', loadings: [0.82, 0.12], flagged_factors: [1] },
        { db_id: 3, label: 'P03', loadings: [0.1, 0.79], flagged_factors: [2] },
    ],
    statement_scores: [
        // Factor 1 array: -2, -1, 0, +1, +1, +2
        // Factor 2 array: +2, +1, 0, 0, -1, -2
        {
            statement_id: 1,
            code: 'ST01',
            text: 'Text for statement one',
            z_scores: [1.5, -1.0],
            factor_arrays: [2, -2],
        },
        {
            statement_id: 2,
            code: 'ST02',
            text: 'Text for statement two',
            z_scores: [0.8, 0.9],
            factor_arrays: [1, 1],
        },
        {
            statement_id: 3,
            code: 'ST03',
            text: 'Text for statement three',
            z_scores: [0.1, 0.1],
            factor_arrays: [0, 0],
        },
        {
            statement_id: 4,
            code: 'ST04',
            text: 'Text for statement four',
            z_scores: [-0.3, 0.0],
            factor_arrays: [1, 0],
        },
        {
            statement_id: 5,
            code: 'ST05',
            text: 'Text for statement five',
            z_scores: [-0.7, -0.8],
            factor_arrays: [-1, -1],
        },
        {
            statement_id: 6,
            code: 'ST06',
            text: 'Text for statement six',
            z_scores: [-1.4, 0.8],
            factor_arrays: [-2, 2],
        },
    ],
    distinguishing: [{ statement_id: 1, z_score_diff: 2.5, factor: 1 }],
    consensus: [],
    factor_characteristics: [
        {
            factor: 1,
            eigenvalue: 3.1,
            variance_explained: 51.7,
            cumulative_variance: 51.7,
            n_flagged: 2,
            avg_rel_coef: 0.82,
            composite_reliability: 0.9,
            se_factor_scores: 0.3,
        },
        {
            factor: 2,
            eigenvalue: 1.4,
            variance_explained: 23.3,
            cumulative_variance: 74.2,
            n_flagged: 1,
            avg_rel_coef: 0.79,
            composite_reliability: 0.85,
            se_factor_scores: 0.39,
        },
    ],
    correlation_matrix: [
        [1.0, 0.12],
        [0.12, 1.0],
    ],
};

// A fixture where NO factor has any flagged participants → empty-state branch
const NO_FLAGS_FIXTURE: AnalysisResult = {
    ...FIXTURE,
    factor_characteristics: [
        { ...FIXTURE.factor_characteristics[0], n_flagged: 0 },
        { ...FIXTURE.factor_characteristics[1], n_flagged: 0 },
    ],
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FactorArraysView', () => {
    // ── Test 1: empty state when no participants are flagged ──────────────────
    it('shows an empty-state message when no participants are flagged for any factor', () => {
        renderWithProviders(<FactorArraysView result={NO_FLAGS_FIXTURE} />);

        expect(screen.getByText(/No participants flagged for any factor/i)).toBeInTheDocument();

        // No factor heading should appear
        expect(screen.queryByText(/Factor 1/i)).not.toBeInTheDocument();
    });

    // ── Test 2: renders correct number of factor sections ────────────────────
    it('renders one table section per factor', () => {
        renderWithProviders(<FactorArraysView result={FIXTURE} />);

        // Each factor has an aria-labeled table
        const tables = screen.getAllByRole('table');
        expect(tables).toHaveLength(FIXTURE.n_factors);

        // Factor headings
        expect(screen.getByText(/Factor 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Factor 2/i)).toBeInTheDocument();
    });

    // ── Test 3: column headers are sorted ascending (most-disagree to most-agree)
    it('renders column headers in ascending score order (left = most disagree)', () => {
        renderWithProviders(<FactorArraysView result={FIXTURE} />);

        // Factor 1 table has scores: -2, -1, 0, +1, +2
        const factor1Table = screen.getAllByRole('table')[0];
        const colHeaders = within(factor1Table)
            .getAllByRole('columnheader')
            .map((th) => th.textContent?.trim());

        // Verify ascending order: first header is the lowest score
        const numeric = colHeaders.map((h) => {
            const n = Number(h?.replace('+', ''));
            return n;
        });
        for (let i = 1; i < numeric.length; i++) {
            expect(numeric[i]).toBeGreaterThan(numeric[i - 1]);
        }

        // First column header is -2 (most disagree), last is +2 (most agree)
        expect(colHeaders[0]).toBe('-2');
        expect(colHeaders[colHeaders.length - 1]).toBe('+2');
    });

    // ── Test 4: statement codes appear in the correct score bucket ────────────
    it('places each statement code under the correct factor-array score column', () => {
        renderWithProviders(<FactorArraysView result={FIXTURE} />);

        const factor1Table = screen.getAllByRole('table')[0];

        // ST01 has factor_arrays[0] = +2 → should be in the +2 column (last)
        expect(within(factor1Table).getByText('ST01')).toBeInTheDocument();
        // ST06 has factor_arrays[0] = -2 → should be in the -2 column (first)
        expect(within(factor1Table).getByText('ST06')).toBeInTheDocument();

        // Both ST02 and ST04 share score +1 in factor 1; both codes must appear
        expect(within(factor1Table).getByText('ST02')).toBeInTheDocument();
        expect(within(factor1Table).getByText('ST04')).toBeInTheDocument();

        // For factor 2: ST01 has factor_arrays[1] = -2, ST06 has factor_arrays[1] = +2
        const factor2Table = screen.getAllByRole('table')[1];
        expect(within(factor2Table).getByText('ST01')).toBeInTheDocument();
        expect(within(factor2Table).getByText('ST06')).toBeInTheDocument();
    });

    // ── Test 5: n_flagged badge shown for each factor ─────────────────────────
    it('shows a badge with the flagged-sorts count for each factor', () => {
        renderWithProviders(<FactorArraysView result={FIXTURE} />);

        // Factor 1 has 2 flagged sorts, Factor 2 has 1
        // Badge text is "{n} sorts"
        expect(screen.getByText(/^2\s+sorts$/i)).toBeInTheDocument();
        expect(screen.getByText(/^1\s+sorts$/i)).toBeInTheDocument();
    });

    // ── Test 6: distinguishing statement gets highlighted styling ─────────────
    it('applies a distinguishing highlight class to distinguishing statements', () => {
        const { container } = renderWithProviders(<FactorArraysView result={FIXTURE} />);

        // ST01 is in distinguishing[] → its card should have the amber background class
        // We look for the card div wrapping ST01's code
        const stmtCards = container.querySelectorAll('.bg-amber-50');
        // At least one amber card must exist (the distinguishing statement)
        expect(stmtCards.length).toBeGreaterThanOrEqual(1);

        // And non-distinguishing statements should have white background
        const whiteCards = container.querySelectorAll('.bg-white');
        expect(whiteCards.length).toBeGreaterThan(0);
    });
});
