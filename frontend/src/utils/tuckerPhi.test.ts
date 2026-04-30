import { describe, it, expect } from 'vitest';
import { tuckerPhi, matchFactorsByPhi } from './tuckerPhi';

describe('tuckerPhi', () => {
    it('returns 1 for identical vectors', () => {
        expect(tuckerPhi([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
    });

    it('returns -1 for opposite vectors', () => {
        expect(tuckerPhi([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
        expect(tuckerPhi([1, 0], [0, 1])).toBeCloseTo(0, 5);
    });

    it('returns 0 for zero vectors (degenerate)', () => {
        expect(tuckerPhi([0, 0, 0], [1, 2, 3])).toBe(0);
    });

    it('throws on length mismatch', () => {
        expect(() => tuckerPhi([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
    });
});

describe('matchFactorsByPhi', () => {
    it('matches identical solutions one-to-one', () => {
        const a = [
            [1, 0],
            [0, 1],
            [1, 0],
        ]; // 3 statements x 2 factors
        const b = [
            [1, 0],
            [0, 1],
            [1, 0],
        ];
        const matches = matchFactorsByPhi(a, b);
        expect(matches).toHaveLength(2);
        expect(matches[0]).toMatchObject({ aIndex: 0, bIndex: 0 });
        expect(matches[0]?.phi).toBeCloseTo(1, 5);
        expect(matches[1]).toMatchObject({ aIndex: 1, bIndex: 1 });
        expect(matches[1]?.phi).toBeCloseTo(1, 5);
    });

    it('preserves sign — flipped factor matches with negative phi', () => {
        const a = [
            [1, 0],
            [0, 1],
        ];
        const b = [
            [-1, 0],
            [0, 1],
        ]; // first factor sign-flipped
        const matches = matchFactorsByPhi(a, b);
        expect(matches[0]).toMatchObject({ aIndex: 0, bIndex: 0 });
        expect(matches[0]?.phi).toBeCloseTo(-1, 5);
    });

    it('handles different n_factors by leaving extra columns unmatched', () => {
        const a = [
            [1, 0],
            [0, 1],
        ];
        const b = [
            [1, 0, 0],
            [0, 1, 0],
        ];
        const matches = matchFactorsByPhi(a, b);
        expect(matches).toHaveLength(2); // a has 2 factors → 2 matches
    });

    it('returns empty array on empty input', () => {
        expect(matchFactorsByPhi([], [])).toEqual([]);
    });

    it('greedy assignment does not reuse a B factor', () => {
        // Two identical A factors; B has only one. The first A wins it; the
        // second A finds no remaining B factor and gets no match.
        const a = [[1, 1]]; // 1 statement x 2 factors, both identical
        const b = [[1]]; // 1 statement x 1 factor
        const matches = matchFactorsByPhi(a, b);
        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ aIndex: 0, bIndex: 0 });
    });
});
