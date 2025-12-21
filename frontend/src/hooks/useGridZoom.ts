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
    setDimmingActive: (active: boolean) => void;
}

export const useGridZoom = ({
    wrapperRef,
    contentRef,
    pyramidRef,
    gridColumns,
    activePile,
    activePileCount,
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
             
             const isMobile = window.innerWidth < 1024;
             if (!isMobile) return; 

             // Skip zonal zoom if pile is empty - just stay centered
             if (activePileCount === 0) return;

             // Calculate dynamic target column based on grid limits
             // Disagree: minScore + 2, Neutral: 0, Agree: maxScore - 2
             const scores = gridColumns.map(c => c.score);
             const minScore = Math.min(...scores);
             const maxScore = Math.max(...scores);
             
             let targetScore: number;
             if (activePile === 'disagree') {
                 targetScore = minScore + 2;
             } else if (activePile === 'agree') {
                 targetScore = maxScore - 2;
             } else {
                 targetScore = 0;
             }

             // Format column ID
             const targetColumnId = `column-${targetScore}`;
             const targetColumn = document.getElementById(targetColumnId);
             if (!targetColumn) return;

             // Get current transform state
             const currentState = transformRef.current.instance.transformState;
             const currentX = currentState.positionX;
             
             // Target scale: 0.66 (zoom out for more context)
             const targetScale = 0.66;
             
             // Get positions
             const wrapperW = wrapperRef.current.clientWidth;
             const wrapperH = wrapperRef.current.clientHeight;
             const contentH = contentRef.current.offsetHeight;
             const columnRect = targetColumn.getBoundingClientRect();
             const wrapperRect = wrapperRef.current.getBoundingClientRect();
             
             // Calculate pan to center the target column
             const columnCenterScreen = columnRect.left + (columnRect.width / 2);
             const wrapperCenterScreen = wrapperRect.left + (wrapperW / 2);
             const deltaX = wrapperCenterScreen - columnCenterScreen;
             const targetX = currentX + deltaX;
             
             // Bottom anchor for Y
             const targetY = wrapperH - (contentH * targetScale) - 10;

             // Apply zoom and pan
             transformRef.current.setTransform(targetX, targetY, targetScale, 600, 'easeOutQuad');
             
             // Subtle visual cue
             setDimmingActive(true);
             setTimeout(() => setDimmingActive(false), 1000);

        }, 800); // Delay after autoFit completes

        return () => clearTimeout(zoomTimer);
    }, [activePile, activePileCount, hasPerformedZonalFocus, setDimmingActive, wrapperRef, contentRef, pyramidRef, performAutoFit, gridColumns]);

    return {
        transformRef,
        performAutoFit,
        zoomIn,
        zoomOut,
        onTransformed
    };
};
