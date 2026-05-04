interface AutoFitDims {
    wrapperW: number;
    wrapperH: number;
    contentW: number;
    contentH: number;
}

interface Viewport {
    isDesktop: boolean;
    isLandscape: boolean;
}

interface AutoFitTransform {
    scale: number;
    x: number;
    y: number;
}

/**
 * Compute the (scale, x, y) for centering and fitting the grid content into
 * the wrapper. Branches on desktop / portrait-mobile / landscape-mobile,
 * each with empirically-tuned padding and anchoring rules. Returns null
 * when content dimensions are zero.
 */
export function computeAutoFitTransform(
    dims: AutoFitDims,
    viewport: Viewport
): AutoFitTransform | null {
    if (dims.contentW === 0 || dims.contentH === 0) return null;

    const { wrapperW, wrapperH, contentW, contentH } = dims;
    const { isDesktop, isLandscape } = viewport;
    const isMobile = !isDesktop;
    const isLandscapeMobile = isMobile && isLandscape;

    if (isMobile) {
        const widthScale = (wrapperW * 0.98) / contentW;
        const heightScale = (wrapperH * (isLandscapeMobile ? 0.95 : 0.9)) / contentH;
        const scale = isLandscapeMobile
            ? Math.min(widthScale, heightScale)
            : Math.min(widthScale, Math.max(heightScale, widthScale * 0.7));

        const x = (wrapperW - contentW * scale) / 2;
        const y = isLandscapeMobile
            ? (wrapperH - contentH * scale) / 2
            : wrapperH - contentH * scale - 10;

        return { scale, x, y };
    }

    // Desktop
    const padding = 70;
    const bottomLegendBuffer = 60;
    const availableW = wrapperW - padding;
    const availableH = wrapperH - padding - bottomLegendBuffer;
    const scale = Math.min(availableW / contentW, availableH / contentH, 1.0);
    const x = (wrapperW - contentW * scale) / 2;
    const yRaw = (wrapperH - contentH * scale) / 2;
    const y = yRaw < 20 ? 20 : yRaw;
    return { scale, x, y };
}
