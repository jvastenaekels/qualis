import { describe, it, expect } from 'vitest';
import { isDraftInSync, resolveServerConflict } from './useStudyPersistence.helpers';

describe('isDraftInSync', () => {
    it('returns true when draft equals original', () => {
        const draft = { id: 1, title: 'a' };
        const original = { id: 1, title: 'a' };
        expect(isDraftInSync(draft, original, null)).toBe(true);
    });

    it('returns true when draft equals last saved (even if differs from original)', () => {
        const draft = { id: 1, title: 'b' };
        const original = { id: 1, title: 'a' };
        const lastSaved = JSON.stringify({ id: 1, title: 'b' });
        expect(isDraftInSync(draft, original, lastSaved)).toBe(true);
    });

    it('returns false when draft differs from both', () => {
        const draft = { id: 1, title: 'c' };
        const original = { id: 1, title: 'a' };
        const lastSaved = JSON.stringify({ id: 1, title: 'b' });
        expect(isDraftInSync(draft, original, lastSaved)).toBe(false);
    });

    it('handles null original (no server state yet)', () => {
        const draft = { id: 1, title: 'a' };
        const lastSaved = JSON.stringify({ id: 1, title: 'a' });
        expect(isDraftInSync(draft, null, lastSaved)).toBe(true);
    });

    it('handles null lastSaved', () => {
        const draft = { id: 1, title: 'a' };
        const original = { id: 1, title: 'a' };
        expect(isDraftInSync(draft, original, null)).toBe(true);
    });
});

describe('resolveServerConflict', () => {
    it('returns hard-conflict when merge fails', () => {
        const result = resolveServerConflict(
            { id: 1, title: 'local' } as unknown as Parameters<typeof resolveServerConflict>[0],
            { id: 1, title: 'server' } as unknown as Parameters<typeof resolveServerConflict>[1],
            null,
            () => ({ success: false, merged: null, warnings: [] })
        );
        expect(result.kind).toBe('hard-conflict');
    });

    it('returns merged on success', () => {
        const result = resolveServerConflict(
            { id: 1, title: 'local' } as unknown as Parameters<typeof resolveServerConflict>[0],
            { id: 1, title: 'server' } as unknown as Parameters<typeof resolveServerConflict>[1],
            null,
            () => ({ success: true, merged: { id: 1, title: 'merged' }, warnings: [] })
        );
        expect(result.kind).toBe('merged');
        if (result.kind === 'merged') {
            expect(result.merged).toEqual({ id: 1, title: 'merged' });
            expect(result.warnings).toEqual([]);
        }
    });

    it('forwards warnings on partial merge', () => {
        const result = resolveServerConflict(
            { id: 1, title: 'local' } as unknown as Parameters<typeof resolveServerConflict>[0],
            { id: 1, title: 'server' } as unknown as Parameters<typeof resolveServerConflict>[1],
            null,
            () => ({ success: true, merged: { id: 1 }, warnings: ['title'] })
        );
        if (result.kind === 'merged') {
            expect(result.warnings).toEqual(['title']);
        }
    });
});
