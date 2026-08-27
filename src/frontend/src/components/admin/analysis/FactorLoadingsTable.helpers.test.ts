import { describe, it, expect } from 'vitest';
import { compareParticipantLoadings } from './FactorLoadingsTable.helpers';
import type { ParticipantLoading } from '@/api/model';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeParticipant(
    id: number,
    label: string,
    loadings: number[] = [],
    flaggedFactors?: number[]
): ParticipantLoading {
    return {
        db_id: id,
        label,
        loadings,
        flagged_factors: flaggedFactors,
    };
}

// ---------------------------------------------------------------------------
// compareParticipantLoadings
// ---------------------------------------------------------------------------

describe('compareParticipantLoadings', () => {
    it('label sort: alphabetical order (a < b)', () => {
        const a = makeParticipant(1, 'Alice');
        const b = makeParticipant(2, 'Bob');
        expect(compareParticipantLoadings(a, b, 'label')).toBeLessThan(0);
    });

    it('label sort: equal labels → 0', () => {
        const a = makeParticipant(1, 'Alice');
        const b = makeParticipant(2, 'Alice');
        expect(compareParticipantLoadings(a, b, 'label')).toBe(0);
    });

    it('label sort: reverse alphabetical order (b > a)', () => {
        const a = makeParticipant(1, 'Zara');
        const b = makeParticipant(2, 'Alice');
        expect(compareParticipantLoadings(a, b, 'label')).toBeGreaterThan(0);
    });

    it('flagged sort: participant with flagged factor sorts after one without', () => {
        const a = makeParticipant(1, 'A', [], undefined); // no flagged factors
        const b = makeParticipant(2, 'B', [], [2]); // flagged factor 2
        expect(compareParticipantLoadings(a, b, 'flagged')).toBeLessThan(0);
    });

    it('flagged sort: equal first flagged factor → 0', () => {
        const a = makeParticipant(1, 'A', [], [1]);
        const b = makeParticipant(2, 'B', [], [1]);
        expect(compareParticipantLoadings(a, b, 'flagged')).toBe(0);
    });

    it('flagged sort: no flagged factors treated as 0', () => {
        const a = makeParticipant(1, 'A', [], undefined);
        const b = makeParticipant(2, 'B', [], undefined);
        expect(compareParticipantLoadings(a, b, 'flagged')).toBe(0);
    });

    it('factor sort (index 0): lower loading sorts before higher', () => {
        const a = makeParticipant(1, 'A', [0.3]);
        const b = makeParticipant(2, 'B', [0.8]);
        expect(compareParticipantLoadings(a, b, 0)).toBeLessThan(0);
    });

    it('factor sort (index 1): equal loadings → 0', () => {
        const a = makeParticipant(1, 'A', [0.5, 0.4]);
        const b = makeParticipant(2, 'B', [0.5, 0.4]);
        expect(compareParticipantLoadings(a, b, 1)).toBe(0);
    });

    it('factor sort: missing factor index falls back to 0', () => {
        const a = makeParticipant(1, 'A', []); // no loadings[5]
        const b = makeParticipant(2, 'B', []); // no loadings[5]
        expect(compareParticipantLoadings(a, b, 5)).toBe(0);
    });

    it('factor sort: one missing factor treated as 0', () => {
        const a = makeParticipant(1, 'A', []); // loadings[2] is undefined → 0
        const b = makeParticipant(2, 'B', [0, 0, 0.5]); // loadings[2] = 0.5
        expect(compareParticipantLoadings(a, b, 2)).toBeLessThan(0);
    });
});
