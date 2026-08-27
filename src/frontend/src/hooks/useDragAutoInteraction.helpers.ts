interface TransformState {
    positionX: number;
    positionY: number;
    scale: number;
}

interface PanSpeed {
    dx: number;
    dy: number;
}

interface Dimensions {
    contentW: number;
    contentH: number;
    wrapperW: number;
    wrapperH: number;
}

interface Rect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/**
 * Compute the next clamped position for an auto-pan tick. Returns null when
 * the resulting position would equal the current one (no movement).
 *
 * @param gridRect optional grid bounding box; when the cursor is outside of
 *   it, speed is reduced to 30% (kinder when the user has moved off-grid).
 */
export function computeNextPanPosition(
    state: TransformState,
    panSpeed: PanSpeed,
    cursor: { x: number; y: number },
    dims: Dimensions,
    gridRect: Rect | null
): { x: number; y: number } | null {
    let speedFactor = 1.0;
    if (gridRect) {
        const { x, y } = cursor;
        if (x < gridRect.left || x > gridRect.right || y < gridRect.top || y > gridRect.bottom) {
            speedFactor = 0.3;
        }
    }

    const effectiveDx = panSpeed.dx * speedFactor;
    const effectiveDy = panSpeed.dy * speedFactor;

    const contentW = dims.contentW * state.scale;
    const contentH = dims.contentH * state.scale;
    const minX = dims.wrapperW - contentW - dims.wrapperW * 0.2;
    const maxX = dims.wrapperW * 0.2;
    const minY = dims.wrapperH - contentH - dims.wrapperH * 0.2;
    const maxY = dims.wrapperH * 0.2;

    const newX = Math.max(minX, Math.min(maxX, state.positionX + effectiveDx));
    const newY = Math.max(minY, Math.min(maxY, state.positionY + effectiveDy));

    if (newX === state.positionX && newY === state.positionY) return null;
    return { x: newX, y: newY };
}

/**
 * Compute the auto-pan speed when the cursor is near an edge of `rect`.
 * Returns zero speed when the cursor is in the central zone.
 */
export function computeEdgePanSpeed(x: number, y: number, rect: Rect): PanSpeed {
    const edgeThreshold = 60;
    const maxPanSpeed = 15;
    let dx = 0;
    let dy = 0;

    if (x < rect.left + edgeThreshold) {
        dx = maxPanSpeed * Math.min((rect.left + edgeThreshold - x) / edgeThreshold, 1);
    } else if (x > rect.right - edgeThreshold) {
        dx = -maxPanSpeed * Math.min((x - (rect.right - edgeThreshold)) / edgeThreshold, 1);
    }

    if (y < rect.top + edgeThreshold) {
        dy = maxPanSpeed * Math.min((rect.top + edgeThreshold - y) / edgeThreshold, 1);
    } else if (y > rect.bottom - edgeThreshold) {
        dy = -maxPanSpeed * Math.min((y - (rect.bottom - edgeThreshold)) / edgeThreshold, 1);
    }

    return { dx, dy };
}
