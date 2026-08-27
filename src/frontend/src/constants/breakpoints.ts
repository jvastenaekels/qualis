/**
 * Centralized breakpoint definitions matching Tailwind CSS configuration.
 * Keep in sync with tailwind.config.js screens configuration.
 *
 * These values represent the MINIMUM width at which the breakpoint becomes active.
 * For example, MOBILE = 768 means screens 768px and above are considered non-mobile.
 */
export const BREAKPOINTS = {
    /**
     * Small mobile devices (0-639px).
     * Matches Tailwind's implicit base (mobile-first).
     */
    SM: 640,

    /**
     * Tablets and large phones (640-767px).
     * Traditional "mobile vs desktop" boundary is at 768px.
     */
    MD: 768,

    /**
     * Desktop devices and landscape tablets (768-1023px).
     * This is the primary mobile/desktop distinction.
     */
    LG: 1024,

    /**
     * Large desktop devices (1024-1399px).
     */
    XL: 1280,

    /**
     * Extra large desktop devices (1400px+).
     * Custom breakpoint for Qualis.
     */
    '2XL': 1400,
} as const;
