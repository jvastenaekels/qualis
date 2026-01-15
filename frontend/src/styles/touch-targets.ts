/**
 * Touch-friendly utility classes and constants for WCAG AAA compliance.
 *
 * WCAG AAA Success Criterion 2.5.5 requires target sizes of at least 44x44 CSS pixels
 * for all interactive elements (except inline links and user-agent controls).
 *
 * Reference: https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
 */

/**
 * Minimum touch target size in pixels (WCAG AAA).
 */
export const MIN_TOUCH_TARGET_SIZE = 44;

/**
 * Recommended spacing between touch targets in pixels.
 */
export const MIN_TOUCH_TARGET_SPACING = 8;

/**
 * Tailwind classes for touch-friendly buttons.
 * Use these instead of small padding values like p-1 or p-2.
 */
export const TOUCH_BUTTON_CLASSES = {
    /** Primary touch target (44x44px minimum) */
    base: 'min-w-[44px] min-h-[44px] touch-manipulation',

    /** Icon-only button (44x44px) */
    icon: 'p-3 min-w-[44px] min-h-[44px] touch-manipulation',

    /** Small button with text (44px height minimum) */
    small: 'px-4 py-3 min-h-[44px] touch-manipulation',

    /** Medium button with text */
    medium: 'px-6 py-3 min-h-[44px] touch-manipulation',

    /** Large button with text */
    large: 'px-8 py-4 min-h-[48px] touch-manipulation',
} as const;

/**
 * CSS custom property for consistent touch target sizing.
 * Add to your global CSS or Tailwind config.
 */
export const TOUCH_TARGET_CSS_VARS = `
:root {
  --touch-target-min: 44px;
  --touch-target-spacing: 8px;
}
` as const;
