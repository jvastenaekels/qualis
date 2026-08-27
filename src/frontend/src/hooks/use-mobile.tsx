import { useIsMobile as useIsMobileFromContext } from '@/contexts/ViewportContext';

/**
 * Hook to detect if the viewport is in mobile size (< 768px).
 * Delegates to the centralized ViewportContext.
 *
 * @returns true if viewport width is below 768px
 */
export function useIsMobile(): boolean {
    return useIsMobileFromContext();
}
