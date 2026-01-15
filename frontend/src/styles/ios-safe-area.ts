/**
 * iOS Safe Area Insets Guide
  *
 * Ensures content doesn't hide behind:
 * - The notch on iPhone X and later
 * - The home indicator at the bottom
 * - Rounded corners
  *
 * ## Setup (Already Done)
  *
 * 1. index.html has viewport-fit=cover:
 *    ```html
 *    <meta name='viewport' content='width=device-width, initial-scale=1.0, viewport-fit=cover' />
 *    ```
  *
 * 2. CSS variables defined in index.css:
 *    ```css
 *    --safe-area-inset-top: env(safe-area-inset-top, 0px);
 *    --safe-area-inset-right: env(safe-area-inset-right, 0px);
 *    --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
 *    --safe-area-inset-left: env(safe-area-inset-left, 0px);
 *    ```
  *
 * ## Usage
  *
 * ### Utility Classes (Recommended)
  *
 * Apply these classes to elements that need safe area padding:
  *
 * ```tsx
 * // Bottom padding (common for sticky footers)
 * <div className='pb-safe sticky bottom-0'>...</div>
  *
 * // Top padding (for sticky headers)
 * <div className='pt-safe sticky top-0'>...</div>
  *
 * // Horizontal padding
 * <div className='px-safe'>...</div>
  *
 * // All sides
 * <div className='p-safe'>...</div>
 * ```
  *
 * ### CSS Variables (For Custom Padding)
  *
 * Use CSS variables when you need custom padding calculations:
  *
 * ```tsx
 * <div style={{
 *   paddingBottom: 'max(1rem, var(--safe-area-inset-bottom))'
 * }}>
 *   ...
 * </div>
 * ```
  *
 * ## Common Use Cases
  *
 * ### 1. Sticky Footer with Action Button
  *
 * ```tsx
 * <div className='sticky bottom-0 bg-white p-4 pb-safe'>
 *   <button>Continue</button>
 * </div>
 * ```
  *
 * ### 2. Full-Screen Modal
  *
 * ```tsx
 * <div className='fixed inset-0 p-safe'>
 *   <div className='h-full flex flex-col'>
 *     ...
 *   </div>
 * </div>
 * ```
  *
 * ### 3. Fixed Header
  *
 * ```tsx
 * <header className='sticky top-0 pt-safe px-4'>
 *   ...
 * </header>
 * ```
  *
 * ## Testing
  *
 * ### Safari DevTools
 * 1. Open Safari DevTools
 * 2. Enable 'Responsive Design Mode'
 * 3. Select an iPhone with a notch (iPhone X or later)
 * 4. Verify that content doesn't hide behind the notch or home indicator
  *
 * ### Real Device
 * Test on actual iPhone X or later to verify safe areas are respected.
  *
 * ## Browser Support
  *
 * - iOS Safari 11.2+: Full support
 * - Chrome on iOS: Full support
 * - Android Chrome: Falls back to 0px (no safe areas)
 * - Desktop browsers: Falls back to 0px (no safe areas)
  *
 * The `env(safe-area-inset-*, 0px)` syntax ensures graceful fallback on non-iOS devices.
 */

export const IOS_SAFE_AREA_GUIDE = 'See comments above for full documentation';
