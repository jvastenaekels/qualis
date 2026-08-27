import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BREAKPOINTS } from '@/constants/breakpoints';

type ViewportContextValue = {
    width: number;
    height: number;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    isWide: boolean;
    isLandscape: boolean;
};

const ViewportContext = createContext<ViewportContextValue | undefined>(undefined);

/** Read viewport dimensions, preferring the VisualViewport API for accuracy on iOS Safari */
function getViewportSize(): { width: number; height: number } {
    const vp = window.visualViewport;
    return {
        width: vp ? Math.round(vp.width) : window.innerWidth,
        height: vp ? Math.round(vp.height) : window.innerHeight,
    };
}

export function ViewportProvider({ children }: { children: React.ReactNode }) {
    const [width, setWidth] = useState<number>(() =>
        typeof window !== 'undefined' ? getViewportSize().width : 1200
    );
    const [height, setHeight] = useState<number>(() =>
        typeof window !== 'undefined' ? getViewportSize().height : 800
    );

    // screen.orientation provides physical orientation immune to virtual keyboard resize.
    // null = API not available or no event fired yet, fall back to width > height.
    const [orientationOverride, setOrientationOverride] = useState<boolean | null>(() => {
        if (typeof window !== 'undefined' && screen.orientation?.type) {
            return screen.orientation.type.startsWith('landscape');
        }
        return null;
    });

    // Debounced resize handler using requestAnimationFrame (prevents 60fps re-renders)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        let rafId: number;
        const handleResize = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const size = getViewportSize();
                setWidth(size.width);
                setHeight(size.height);
            });
        };

        window.addEventListener('resize', handleResize);
        // visualViewport fires its own resize event, more reliable on iOS Safari
        window.visualViewport?.addEventListener('resize', handleResize);
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.visualViewport?.removeEventListener('resize', handleResize);
            cancelAnimationFrame(rafId);
        };
    }, []);

    // Listen to screen.orientation for physical orientation changes.
    // This is immune to virtual keyboard resizing (unlike width > height).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const so = screen.orientation;
        if (!so?.addEventListener) return;

        const handleOrientation = () => {
            setOrientationOverride(so.type.startsWith('landscape'));
        };
        so.addEventListener('change', handleOrientation);
        return () => so.removeEventListener('change', handleOrientation);
    }, []);

    const values = useMemo(() => {
        const isMobile = width < BREAKPOINTS.MD;
        const isTablet = width >= BREAKPOINTS.MD && width < BREAKPOINTS.LG;
        const isDesktop = width >= BREAKPOINTS.LG;
        const isWide = width >= BREAKPOINTS['2XL'];
        // Prefer screen.orientation signal (keyboard-immune), fall back to dimensions
        const isLandscape = orientationOverride ?? width > height;

        return { width, height, isMobile, isTablet, isDesktop, isWide, isLandscape };
    }, [width, height, orientationOverride]);

    return <ViewportContext.Provider value={values}>{children}</ViewportContext.Provider>;
}

export function useViewport() {
    const context = useContext(ViewportContext);
    if (context === undefined) {
        throw new Error('useViewport must be used within a ViewportProvider');
    }
    return context;
}

// Specialized hooks for convenience
export function useIsMobile() {
    return useViewport().isMobile;
}
