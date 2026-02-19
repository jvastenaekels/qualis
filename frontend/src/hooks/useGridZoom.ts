import { useCallback, useEffect, useRef } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { useViewport } from '@/contexts/ViewportContext';

interface UseGridZoomProps {
    wrapperRef: React.RefObject<HTMLDivElement | null>;
    contentRef: React.RefObject<HTMLDivElement | null>;
    pyramidRef: React.RefObject<HTMLDivElement | null>;
    gridColumns: { score: number; capacity: number }[];
    activePile: 'agree' | 'disagree' | 'neutral';
    activePileCount: number;
    hasPerformedZonalFocus: boolean;
    setHasPerformedZonalFocus: (val: boolean) => void;
    onZoomChange?: (scale: number) => void;
    onTransformChange?: () => void;
}

export const useGridZoom = ({
    wrapperRef,
    contentRef,
    pyramidRef,
    gridColumns,
    activePile,
    activePileCount,
    hasPerformedZonalFocus,
    setHasPerformedZonalFocus,
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
            const widthScale = (wrapperW * 0.98) / contentW;
            const heightScale = (wrapperH * (isLandscapeMobile ? 0.95 : 0.9)) / contentH;

            if (isLandscapeMobile) {
                // Landscape mobile: fit both dimensions, center vertically
                scale = Math.min(widthScale, heightScale);
            } else {
                // Portrait mobile: fit width primarily
                scale = Math.min(widthScale, Math.max(heightScale, widthScale * 0.7));
            }

            // Center Horizontally
            x = (wrapperW - contentW * scale) / 2;

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

    // Handle container visibility/resize and content size changes
    // Consolidated into a single observer to avoid redundant autoFit calls per frame
    useEffect(() => {
        const wrapper = wrapperRef.current;
        const content = contentRef.current;
        if (!wrapper && !content) return;

        let rafId: number;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                    cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(() => performAutoFit());
                    break;
                }
            }
        });

        if (wrapper) observer.observe(wrapper);
        if (content) observer.observe(content);

        return () => {
            observer.disconnect();
            cancelAnimationFrame(rafId);
        };
    }, [performAutoFit, wrapperRef, contentRef]);

    // Zonal Focus Logic (Anti-Bias: Sector Panning)
    // 2-step animation: First show entire pyramid, then zoom to zone
    useEffect(() => {
        if (!hasPerformedZonalFocus || !transformRef.current) return;

        // Step 1: First show the entire pyramid (autoFit)
        performAutoFit();

        // Step 2: After delay, zoom to the target zone
        const zoomTimer = setTimeout(() => {
            if (
                !transformRef.current ||
                !wrapperRef.current ||
                !contentRef.current ||
                !pyramidRef.current
            )
                return;

            // Skip zonal zoom if pile is empty - just stay centered
            if (activePileCount === 0) return;

            // Calculate dynamic target column based on grid limits
            // Desktop: -1 (Disagree), 0 (Neutral), +1 (Agree)
            // Mobile: minScore + 2, Neutral: 0, Agree: maxScore - 2
            const scores = gridColumns.map((c) => c.score);
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);

            const isMobile = !isDesktop;
            const isLandscapeMob = isMobile && isLandscape;
            let targetScore: number;

            if (isMobile) {
                if (activePile === 'disagree') {
                    targetScore = minScore + 2;
                } else if (activePile === 'agree') {
                    targetScore = maxScore - 2;
                } else {
                    targetScore = 0;
                }
            } else {
                if (activePile === 'disagree') {
                    targetScore = -1;
                } else if (activePile === 'agree') {
                    targetScore = 1;
                } else {
                    targetScore = 0;
                }
            }

            // Format column ID
            const targetColumnId = `column-${targetScore}`;
            const targetColumn = document.getElementById(targetColumnId);
            if (!targetColumn) return;

            // Get wrapper and content dimensions
            const wrapperW = wrapperRef.current.clientWidth;
            const wrapperH = wrapperRef.current.clientHeight;
            const contentW = contentRef.current.offsetWidth;
            const contentH = contentRef.current.offsetHeight;

            // Target scale: fit content nicely (1.0 for desktop, 0.85 for landscape mobile, 0.66 for portrait mobile)
            const targetScale = isMobile ? (isLandscapeMob ? 0.85 : 0.66) : 1.0;

            // Get the column's position relative to the content (not screen)
            const contentRect = contentRef.current.getBoundingClientRect();
            const columnRect = targetColumn.getBoundingClientRect();

            // Column center relative to content (at current scale)
            const currentScale = transformRef.current.instance.transformState.scale;
            const columnCenterInContent =
                (columnRect.left - contentRect.left + columnRect.width / 2) / currentScale;

            // Where we want the column center to be (center of wrapper)
            const targetColumnScreenX = wrapperW / 2;

            // Calculate X position: targetColumnScreenX = columnCenterInContent * targetScale + targetX
            const targetX = targetColumnScreenX - columnCenterInContent * targetScale;

            // Center content horizontally, ensure it doesn't overflow too much
            const maxX = 0;
            const minX = wrapperW - contentW * targetScale;
            const clampedX = Math.max(minX, Math.min(maxX, targetX));

            // Y positioning: center in landscape, bottom anchor in portrait
            const targetY = isLandscapeMob
                ? (wrapperH - contentH * targetScale) / 2
                : wrapperH - contentH * targetScale - 10;

            // Apply zoom and pan with smooth easing
            transformRef.current.setTransform(clampedX, targetY, targetScale, 800, 'easeInOutQuad');

            // Reset focus state to prevent redundant triggers
            setHasPerformedZonalFocus(false);
        }, 500); // Reduced delay for smoother transition

        return () => clearTimeout(zoomTimer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        activePile,
        hasPerformedZonalFocus,
        wrapperRef,
        contentRef,
        pyramidRef,
        performAutoFit,
        gridColumns,
        activePileCount,
        setHasPerformedZonalFocus,
        isDesktop,
        isLandscape,
    ]);

    return {
        transformRef,
        performAutoFit,
        zoomIn,
        zoomOut,
        onTransformed,
    };
};
