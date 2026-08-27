import { describe, it, expect } from 'vitest';
import { computeCardDimensions } from './useGridCalculations.helpers';

describe('computeCardDimensions', () => {
    it('returns null for zero-size wrapper', () => {
        expect(computeCardDimensions({ W: 0, H: 100 }, [{ score: 0, capacity: 5 }])).toBeNull();
        expect(computeCardDimensions({ W: 100, H: 0 }, [{ score: 0, capacity: 5 }])).toBeNull();
    });

    it('returns null for empty columns', () => {
        expect(computeCardDimensions({ W: 1000, H: 800 }, [])).toBeNull();
    });

    it('returns null when max row capacity is 0', () => {
        expect(computeCardDimensions({ W: 1000, H: 800 }, [{ score: 0, capacity: 0 }])).toBeNull();
    });

    it('clamps minimum dimensions to 140x90 on tiny screens', () => {
        const r = computeCardDimensions(
            { W: 200, H: 200 },
            Array.from({ length: 10 }, () => ({ score: 0, capacity: 10 }))
        );
        expect(r).not.toBeNull();
        if (!r) return;
        expect(r.width).toBeGreaterThanOrEqual(140);
        expect(r.height).toBeGreaterThanOrEqual(90);
    });

    it('uses clamped aspect ratio (1.2-1.8)', () => {
        const r = computeCardDimensions({ W: 4000, H: 200 }, [{ score: 0, capacity: 5 }]);
        if (!r) return;
        expect(r.width / r.height).toBeLessThanOrEqual(1.8 + 0.001);
    });

    it('respects vertical bound when content overflows height', () => {
        const r = computeCardDimensions(
            { W: 1000, H: 100 },
            Array.from({ length: 5 }, () => ({ score: 0, capacity: 10 }))
        );
        if (!r) return;
        expect(r.height).toBeGreaterThanOrEqual(90);
    });
});
