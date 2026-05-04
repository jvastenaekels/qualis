/**
 * Pure helpers extracted from GridSort for testability.
 *
 * - `resolveNextSlot`: keyboard-navigation grid-cell resolver. Given the
 *   current slot id (`slot_{col}_{row}`), the pressed arrow key, the grid
 *   column shape, and whether the current sort is forced-distribution,
 *   returns the next slot's `{col, row}` or null when navigation is a no-op
 *   (unrecognised slot id, non-arrow key, or already at the edge).
 *
 * Distribution-mode behaviour:
 * - Forced: the per-column `capacity` is a hard cap on row index.
 * - Free / flexible: capacity is a soft visual hint; rows can grow beyond
 *   it (we use Number.MAX_SAFE_INTEGER as the upper bound).
 */

interface GridColumnLite {
    capacity: number;
}

const SLOT_ID_RE = /^slot_(\d+)_(\d+)$/;

/**
 * Resolve the destination slot for an arrow-key press starting from `slotId`.
 * Returns null when the navigation is a no-op (unrecognised slot id, non-
 * arrow key, or already at the edge of the grid).
 */
export function resolveNextSlot(
    slotId: string,
    key: string,
    gridColumns: GridColumnLite[],
    isForcedDistribution: boolean
): { col: number; row: number } | null {
    const match = slotId.match(SLOT_ID_RE);
    if (!match || !match[1] || !match[2]) return null;

    const col = parseInt(match[1], 10);
    const row = parseInt(match[2], 10);
    const maxCols = gridColumns.length;
    const currentColumn = gridColumns[col];
    if (!currentColumn) return null;

    let nextCol = col;
    let nextRow = row;

    switch (key) {
        case 'ArrowUp':
            nextRow = Math.max(0, row - 1);
            break;
        case 'ArrowDown': {
            const maxRowsInCol = isForcedDistribution
                ? currentColumn.capacity
                : Number.MAX_SAFE_INTEGER;
            nextRow = Math.min(maxRowsInCol - 1, row + 1);
            break;
        }
        case 'ArrowLeft':
            nextCol = Math.max(0, col - 1);
            break;
        case 'ArrowRight':
            nextCol = Math.min(maxCols - 1, col + 1);
            break;
        default:
            return null;
    }

    if (nextCol !== col) {
        const declaredCap = gridColumns[nextCol]?.capacity ?? 0;
        const newColCapacity = isForcedDistribution ? declaredCap : Number.MAX_SAFE_INTEGER;
        nextRow = Math.min(nextRow, newColCapacity - 1);
    }

    if (nextCol === col && nextRow === row) return null;
    return { col: nextCol, row: nextRow };
}
