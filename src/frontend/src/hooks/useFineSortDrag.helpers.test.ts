import { describe, it, expect } from 'vitest';
import { resolveDropTarget } from './useFineSortDrag.helpers';

describe('resolveDropTarget', () => {
    const qsort = [
        { statementId: 42, col: 3, row: 2 },
        { statementId: 99, col: 5, row: 1 },
    ];

    it('decodes a deck drop with category prefix', () => {
        expect(resolveDropTarget('deck-agree', qsort)).toEqual({
            kind: 'deck',
            category: 'agree',
        });
    });

    it('decodes a deck-area drop (deck-area-disagree)', () => {
        expect(resolveDropTarget('deck-area-disagree', qsort)).toEqual({
            kind: 'deck',
            category: 'disagree',
        });
    });

    it('decodes a slot drop', () => {
        expect(resolveDropTarget('slot_3_2', qsort)).toEqual({
            kind: 'slot',
            col: 3,
            row: 2,
        });
    });

    it('resolves a card-on-card drop to the underlying card slot', () => {
        expect(resolveDropTarget('42', qsort)).toEqual({
            kind: 'slot',
            col: 3,
            row: 2,
        });
    });

    it('returns kind:none for an unrecognized overId with no matching card', () => {
        expect(resolveDropTarget('1234', qsort)).toEqual({ kind: 'none' });
    });

    it('returns kind:none for a malformed slot id', () => {
        expect(resolveDropTarget('slot_x_y', qsort)).toEqual({ kind: 'none' });
    });
});
