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
};

const ViewportContext = createContext<ViewportContextValue | undefined>(undefined);

export function ViewportProvider({ children }: { children: React.ReactNode }) {
    // SSR safe initialization
    const [width, setWidth] = useState<number>(() =>
        typeof window !== 'undefined' ? window.innerWidth : 1200
    );
    const [height, setHeight] = useState<number>(() =>
        typeof window !== 'undefined' ? window.innerHeight : 800
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleResize = () => {
            setWidth(window.innerWidth);
            setHeight(window.innerHeight);
        };

        // Add event listener
        window.addEventListener('resize', handleResize);

        // Initial call
        handleResize();

        // Cleanup
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const values = useMemo(() => {
        const isMobile = width < BREAKPOINTS.MD;
        const isTablet = width >= BREAKPOINTS.MD && width < BREAKPOINTS.LG;
        const isDesktop = width >= BREAKPOINTS.LG;
        const isWide = width >= BREAKPOINTS['2XL'];

        return {
            width,
            height,
            isMobile,
            isTablet,
            isDesktop,
            isWide,
        };
    }, [width, height]);

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
