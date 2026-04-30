import { describe, expect, it } from 'vitest';
import { getEnabledSteps, getStepInfo, getStepLabels, mapPersistedStepToKey } from './studySteps';

const baseStudy = (overrides: Partial<{ rough_sort_enabled: boolean }> = {}) =>
    ({
        rough_sort_enabled: true,
        ...overrides,
        // biome-ignore lint/suspicious/noExplicitAny: minimal study shape for tests
    }) as any;

describe('getEnabledSteps', () => {
    it('returns 5 steps when rough_sort_enabled=true', () => {
        const steps = getEnabledSteps(baseStudy({ rough_sort_enabled: true }));
        expect(steps.map((s) => s.key)).toEqual(['consent', 'presort', 'rough', 'fine', 'post']);
    });

    it('returns 4 steps when rough_sort_enabled=false', () => {
        const steps = getEnabledSteps(baseStudy({ rough_sort_enabled: false }));
        expect(steps.map((s) => s.key)).toEqual(['consent', 'presort', 'fine', 'post']);
    });

    it('progress percentage is evenly distributed in 4-step mode', () => {
        const steps = getEnabledSteps(baseStudy({ rough_sort_enabled: false }));
        expect(steps.map((s) => s.progressPct)).toEqual([25, 50, 75, 100]);
    });

    it('progress percentage in 5-step mode hits 20/40/60/80/100', () => {
        const steps = getEnabledSteps(baseStudy({ rough_sort_enabled: true }));
        expect(steps.map((s) => s.progressPct)).toEqual([20, 40, 60, 80, 100]);
    });

    it('persistedNumber matches the canonical step indexing in both modes', () => {
        const stepsEnabled = getEnabledSteps(baseStudy({ rough_sort_enabled: true }));
        expect(stepsEnabled.find((s) => s.key === 'fine')?.persistedNumber).toBe(4);
        expect(stepsEnabled.find((s) => s.key === 'post')?.persistedNumber).toBe(5);

        const stepsDisabled = getEnabledSteps(baseStudy({ rough_sort_enabled: false }));
        expect(stepsDisabled.find((s) => s.key === 'fine')?.persistedNumber).toBe(4);
        expect(stepsDisabled.find((s) => s.key === 'post')?.persistedNumber).toBe(5);
    });

    it('every descriptor has labelKey and labelDefault', () => {
        for (const desc of getEnabledSteps(baseStudy())) {
            expect(desc.labelKey).toMatch(/^admin\.data\.step\./);
            expect(desc.labelDefault).toBeTruthy();
        }
    });
});

describe('mapPersistedStepToKey', () => {
    it('maps step 3 to rough when enabled', () => {
        expect(mapPersistedStepToKey(3, baseStudy({ rough_sort_enabled: true }))).toBe('rough');
    });

    it('maps step 3 to fine when rough is disabled (skipped step fallback)', () => {
        expect(mapPersistedStepToKey(3, baseStudy({ rough_sort_enabled: false }))).toBe('fine');
    });

    it('maps each enabled step number to its key', () => {
        const study = baseStudy({ rough_sort_enabled: true });
        expect(mapPersistedStepToKey(1, study)).toBe('consent');
        expect(mapPersistedStepToKey(2, study)).toBe('presort');
        expect(mapPersistedStepToKey(4, study)).toBe('fine');
        expect(mapPersistedStepToKey(5, study)).toBe('post');
    });

    it('maps each enabled step number to its key (deck mode)', () => {
        const study = baseStudy({ rough_sort_enabled: false });
        expect(mapPersistedStepToKey(1, study)).toBe('consent');
        expect(mapPersistedStepToKey(2, study)).toBe('presort');
        expect(mapPersistedStepToKey(4, study)).toBe('fine');
        expect(mapPersistedStepToKey(5, study)).toBe('post');
    });

    it('returns null for unknown step number', () => {
        expect(mapPersistedStepToKey(99, baseStudy())).toBeNull();
        expect(mapPersistedStepToKey(0, baseStudy())).toBeNull();
    });
});

describe('getStepLabels', () => {
    const FILTER_KEYS = new Set(['presort', 'rough', 'fine', 'post'] as const);

    it('returns 4 entries when rough enabled (presort + rough + fine + post)', () => {
        const labels = getStepLabels(baseStudy({ rough_sort_enabled: true }), FILTER_KEYS);
        expect(Object.keys(labels).map(Number).sort()).toEqual([2, 3, 4, 5]);
        expect(labels[3]).toEqual(['admin.data.step.rough', 'Preliminary sort']);
    });

    it('omits step 3 when rough disabled', () => {
        const labels = getStepLabels(baseStudy({ rough_sort_enabled: false }), FILTER_KEYS);
        expect(Object.keys(labels).map(Number).sort()).toEqual([2, 4, 5]);
        expect(labels[3]).toBeUndefined();
    });

    it('respects the keys filter', () => {
        const labels = getStepLabels(baseStudy(), new Set(['fine'] as const));
        expect(Object.keys(labels)).toEqual(['4']);
    });
});

describe('getStepInfo', () => {
    it('returns label + progress for an enabled step (rough mode)', () => {
        const info = getStepInfo(baseStudy({ rough_sort_enabled: true }), 4);
        expect(info).toEqual({
            labelKey: 'admin.data.step.fine',
            labelDefault: 'Q-sort',
            progress: 80,
        });
    });

    it('progress reflects 4-step distribution when rough disabled', () => {
        const info = getStepInfo(baseStudy({ rough_sort_enabled: false }), 4);
        expect(info?.progress).toBe(75);
    });

    it('returns null for a structurally-disabled step', () => {
        expect(getStepInfo(baseStudy({ rough_sort_enabled: false }), 3)).toBeNull();
    });

    it('returns null for an out-of-range step', () => {
        expect(getStepInfo(baseStudy(), 99)).toBeNull();
    });
});
