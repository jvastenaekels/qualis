import { describe, it, expect } from 'vitest';
import { resolveNextSlot } from './GridSort.helpers';

const cols = [
    { capacity: 3 }, // col 0
    { capacity: 5 }, // col 1
    { capacity: 5 }, // col 2
    { capacity: 3 }, // col 3
];

describe('resolveNextSlot', () => {
    it('returns null for unrecognised slot id', () => {
        expect(resolveNextSlot('not-a-slot', 'ArrowUp', cols, true)).toBeNull();
        expect(resolveNextSlot('slot_x_y', 'ArrowUp', cols, true)).toBeNull();
    });

    it('returns null for non-arrow keys', () => {
        expect(resolveNextSlot('slot_1_1', 'Enter', cols, true)).toBeNull();
        expect(resolveNextSlot('slot_1_1', 'Tab', cols, true)).toBeNull();
    });

    it('returns null when source col is out of range', () => {
        expect(resolveNextSlot('slot_99_0', 'ArrowUp', cols, true)).toBeNull();
    });

    it('ArrowUp moves up one row, clamped at 0', () => {
        expect(resolveNextSlot('slot_1_2', 'ArrowUp', cols, true)).toEqual({ col: 1, row: 1 });
        expect(resolveNextSlot('slot_1_0', 'ArrowUp', cols, true)).toBeNull();
    });

    it('ArrowDown moves down one row in forced mode, clamped at capacity-1', () => {
        expect(resolveNextSlot('slot_1_2', 'ArrowDown', cols, true)).toEqual({ col: 1, row: 3 });
        // At capacity-1 already, no movement
        expect(resolveNextSlot('slot_1_4', 'ArrowDown', cols, true)).toBeNull();
    });

    it('ArrowDown allows growth beyond capacity in free/flexible mode', () => {
        expect(resolveNextSlot('slot_1_4', 'ArrowDown', cols, false)).toEqual({
            col: 1,
            row: 5,
        });
        expect(resolveNextSlot('slot_0_2', 'ArrowDown', cols, false)).toEqual({
            col: 0,
            row: 3,
        });
    });

    it('ArrowLeft moves left one col, row clamped to new column capacity (forced)', () => {
        // From col 1 row 4 → col 0 with capacity 3 → row clamped to 2
        expect(resolveNextSlot('slot_1_4', 'ArrowLeft', cols, true)).toEqual({ col: 0, row: 2 });
        // From col 1 row 0 → col 0 row 0 (no clamp needed)
        expect(resolveNextSlot('slot_1_0', 'ArrowLeft', cols, true)).toEqual({ col: 0, row: 0 });
    });

    it('ArrowLeft from col 0 is a no-op', () => {
        expect(resolveNextSlot('slot_0_0', 'ArrowLeft', cols, true)).toBeNull();
    });

    it('ArrowRight moves right one col, clamps row to new col capacity', () => {
        // From col 2 row 4 → col 3 with capacity 3 → row clamped to 2
        expect(resolveNextSlot('slot_2_4', 'ArrowRight', cols, true)).toEqual({ col: 3, row: 2 });
    });

    it('ArrowRight from last col is a no-op', () => {
        expect(resolveNextSlot('slot_3_0', 'ArrowRight', cols, true)).toBeNull();
    });

    it('horizontal nav in free mode does not clamp row', () => {
        // From col 1 row 10 → col 2 (capacity 5) but free mode → no clamp
        expect(resolveNextSlot('slot_1_10', 'ArrowRight', cols, false)).toEqual({
            col: 2,
            row: 10,
        });
    });
});
