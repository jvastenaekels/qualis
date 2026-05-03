import { describe, it, expect } from 'vitest';
import { isDraftInSync } from './useStudyPersistence.helpers';

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
