import { describe, it, expect } from 'vitest';
import { computeAutoFitTransform } from './useGridZoom.helpers';

const wrapperDims = { wrapperW: 500, wrapperH: 800, contentW: 1000, contentH: 600 };

describe('computeAutoFitTransform', () => {
    it('returns null when content has zero size', () => {
        expect(
            computeAutoFitTransform(
                { ...wrapperDims, contentW: 0 },
                { isDesktop: true, isLandscape: false }
            )
        ).toBeNull();
    });

    it('portrait mobile: anchors bottom with 10px margin', () => {
        const r = computeAutoFitTransform(wrapperDims, { isDesktop: false, isLandscape: false });
        expect(r).not.toBeNull();
        if (!r) return;
        expect(r.y).toBeCloseTo(800 - 600 * r.scale - 10, 1);
    });

    it('landscape mobile: centers vertically', () => {
        const r = computeAutoFitTransform(wrapperDims, { isDesktop: false, isLandscape: true });
        if (!r) return;
        expect(r.y).toBeCloseTo((800 - 600 * r.scale) / 2, 1);
    });

    it('desktop: caps scale at 1.0', () => {
        const r = computeAutoFitTransform(
            { wrapperW: 500, wrapperH: 800, contentW: 100, contentH: 60 },
            { isDesktop: true, isLandscape: false }
        );
        expect(r?.scale).toBe(1.0);
    });

    it('desktop: enforces minimum y of 20', () => {
        const r = computeAutoFitTransform(
            { wrapperW: 500, wrapperH: 100, contentW: 100, contentH: 60 },
            { isDesktop: true, isLandscape: false }
        );
        if (!r) return;
        expect(r.y).toBeGreaterThanOrEqual(20);
    });

    it('mobile: x is centered horizontally', () => {
        const r = computeAutoFitTransform(wrapperDims, { isDesktop: false, isLandscape: false });
        if (!r) return;
        expect(r.x).toBeCloseTo((500 - 1000 * r.scale) / 2, 1);
    });
});
