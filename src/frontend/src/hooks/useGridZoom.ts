import { useCallback, useEffect, useRef } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { useViewport } from '@/contexts/ViewportContext';
import { computeAutoFitTransform } from './useGridZoom.helpers';

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

        const transform = computeAutoFitTransform(
            {
                wrapperW: wrapper.clientWidth,
                wrapperH: wrapper.clientHeight,
                contentW: content.offsetWidth,
                contentH: content.offsetHeight,
            },
            { isDesktop, isLandscape }
        );
        if (!transform) return;

        transformRef.current.setTransform(
            transform.x,
            transform.y,
            transform.scale,
            400,
            'easeOutQuad'
        );
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
