import { useRef, useCallback, useEffect } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

interface UseGridZoomProps {
    wrapperRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
    pyramidRef: React.RefObject<HTMLDivElement>;
    gridColumns: { score: number; capacity: number }[];
    activePile: 'agree' | 'disagree' | 'neutral';
    activePileCount: number;
    hasPerformedZonalFocus: boolean;
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
    onZoomChange,
    onTransformChange
}: UseGridZoomProps) => {
    const transformRef = useRef<ReactZoomPanPinchRef>(null);

    const onTransformed = useCallback((ref: ReactZoomPanPinchRef, state: { scale: number }) => {
        onZoomChange?.(state.scale);
        onTransformChange?.();
    }, [onZoomChange, onTransformChange]);

    const performAutoFit = useCallback(() => {
        if (!transformRef.current || !wrapperRef.current || !contentRef.current) return;
        const wrapper = wrapperRef.current;
        const content = contentRef.current;
        const wrapperW = wrapper.clientWidth;
        const wrapperH = wrapper.clientHeight;
        const contentW = content.offsetWidth;
        const contentH = content.offsetHeight;
        if (contentW === 0 || contentH === 0) return;

        const isMobile = window.innerWidth < 1024;
        
        let scale: number, x: number, y: number;

        if (isMobile) {
            // Mobile: Fit Width primarily
            const widthScale = (wrapperW * 0.98) / contentW;
            const heightScale = (wrapperH * 0.90) / contentH;
            
            // Allow slightly more zoom on mobile
            scale = Math.min(widthScale, Math.max(heightScale, widthScale * 0.70));
            
            // Center Horizontally (Content is flex-centered, so this centers the pyramid)
            x = (wrapperW - (contentW * scale)) / 2;
            
            // Anchor Bottom to leave top space for numbers/text
            // But ensure we don't push it *too* far down if it's small
            y = wrapperH - (contentH * scale) - 10;
        } else {
            // Desktop: Fit both, with padding
            const padding = 60; // Reduced padding
            const availableW = wrapperW - padding;
            const availableH = wrapperH - padding;
            const scaleX = availableW / contentW;
            const scaleY = availableH / contentH;
            
            scale = Math.min(scaleX, scaleY, 1.1);
            
            // Center Horizontally
            x = (wrapperW - (contentW * scale)) / 2;
            
            // Center Vertically based on PYRAMID, not full content
            // (Content includes the Spectrum Bar at bottom, which drags visual center down)
            if (pyramidRef.current) {
                const pyramidH = pyramidRef.current.offsetHeight;
                // We want the center of the pyramid to match the center of the wrapper
                // Pyramid is at top of content, so PyramidCenterY relative to content is (pyramidH / 2)
                const pyramidCenterY = (pyramidH / 2);
                
                // Target Y position for top of content:
                // WrapperCenterY - (PyramidCenterY * scale)
                y = (wrapperH / 2) - (pyramidCenterY * scale);
                
                // Correction: If this pushes the bottom bar off-screen, clamp it?
                // Visual preference: Start with Pyramid centered.
            } else {
                y = (wrapperH - (contentH * scale)) / 2;
            }
        }
        
        transformRef.current.setTransform(x, y, scale, 400, 'easeOutQuad');
    }, [wrapperRef, contentRef, pyramidRef]);

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
    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let lastWidth = window.innerWidth;
        let lastHeight = window.innerHeight;

        const handleResize = () => {
            const widthChange = Math.abs(window.innerWidth - lastWidth);
            const heightChange = Math.abs(window.innerHeight - lastHeight);
            
            // Only trigger for significant changes (> 50px)
            if (widthChange > 50 || heightChange > 50) {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    performAutoFit();
                    lastWidth = window.innerWidth;
                    lastHeight = window.innerHeight;
                }, 300);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [performAutoFit]);

    // Zonal Focus Logic (Anti-Bias: Sector Panning)
    // 2-step animation: First show entire pyramid, then zoom to zone
    useEffect(() => {
        if (!hasPerformedZonalFocus || !transformRef.current) return;

        // Step 1: First show the entire pyramid (autoFit)
        performAutoFit();
        
        // Step 2: After delay, zoom to the target zone
        const zoomTimer = setTimeout(() => {
             if (!transformRef.current || !wrapperRef.current || !contentRef.current || !pyramidRef.current) return;
             
             // Skip zonal zoom if pile is empty - just stay centered
             if (activePileCount === 0) return;

             // Calculate dynamic target column based on grid limits
             // Desktop: -1 (Disagree), 0 (Neutral), +1 (Agree)
             // Mobile: minScore + 2, Neutral: 0, Agree: maxScore - 2
             const scores = gridColumns.map(c => c.score);
             const minScore = Math.min(...scores);
             const maxScore = Math.max(...scores);
             
             const isMobile = window.innerWidth < 1024;
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
             
             // Target scale: fit content nicely (1.0 for desktop, 0.66 for mobile)
             const targetScale = isMobile ? 0.66 : 1.0;
             
             // Get the column's position relative to the content (not screen)
             const contentRect = contentRef.current.getBoundingClientRect();
             const columnRect = targetColumn.getBoundingClientRect();
             
             // Column center relative to content (at current scale)
             const currentScale = transformRef.current.instance.transformState.scale;
             const columnCenterInContent = (columnRect.left - contentRect.left + columnRect.width / 2) / currentScale;
             
             // Where we want the column center to be (center of wrapper)
             const targetColumnScreenX = wrapperW / 2;
             
             // Calculate X position: targetColumnScreenX = columnCenterInContent * targetScale + targetX
             const targetX = targetColumnScreenX - (columnCenterInContent * targetScale);
             
             // Center content horizontally, ensure it doesn't overflow too much
             const maxX = 0;
             const minX = wrapperW - (contentW * targetScale);
             const clampedX = Math.max(minX, Math.min(maxX, targetX));
             
             // Bottom anchor for Y (spectrum bar visible)
             const targetY = wrapperH - (contentH * targetScale) - 10;

             // Apply zoom and pan with smooth easing
             transformRef.current.setTransform(clampedX, targetY, targetScale, 800, 'easeInOutQuad');
             
             // (No dimming cue)

        }, 500); // Reduced delay for smoother transition

        return () => clearTimeout(zoomTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePile, hasPerformedZonalFocus, wrapperRef, contentRef, pyramidRef, performAutoFit, gridColumns]);

    return {
        transformRef,
        performAutoFit,
        zoomIn,
        zoomOut,
        onTransformed
    };
};
