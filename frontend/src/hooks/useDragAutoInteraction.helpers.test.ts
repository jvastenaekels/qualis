import { describe, it, expect } from 'vitest';
import { computeNextPanPosition, computeEdgePanSpeed } from './useDragAutoInteraction.helpers';

describe('computeNextPanPosition', () => {
    const dims = { contentW: 1000, contentH: 800, wrapperW: 500, wrapperH: 400 };

    it('returns null when speed is zero', () => {
        const r = computeNextPanPosition(
            { positionX: 0, positionY: 0, scale: 1 },
            { dx: 0, dy: 0 },
            { x: 250, y: 200 },
            dims,
            null
        );
        expect(r).toBeNull();
    });

    it('moves position by dx/dy at scale 1', () => {
        const r = computeNextPanPosition(
            { positionX: 0, positionY: 0, scale: 1 },
            { dx: 5, dy: 3 },
            { x: 250, y: 200 },
            dims,
            null
        );
        expect(r).toEqual({ x: 5, y: 3 });
    });

    it('clamps to wrapper - content bounds', () => {
        const r = computeNextPanPosition(
            { positionX: -10000, positionY: -10000, scale: 1 },
            { dx: -100, dy: -100 },
            { x: 250, y: 200 },
            dims,
            null
        );
        // minX = 500 - 1000*1 - 500*0.2 = -600
        expect(r?.x).toBeGreaterThanOrEqual(-600);
        expect(r?.y).toBeGreaterThanOrEqual(-480);
    });

    it('reduces speed by 0.3 when cursor is outside grid rect', () => {
        const r = computeNextPanPosition(
            { positionX: 0, positionY: 0, scale: 1 },
            { dx: 10, dy: 0 },
            { x: 1000, y: 200 }, // x > gridRect.right
            dims,
            { left: 0, right: 500, top: 0, bottom: 400 }
        );
        expect(r?.x).toBeCloseTo(3, 5); // 10 * 0.3
    });
});

describe('computeEdgePanSpeed', () => {
    const rect = { left: 0, right: 500, top: 0, bottom: 400 };

    it('returns zero speed in the center', () => {
        expect(computeEdgePanSpeed(250, 200, rect)).toEqual({ dx: 0, dy: 0 });
    });

    it('pans right when near left edge', () => {
        const { dx } = computeEdgePanSpeed(10, 200, rect);
        expect(dx).toBeGreaterThan(0);
    });

    it('pans left when near right edge', () => {
        const { dx } = computeEdgePanSpeed(495, 200, rect);
        expect(dx).toBeLessThan(0);
    });

    it('pans down when near top edge', () => {
        const { dy } = computeEdgePanSpeed(250, 10, rect);
        expect(dy).toBeGreaterThan(0);
    });

    it('pans up when near bottom edge', () => {
        const { dy } = computeEdgePanSpeed(250, 395, rect);
        expect(dy).toBeLessThan(0);
    });
});
