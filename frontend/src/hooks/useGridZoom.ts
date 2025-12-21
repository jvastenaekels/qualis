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
    useEffect(() => {
        if (!hasPerformedZonalFocus || !transformRef.current) return;

        const timer = setTimeout(() => {
             if (!transformRef.current || !wrapperRef.current || !contentRef.current || !pyramidRef.current) return;
             
             const isMobile = window.innerWidth < 1024;
             if (!isMobile) return; 

             // 1. Determine Sector Direction (Left vs Right)
             // We do NOT target a specific column (Bias hazard).
             // We simply ensure the relevant "Side" of the pyramid is visible.
             let targetXFactor = 0.5; // Default center
             
             if (activePile === 'disagree') {
                 targetXFactor = 0.25; // Focus on the Left Quadrant
             } else if (activePile === 'agree') {
                 targetXFactor = 0.75; // Focus on the Right Quadrant
             } else {
                 return; // Neutral -> Stay put or center? (User controls)
             }
             
             // 2. Calculate smooth Pan target
             const state = transformRef.current.instance.transformState;
             const contentW = contentRef.current.offsetWidth;
             const wrapperW = wrapperRef.current.clientWidth;
             const currentScale = state.scale;

             // Clarity: Ensure we ZOOM IN to the zone
             // If user is zoomed out (<1), jump to 1.2. 
             // If already zoomed in, nudge it further (x1.2) up to a max of 2.5
             let targetScale = Math.max(currentScale * 1.3, 1.2);
             targetScale = Math.min(targetScale, 2.5);

             // Center on the target sector
             // x = (WrapperCenter) - (SectorCenter * Scale)
             const targetX = (wrapperW / 2) - ((contentW * targetXFactor) * targetScale);
             
             // Ensure Y keeps the pyramid visible (bottom align vs center?)
             // Keeping Y stable or re-centering vertically.
             const currentY = state.positionY; 

             transformRef.current.setTransform(targetX, currentY, targetScale, 600, 'easeOut');
             
             // Subtle visual cue that we moved
             setDimmingActive(true);
             setTimeout(() => setDimmingActive(false), 1500);

        }, 300); // Reduced delay for responsiveness

        return () => clearTimeout(timer);
    }, [activePile, hasPerformedZonalFocus, setDimmingActive, wrapperRef, contentRef, pyramidRef]);

    return {
        transformRef,
        performAutoFit,
        zoomIn,
        zoomOut,
        onTransformed
    };
};
