import * as React from 'react';
import { SEMANTIC_BREAKPOINTS } from '@/constants/breakpoints';

/**
 * Hook to detect if the viewport is in mobile size (< 768px).
 * Uses matchMedia for better performance and SSR safety.
 *
 * @returns true if viewport width is below 768px
 */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = React.useState<boolean>(() => {
        // SSR-safe initialization
        if (typeof window === 'undefined') return false;
        return window.innerWidth < SEMANTIC_BREAKPOINTS.MOBILE;
    });

    React.useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${SEMANTIC_BREAKPOINTS.MOBILE - 1}px)`);
        const onChange = () => {
            setIsMobile(window.innerWidth < SEMANTIC_BREAKPOINTS.MOBILE);
        };
        mql.addEventListener('change', onChange);
        setIsMobile(window.innerWidth < SEMANTIC_BREAKPOINTS.MOBILE);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return isMobile;
}
