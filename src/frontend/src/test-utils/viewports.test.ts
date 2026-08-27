import { afterEach, describe, expect, it, vi } from 'vitest';
import { FORM_FACTORS, rotateViewport, setViewport } from './viewports';

describe('viewports test fixture helper', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('setViewport("desktop") updates window.innerWidth and dispatches a resize event', () => {
        const listener = vi.fn();
        window.addEventListener('resize', listener);

        try {
            setViewport('desktop');

            expect(window.innerWidth).toBe(1280);
            expect(listener).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener('resize', listener);
        }
    });

    it('setViewport("mobile_portrait") updates both innerWidth and innerHeight', () => {
        setViewport('mobile_portrait');

        expect(window.innerWidth).toBe(390);
        expect(window.innerHeight).toBe(844);
    });

    it('FORM_FACTORS exposes exactly the 5 named keys in the documented order', () => {
        expect(Object.keys(FORM_FACTORS)).toEqual([
            'mobile_portrait',
            'mobile_landscape',
            'tablet_portrait',
            'tablet_landscape',
            'desktop',
        ]);
    });

    it('rotateViewport applies "from" immediately and "to" after an event-loop tick', () => {
        vi.useFakeTimers();

        rotateViewport('tablet_portrait', 'tablet_landscape');

        expect(window.innerWidth).toBe(768);
        expect(window.innerHeight).toBe(1024);

        vi.runAllTimers();

        expect(window.innerWidth).toBe(1024);
        expect(window.innerHeight).toBe(768);
    });
});
