import { describe, it, expect } from 'vitest';
import {
    computeAutoShapedCapacities,
    mergeParsedItemIntoStatements,
} from './QSortEditor.helpers';

describe('computeAutoShapedCapacities', () => {
    it('returns [] when numColumns is 0', () => {
        expect(computeAutoShapedCapacities(40, 0)).toEqual([]);
    });

    it('returns all-zeros when N is 0', () => {
        expect(computeAutoShapedCapacities(0, 5)).toEqual([0, 0, 0, 0, 0]);
    });

    it('total of capacities equals N (odd cols, N=40)', () => {
        const r = computeAutoShapedCapacities(40, 7);
        expect(r.reduce((a, b) => a + b, 0)).toBe(40);
    });

    it('total of capacities equals N (even cols, N=40)', () => {
        const r = computeAutoShapedCapacities(40, 6);
        expect(r.reduce((a, b) => a + b, 0)).toBe(40);
    });

    it('total of capacities equals N (odd cols, N=20 — small but ≥numCols)', () => {
        const r = computeAutoShapedCapacities(20, 5);
        expect(r.reduce((a, b) => a + b, 0)).toBe(20);
    });

    it('total of capacities equals N (N<numCols — minPerCol=0)', () => {
        const r = computeAutoShapedCapacities(3, 5);
        expect(r.reduce((a, b) => a + b, 0)).toBe(3);
    });

    it('total of capacities equals N for various N×cols', () => {
        for (const N of [9, 11, 16, 24, 30, 41, 60, 100]) {
            for (const cols of [3, 5, 7, 9, 11]) {
                const r = computeAutoShapedCapacities(N, cols);
                expect(r.reduce((a, b) => a + b, 0)).toBe(N);
                expect(r).toHaveLength(cols);
            }
        }
    });

    it('produces a symmetric (mirrored) distribution for odd columns when N is even', () => {
        const r = computeAutoShapedCapacities(40, 7);
        // Mirror around center: r[0]==r[6], r[1]==r[5], r[2]==r[4]
        expect(r[0]).toBe(r[6]);
        expect(r[1]).toBe(r[5]);
        expect(r[2]).toBe(r[4]);
    });

    it('produces a symmetric distribution for even columns when N is even', () => {
        const r = computeAutoShapedCapacities(40, 6);
        expect(r[0]).toBe(r[5]);
        expect(r[1]).toBe(r[4]);
        expect(r[2]).toBe(r[3]);
    });

    it('center column has the largest capacity for odd cols', () => {
        const r = computeAutoShapedCapacities(40, 7);
        const centerIdx = 3;
        const center = r[centerIdx] ?? 0;
        for (let i = 0; i < r.length; i++) {
            if (i === centerIdx) continue;
            expect(center).toBeGreaterThanOrEqual(r[i] ?? 0);
        }
    });

    it('extreme columns have the smallest capacity (monotone non-increasing toward edges)', () => {
        const r = computeAutoShapedCapacities(40, 7);
        // Going from center to edge, capacity should not increase.
        expect(r[3] ?? 0).toBeGreaterThanOrEqual(r[2] ?? 0);
        expect(r[2] ?? 0).toBeGreaterThanOrEqual(r[1] ?? 0);
        expect(r[1] ?? 0).toBeGreaterThanOrEqual(r[0] ?? 0);
    });

    it('respects minPerCol=2 baseline when N>=40', () => {
        const r = computeAutoShapedCapacities(40, 7);
        for (const c of r) expect(c).toBeGreaterThanOrEqual(2);
    });

    it('respects minPerCol=1 baseline when 1<=numCols<=N<40', () => {
        const r = computeAutoShapedCapacities(20, 7);
        for (const c of r) expect(c).toBeGreaterThanOrEqual(1);
    });

    it('handles N<numCols with sparse non-zero columns (sum still N)', () => {
        const r = computeAutoShapedCapacities(2, 7);
        expect(r.reduce((a, b) => a + b, 0)).toBe(2);
        expect(r).toHaveLength(7);
    });

    it('handles N=1 (single statement → centre column)', () => {
        const r = computeAutoShapedCapacities(1, 5);
        expect(r.reduce((a, b) => a + b, 0)).toBe(1);
        // The lone statement should land on the centre (index 2) for odd cols.
        expect(r[2]).toBe(1);
    });
});

describe('mergeParsedItemIntoStatements', () => {
    const draftLangs = [{ language_code: 'en' }, { language_code: 'fr' }];

    it('append mode: adds new statement with seeded translations (active locale gets item.text)', () => {
        const statements: { code: string; translations: { language_code: string; text: string }[] }[] = [];
        mergeParsedItemIntoStatements(
            { code: 'S1', text: 'Hello' },
            statements,
            draftLangs,
            'append',
            'en'
        );
        expect(statements).toHaveLength(1);
        expect(statements[0]?.code).toBe('S1');
        expect(statements[0]?.translations).toEqual([
            { language_code: 'en', text: 'Hello' },
            { language_code: 'fr', text: '' },
        ]);
    });

    it('append mode: assigns auto-generated code when item.code is missing', () => {
        const statements = [{ code: 'A', translations: [] }];
        mergeParsedItemIntoStatements(
            { text: 'New' },
            statements,
            draftLangs,
            'append',
            'en'
        );
        expect(statements).toHaveLength(2);
        expect(statements[1]?.code).toBe('s2');
    });

    it('append mode: per-language translations override the item.text fallback', () => {
        const statements: { code: string; translations: { language_code: string; text: string }[] }[] = [];
        mergeParsedItemIntoStatements(
            {
                code: 'S1',
                text: 'fallback',
                translations: [
                    { language_code: 'en', text: 'English' },
                    { language_code: 'fr', text: 'Français' },
                ],
            },
            statements,
            draftLangs,
            'append',
            'en'
        );
        expect(statements[0]?.translations).toEqual([
            { language_code: 'en', text: 'English' },
            { language_code: 'fr', text: 'Français' },
        ]);
    });

    it('sync mode: matching code updates existing translation in active locale', () => {
        const statements = [
            {
                code: 'S1',
                translations: [
                    { language_code: 'en', text: 'old' },
                    { language_code: 'fr', text: 'ancien' },
                ],
            },
        ];
        mergeParsedItemIntoStatements(
            { code: 'S1', text: 'new' },
            statements,
            draftLangs,
            'sync',
            'en'
        );
        expect(statements).toHaveLength(1);
        expect(statements[0]?.translations[0]?.text).toBe('new');
        expect(statements[0]?.translations[1]?.text).toBe('ancien');
    });

    it('sync mode: matching code with item.translations updates per-language', () => {
        const statements = [
            {
                code: 'S1',
                translations: [
                    { language_code: 'en', text: 'old en' },
                    { language_code: 'fr', text: 'old fr' },
                ],
            },
        ];
        mergeParsedItemIntoStatements(
            {
                code: 'S1',
                translations: [
                    { language_code: 'en', text: 'new en' },
                    { language_code: 'fr', text: 'new fr' },
                ],
            },
            statements,
            draftLangs,
            'sync',
            'en'
        );
        expect(statements[0]?.translations[0]?.text).toBe('new en');
        expect(statements[0]?.translations[1]?.text).toBe('new fr');
    });

    it('sync mode: non-matching code creates a new statement', () => {
        const statements = [{ code: 'S1', translations: [] }];
        mergeParsedItemIntoStatements(
            { code: 'S2', text: 'hello' },
            statements,
            draftLangs,
            'sync',
            'en'
        );
        expect(statements).toHaveLength(2);
        expect(statements[1]?.code).toBe('S2');
    });

    it('sync mode: existing match without translations on it gets the active-locale entry pushed', () => {
        const statements = [{ code: 'S1', translations: [] }];
        mergeParsedItemIntoStatements(
            { code: 'S1', text: 'late binding' },
            statements,
            draftLangs,
            'sync',
            'en'
        );
        expect(statements[0]?.translations).toHaveLength(1);
        expect(statements[0]?.translations[0]).toEqual({ language_code: 'en', text: 'late binding' });
    });

    it('sync mode: per-language item.translations adds missing language entry to existing', () => {
        const statements = [
            { code: 'S1', translations: [{ language_code: 'en', text: 'old' }] },
        ];
        mergeParsedItemIntoStatements(
            {
                code: 'S1',
                translations: [{ language_code: 'fr', text: 'nouveau' }],
            },
            statements,
            draftLangs,
            'sync',
            'en'
        );
        expect(statements[0]?.translations).toHaveLength(2);
        expect(statements[0]?.translations[1]).toEqual({ language_code: 'fr', text: 'nouveau' });
    });
});
