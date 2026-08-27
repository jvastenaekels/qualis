import { describe, it, expect } from 'vitest';
import { compareStatementScores, getDistinguishingStars } from './StatementsTable.helpers';
import type { StatementScore } from '@/api/model';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeStmt(
    id: number,
    code: string,
    zScores: number[] = [0],
    factorArrays: number[] = [0]
): StatementScore {
    return {
        statement_id: id,
        code,
        text: `Statement ${id}`,
        z_scores: zScores,
        factor_arrays: factorArrays,
    };
}

const emptyDistinguishing = new Map<number, { significance: Record<string, string> }>();
const emptyConsensus = new Set<number>();

// ---------------------------------------------------------------------------
// compareStatementScores
// ---------------------------------------------------------------------------

describe('compareStatementScores', () => {
    it('code sort: numeric collation (S2 < S10)', () => {
        const a = makeStmt(1, 'S2');
        const b = makeStmt(2, 'S10');
        expect(
            compareStatementScores(a, b, 'code', emptyDistinguishing, emptyConsensus)
        ).toBeLessThan(0);
    });

    it('code sort: equal codes → 0', () => {
        const a = makeStmt(1, 'S1');
        const b = makeStmt(2, 'S1');
        expect(compareStatementScores(a, b, 'code', emptyDistinguishing, emptyConsensus)).toBe(0);
    });

    it('type sort: distinguishing (1) > neutral (0)', () => {
        const a = makeStmt(1, 'X');
        const b = makeStmt(2, 'Y');
        const distMap = new Map([[1, { significance: { '1-2': 'p<0.05' } }]]);
        const cmp = compareStatementScores(a, b, 'type', distMap, emptyConsensus);
        expect(cmp).toBeGreaterThan(0); // a is distinguishing, b is neutral
    });

    it('type sort: consensus (-1) < neutral (0)', () => {
        const a = makeStmt(1, 'X');
        const b = makeStmt(2, 'Y');
        const consensusSet = new Set([1]);
        const cmp = compareStatementScores(a, b, 'type', emptyDistinguishing, consensusSet);
        expect(cmp).toBeLessThan(0); // a is consensus, b is neutral
    });

    it('type sort: distinguishing vs consensus → positive', () => {
        const a = makeStmt(10, 'A');
        const b = makeStmt(20, 'B');
        const distMap = new Map([[10, { significance: { '1-2': 'p<0.01' } }]]);
        const consensusSet = new Set([20]);
        const cmp = compareStatementScores(a, b, 'type', distMap, consensusSet);
        expect(cmp).toBeGreaterThan(0);
    });

    it('z-score sort: factor 0 ascending', () => {
        const a = makeStmt(1, 'A', [1.5]);
        const b = makeStmt(2, 'B', [0.3]);
        const cmp = compareStatementScores(a, b, 'z0', emptyDistinguishing, emptyConsensus);
        expect(cmp).toBeGreaterThan(0);
    });

    it('z-score sort: equal z-scores → 0', () => {
        const a = makeStmt(1, 'A', [1.0]);
        const b = makeStmt(2, 'B', [1.0]);
        expect(compareStatementScores(a, b, 'z0', emptyDistinguishing, emptyConsensus)).toBe(0);
    });

    it('z-score sort: missing factor index falls back to 0', () => {
        const a = makeStmt(1, 'A', []); // no z_scores[5]
        const b = makeStmt(2, 'B', []);
        expect(compareStatementScores(a, b, 'z5', emptyDistinguishing, emptyConsensus)).toBe(0);
    });

    it('factor-array sort: factor 1 ascending', () => {
        const a = makeStmt(1, 'A', [0, 0], [0, 3]);
        const b = makeStmt(2, 'B', [0, 0], [0, 5]);
        const cmp = compareStatementScores(a, b, 'a1', emptyDistinguishing, emptyConsensus);
        expect(cmp).toBeLessThan(0);
    });

    it('factor-array sort: missing factor index falls back to 0', () => {
        const a = makeStmt(1, 'A', [], []);
        const b = makeStmt(2, 'B', [], []);
        expect(compareStatementScores(a, b, 'a2', emptyDistinguishing, emptyConsensus)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// getDistinguishingStars
// ---------------------------------------------------------------------------

describe('getDistinguishingStars', () => {
    it('p<0.000001 → 4 stars', () => {
        expect(getDistinguishingStars({ '1-2': 'p<0.000001' })).toBe('****');
    });

    it('p<0.001 → 3 stars', () => {
        expect(getDistinguishingStars({ '1-2': 'p<0.001' })).toBe('***');
    });

    it('p<0.01 → 2 stars', () => {
        expect(getDistinguishingStars({ '1-2': 'p<0.01' })).toBe('**');
    });

    it('p<0.05 (default) → 1 star', () => {
        expect(getDistinguishingStars({ '1-2': 'p<0.05' })).toBe('*');
    });

    it('picks the best (lowest) significance level across multiple pairs', () => {
        // One pair at p<0.001, another at p<0.05 → best is p<0.001 → 3 stars
        expect(getDistinguishingStars({ '1-2': 'p<0.05', '1-3': 'p<0.001' })).toBe('***');
    });
});
