interface GridColumn {
    score: number;
    capacity: number;
}

const GAP = 8;
const PADDING_X = 32;
const PADDING_Y = 32;
const MIN_W = 140;
const MIN_H = 90;
const MIN_RATIO = 1.2;
const MAX_RATIO = 1.8;

/**
 * Compute clamped card width/height that fit `gridColumns` within the
 * wrapper. Returns null on degenerate input (zero size, no columns,
 * zero-capacity columns).
 */
export function computeCardDimensions(
    wrapper: { W: number; H: number },
    gridColumns: GridColumn[]
): { width: number; height: number } | null {
    const { W, H } = wrapper;
    if (W === 0 || H === 0) return null;
    const numCols = gridColumns.length;
    if (numCols === 0) return null;
    const maxRows = Math.max(...gridColumns.map((c) => c.capacity || 0));
    if (maxRows === 0) return null;

    const availableW = W - PADDING_X - (numCols - 1) * GAP;
    const availableH = H - PADDING_Y - (maxRows - 1) * GAP;
    if (availableW <= 0 || availableH <= 0) return null;

    const rawW = availableW / numCols;
    const rawH = availableH / maxRows;
    const ratio = Math.max(MIN_RATIO, Math.min(rawW / rawH, MAX_RATIO));

    let width = rawW;
    let height = rawW / ratio;
    if (height > rawH) {
        height = rawH;
        width = height * ratio;
    }

    width = Math.max(width, MIN_W);
    height = Math.max(height, MIN_H);
    return { width, height };
}
