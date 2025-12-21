import { useRef, useCallback, useEffect } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';

interface UseGridZoomProps {
    wrapperRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
    pyramidRef: React.RefObject<HTMLDivElement>;
    gridColumns: { score: number; capacity: number }[];
    activePile: 'agree' | 'disagree' | 'neutral';
    hasPerformedZonalFocus: boolean;
    setDimmingActive: (active: boolean) => void;
}

export const useGridZoom = ({
    wrapperRef,
    contentRef,
    pyramidRef,
    activePile,
    hasPerformedZonalFocus,
    setDimmingActive,
    onZoomChange
}: UseGridZoomProps & { onZoomChange?: (scale: number) => void }) => {
    const transformRef = useRef<ReactZoomPanPinchRef>(null);

    const onTransformed = useCallback((ref: ReactZoomPanPinchRef, state: { scale: number }) => {
        onZoomChange?.(state.scale);
    }, [onZoomChange]);

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
            const widthScale = (wrapperW * 0.98) / contentW;
            const heightScale = (wrapperH * 0.92) / contentH;
            scale = Math.min(widthScale, Math.max(heightScale, widthScale * 0.75));
            x = (wrapperW - (contentW * scale)) / 2;
            y = wrapperH - (contentH * scale) - 2;
        } else {
            const padding = 100;
            const availableW = wrapperW - padding;
            const availableH = wrapperH - padding;
            const scaleX = availableW / contentW;
            const scaleY = availableH / contentH;
            scale = Math.min(scaleX, scaleY, 1.1);
            
            x = (wrapperW - (contentW * scale)) / 2;
            y = (wrapperH - (contentH * scale)) / 2;

            if (pyramidRef.current) {
                const pyramid = pyramidRef.current;
                const pyramidOffsetLeft = pyramid.offsetLeft;
                // Center the pyramid specifically if possible/needed, but general centering usually works better
                // Using the original logic's refinement:
                 const pyramidW = pyramid.offsetWidth;
                 x = (wrapperW / 2) - ((pyramidOffsetLeft + (pyramidW / 2)) * scale);
            }
        }
        
        transformRef.current.setTransform(x, y, scale, 200);
    }, [wrapperRef, contentRef, pyramidRef]);

    const zoomIn = useCallback(() => {
        if (transformRef.current) {
            transformRef.current.zoomIn(0.2);
        }
    }, []);

    const zoomOut = useCallback(() => {
        if (transformRef.current) {
            transformRef.current.zoomOut(0.2);
        }
    }, []);

    // Zonal Focus Logic (Anti-Bias: Sector Panning)
    // 2-step animation: First show entire pyramid, then zoom to zone
    useEffect(() => {
        if (!hasPerformedZonalFocus || !transformRef.current) return;

        // Step 1: First show the entire pyramid (autoFit)
        performAutoFit();
        
        // Step 2: After delay, zoom to the target zone
        const zoomTimer = setTimeout(() => {
             if (!transformRef.current || !wrapperRef.current || !contentRef.current || !pyramidRef.current) return;
             
             const isMobile = window.innerWidth < 1024;
             if (!isMobile) return; 

             // Determine Target Column based on Pile
             // Disagree -> Column -2, Neutral -> Column 0, Agree -> Column +2
             const targetColumnId = activePile === 'disagree' ? 'column--2' 
                                  : activePile === 'agree' ? 'column-2' 
                                  : 'column-0';
             
             const targetColumn = document.getElementById(targetColumnId);
             if (!targetColumn) return;

             // Fixed Scale for Zonal Zoom (subtle)
             const targetScale = 1.2;

             // Calculate Pan to center on target column
             const wrapperW = wrapperRef.current.clientWidth;
             const wrapperH = wrapperRef.current.clientHeight;
             const contentH = contentRef.current.offsetHeight;
             
             // Get column position relative to content
             const columnRect = targetColumn.getBoundingClientRect();
             const contentRect = contentRef.current.getBoundingClientRect();
             const columnCenterInContent = (columnRect.left - contentRect.left) + (columnRect.width / 2);
             
             // Center horizontally on column
             const targetX = (wrapperW / 2) - (columnCenterInContent * targetScale);
             
             // Position vertically to keep spectrum bar visible (anchor to bottom)
             const targetY = wrapperH - (contentH * targetScale) - 10;

             transformRef.current.setTransform(targetX, targetY, targetScale, 800, 'easeOutQuad');
             
             // Subtle visual cue
             setDimmingActive(true);
             setTimeout(() => setDimmingActive(false), 1500);

        }, 800); // Delay after autoFit completes

        return () => clearTimeout(zoomTimer);
    }, [activePile, hasPerformedZonalFocus, setDimmingActive, wrapperRef, contentRef, pyramidRef, performAutoFit]);

    return {
        transformRef,
        performAutoFit,
        zoomIn,
        zoomOut,
        onTransformed
    };
};
