import { describe, it, expect } from 'vitest';
import { selectExtremeCards } from './Step1_Feedback.helpers';

const grid = [
    { score: -4 }, // col 0
    { score: -1 }, // col 1
    { score: 0 }, // col 2
    { score: 1 }, // col 3
    { score: 4 }, // col 4
];

describe('selectExtremeCards', () => {
    it('returns [] when qsort is empty', () => {
        expect(selectExtremeCards([], grid, [-4, 4])).toEqual([]);
    });

    it('returns [] when no card sits in an extreme column', () => {
        const qsort = [
            { statementId: 1, col: 1, row: 0 },
            { statementId: 2, col: 2, row: 0 },
        ];
        expect(selectExtremeCards(qsort, grid, [-4, 4])).toEqual([]);
    });

    it('keeps only cards in extreme columns', () => {
        const qsort = [
            { statementId: 1, col: 0, row: 0 },
            { statementId: 2, col: 2, row: 0 },
            { statementId: 3, col: 4, row: 0 },
        ];
        const r = selectExtremeCards(qsort, grid, [-4, 4]);
        expect(r).toHaveLength(2);
        expect(r.map((c) => c.statementId)).toEqual([1, 3]);
    });

    it('sorts by ascending column score', () => {
        const qsort = [
            { statementId: 3, col: 4, row: 0 }, // score +4
            { statementId: 1, col: 0, row: 0 }, // score -4
        ];
        const r = selectExtremeCards(qsort, grid, [-4, 4]);
        expect(r.map((c) => c.statementId)).toEqual([1, 3]);
    });

    it('within the same score, sorts by row', () => {
        const qsort = [
            { statementId: 2, col: 0, row: 1 },
            { statementId: 1, col: 0, row: 0 },
        ];
        const r = selectExtremeCards(qsort, grid, [-4, 4]);
        expect(r.map((c) => c.statementId)).toEqual([1, 2]);
    });

    it('handles cards in unknown columns (out of grid range) by skipping them', () => {
        const qsort = [
            { statementId: 1, col: 0, row: 0 },
            { statementId: 2, col: 99, row: 0 }, // bogus
        ];
        const r = selectExtremeCards(qsort, grid, [-4, 4]);
        expect(r).toHaveLength(1);
        expect(r[0]?.statementId).toBe(1);
    });

    it('respects custom extremeCols (e.g. [-3, 3] instead of defaults)', () => {
        const customGrid = [
            { score: -3 },
            { score: 0 },
            { score: 3 },
        ];
        const qsort = [
            { statementId: 1, col: 0, row: 0 },
            { statementId: 2, col: 1, row: 0 },
            { statementId: 3, col: 2, row: 0 },
        ];
        const r = selectExtremeCards(qsort, customGrid, [-3, 3]);
        expect(r.map((c) => c.statementId)).toEqual([1, 3]);
    });
});
