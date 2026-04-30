import { useCallback, useEffect, useRef } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { useViewport } from '@/contexts/ViewportContext';

interface UseGridZoomProps {
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    contentRef: React.RefObject<HTMLDivElement | null>;
    onZoomChange?: (scale: number) => void;
    onTransformChange?: () => void;
}

export const useGridZoom = ({
    wrapperRef,
    contentRef,
    onZoomChange,
    onTransformChange,
}: UseGridZoomProps) => {
    const { width, height, isDesktop, isLandscape } = useViewport();
    const transformRef = useRef<ReactZoomPanPinchRef>(null);

    const onTransformed = useCallback(
        (_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
            onZoomChange?.(state.scale);
            onTransformChange?.();
        },
        [onZoomChange, onTransformChange]
    );

    const performAutoFit = useCallback(() => {
        if (!transformRef.current || !wrapperRef.current || !contentRef.current) return;
        const wrapper = wrapperRef.current;
        const content = contentRef.current;
        const wrapperW = wrapper.clientWidth;
        const wrapperH = wrapper.clientHeight;
        const contentW = content.offsetWidth;
        const contentH = content.offsetHeight;
        if (contentW === 0 || contentH === 0) return;

        const isMobile = !isDesktop;
        const isLandscapeMobile = isMobile && isLandscape;

        let scale: number, x: number, y: number;

        if (isMobile) {
            // The zoom toolbar is positioned absolute top-4 right-4, ~60px wide.
            // Scale the grid to fit within the wrapper width MINUS the toolbar
            // footprint so column headers (e.g. "+1" on the rightmost column)
            // stay visible instead of being hidden under the toolbar. Portrait
            // only — landscape-mobile uses a different sidebar layout.
            const TOOLBAR_RESERVED_PX = isLandscapeMobile ? 0 : 64;
            const usableW = Math.max(0, wrapperW - TOOLBAR_RESERVED_PX);
            const widthScale = (usableW * 0.98) / contentW;
            const heightScale = (wrapperH * (isLandscapeMobile ? 0.95 : 0.9)) / contentH;

            if (isLandscapeMobile) {
                // Landscape mobile: fit both dimensions, center vertically
                scale = Math.min(widthScale, heightScale);
            } else {
                // Portrait mobile: fit width primarily
                scale = Math.min(widthScale, Math.max(heightScale, widthScale * 0.7));
            }

            // Center horizontally inside the usable area (excluding the
            // toolbar reserved column on portrait), so the rightmost grid
            // column never extends behind the absolute toolbar overlay.
            x = (usableW - contentW * scale) / 2;

            if (isLandscapeMobile) {
                // Center vertically in landscape
                y = (wrapperH - contentH * scale) / 2;
            } else {
                // Anchor Bottom in portrait to leave top space for numbers/text
                y = wrapperH - contentH * scale - 10;
            }
        } else {
            // Desktop: Fit both, with padding to encompass Spectrum Bar
            const padding = 70; // Reduced to 70px to increase default zoom for better readability
            const bottomLegendBuffer = 60; // Extra buffer for the bottom legend
            const availableW = wrapperW - padding;
            const availableH = wrapperH - padding - bottomLegendBuffer;

            const scaleX = availableW / contentW;
            const scaleY = availableH / contentH;

            scale = Math.min(scaleX, scaleY, 1.0); // Slight cap to prevent edge-touching

            // Center Horizontally
            x = (wrapperW - contentW * scale) / 2;

            // Center Vertically, but bias upwards slightly to ensure bottom legend is safe
            // Or just precise centering based on the calculated scale which now fits height
            y = (wrapperH - contentH * scale) / 2;

            // Ensure we don't push it off top if we have space
            if (y < 20) y = 20;
        }

        transformRef.current.setTransform(x, y, scale, 400, 'easeOutQuad');
    }, [wrapperRef, contentRef, isDesktop, isLandscape]);

    const zoomIn = useCallback(() => {
        if (!transformRef.current || !wrapperRef.current) return;

        const { scale, positionX, positionY } = transformRef.current.instance.transformState;
        const wrapper = wrapperRef.current;

        // Center of the viewport
        const cx = wrapper.clientWidth / 2;
        const cy = wrapper.clientHeight / 2;

        const newScale = Math.min(scale + 0.2, 3.0); // Max scale from TransformWrapper props
        if (newScale === scale) return;

        const ratio = newScale / scale;

        // Calculate new position to keep (cx, cy) fixed relative to the viewport
        const newX = cx - (cx - positionX) * ratio;
        const newY = cy - (cy - positionY) * ratio;

        transformRef.current.setTransform(newX, newY, newScale, 200, 'easeOutQuad');
    }, [wrapperRef]);

    const zoomOut = useCallback(() => {
        if (!transformRef.current || !wrapperRef.current) return;

        const { scale, positionX, positionY } = transformRef.current.instance.transformState;
        const wrapper = wrapperRef.current;

        // Center of the viewport
        const cx = wrapper.clientWidth / 2;
        const cy = wrapper.clientHeight / 2;

        const newScale = Math.max(scale - 0.2, 0.1); // Min scale from TransformWrapper props
        if (newScale === scale) return;

        const ratio = newScale / scale;

        // Calculate new position to keep (cx, cy) fixed relative to the viewport
        const newX = cx - (cx - positionX) * ratio;
        const newY = cy - (cy - positionY) * ratio;

        transformRef.current.setTransform(newX, newY, newScale, 200, 'easeOutQuad');
    }, [wrapperRef]);

    // Auto-fit on significant window resize (debounced)
    // Using refs to track last values across renders without re-triggering effect loop
    const lastSizeRef = useRef({ width, height });

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const widthChange = Math.abs(width - lastSizeRef.current.width);
        const heightChange = Math.abs(height - lastSizeRef.current.height);

        // Only trigger for significant changes (proportional to viewport size)
        const widthThreshold = Math.max(30, lastSizeRef.current.width * 0.08);
        const heightThreshold = Math.max(30, lastSizeRef.current.height * 0.08);
        if (widthChange > widthThreshold || heightChange > heightThreshold) {
            timeoutId = setTimeout(() => {
                performAutoFit();
                lastSizeRef.current = { width, height };
            }, 300);
        }

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [performAutoFit, width, height]);

    // Handle container visibility/resize (e.g. sidebar toggle, tab switch)
    // Only observe the wrapper — observing content triggers auto-fit on every
    // card placement because the grid layout shifts, causing annoying zoom
    // bouncing on mobile.
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        let rafId: number;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    cancelAnimationFrame(rafId);
                    // Double-rAF: useGridCalculations' ResizeObserver fires in the
                    // same batch and updates card dimensions (React state). We need
                    // to wait for React to commit that re-render so contentRef has
                    // accurate dimensions before we compute the auto-fit.
                    rafId = requestAnimationFrame(() => {
                        rafId = requestAnimationFrame(() => performAutoFit());
                    });
                    break;
                }
            }
        });

        observer.observe(wrapper);

        return () => {
            observer.disconnect();
            cancelAnimationFrame(rafId);
        };
    }, [performAutoFit, wrapperRef]);

    return {
        transformRef,
        performAutoFit,
        zoomIn,
        zoomOut,
        onTransformed,
    };
};
