/**
 * Centralized z-index scale for consistent layering.
 * Import and use these constants instead of arbitrary z-index values.
 *
 * Layer hierarchy (from bottom to top):
 * - base (0): Default content
 * - dropdown (10): Dropdowns and select menus
 * - sticky (20): Sticky elements
 * - header (30): App header/navigation
 * - sidebar (35): Admin sidebar
 * - overlay (40): Semi-transparent overlays
 * - toolbar (45): Grid toolbar and similar tools
 * - modal (50): Modal dialogs and sheets
 * - popover (60): Popovers and context menus
 * - tooltip (70): Tooltips
 * - notification (80): Toast notifications
 * - emergency (9999): Critical alerts (offline banner, errors)
 */
export const Z_INDEX = {
	/** Base layer (default content) */
	base: 0,

	/** Dropdowns and select menus */
	dropdown: 10,

	/** Sticky elements (sticky headers, etc.) */
	sticky: 20,

	/** App header/navigation */
	header: 30,

	/** Admin sidebar */
	sidebar: 35,

	/** Overlay backgrounds (semi-transparent) */
	overlay: 40,

	/** Grid toolbar and similar tools */
	toolbar: 45,

	/** Modal dialogs and sheets */
	modal: 50,

	/** Popovers and context menus */
	popover: 60,

	/** Tooltips */
	tooltip: 70,

	/** Toast notifications */
	notification: 80,

	/** Critical alerts (offline banner, errors) */
	emergency: 9999,
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX;
