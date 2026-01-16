# Responsiveness and Layout Robustness Analysis

**Date:** 2026-01-14
**Project:** Open-Q Platform
**Scope:** Frontend responsiveness, layout robustness, and mobile UX

---

## Executive Summary

Open-Q demonstrates **strong mobile-first design principles** with sophisticated responsive patterns, particularly in the core Q-sort interfaces (RoughSort, FineSort). Recent fixes (commit c4fe249) addressed critical mobile UX issues including dialog overflow, sidebar width, and touch thresholds.

However, several **systematic improvements** can enhance consistency, maintainability, and cross-device reliability:

1. **Breakpoint inconsistencies** between CSS (768px) and JavaScript (1024px)
2. **Direct DOM measurements** scattered across components instead of centralized hooks
3. **Z-index management** lacks systematic layering structure
4. **Missing modern CSS features** like container queries, CSS custom properties for spacing
5. **Touch target sizes** need audit for WCAG AAA compliance
6. **Viewport configuration** could be enhanced for iOS/Android edge cases

**Overall Health Score: 7.5/10** — Solid foundation with room for systematic improvements.

---

## 1. Breakpoint Architecture

### Current State

| Breakpoint | Value | Usage | Framework |
|------------|-------|-------|-----------|
| `sm:` | 640px | Typography, spacing | Tailwind CSS |
| `md:` | 768px | **Primary mobile cutoff**, visibility toggles | Tailwind CSS |
| `lg:` | 1024px | GridSort focus mode, layout shifts | Tailwind CSS |
| `2xl:` | 1400px | Container max-width | Tailwind CSS (custom) |

**JavaScript Detection:**
- **useIsMobile() hook:** 768px (`MOBILE_BREAKPOINT = 768`)
- **Direct checks in hooks:** 1024px (`window.innerWidth < 1024`)

### Issues Identified

#### 1.1 Misaligned Breakpoints (Priority: HIGH)

**Problem:** CSS and JavaScript use different thresholds for "mobile" detection.

**Evidence:**
```typescript
// useIsMobile.tsx - Uses 768px
const MOBILE_BREAKPOINT = 768;

// useGridCalculations.ts:36 - Uses 1024px
if (selectedCardId && window.innerWidth < 1024) return;

// useGridZoom.ts:49 - Uses 1024px
const isMobile = window.innerWidth < 1024;
```

**Impact:**
- **GridSort** disables card resizing below 1024px (desktop behavior)
- **CSS classes** show/hide elements at 768px (tablet behavior)
- **Layout thrashing** risk: CSS shows desktop layout while JS acts mobile

**Affected Files:**
- `src/hooks/useGridCalculations.ts` (line 36, 103)
- `src/hooks/useGridZoom.ts` (line 49, 187)
- `src/hooks/use-mobile.tsx` (line 3)

**Recommendation:**
- **Standardize on 768px** for "mobile vs. tablet/desktop" boundary
- **Introduce 1024px** as a separate `useIsTablet()` hook for the "Focus Mode" logic
- Or: Rename breakpoint to `DESKTOP_FOCUS_BREAKPOINT = 1024` for clarity

#### 1.2 Direct window.innerWidth Checks (Priority: MEDIUM)

**Problem:** 10 files bypass the `useIsMobile()` hook, using direct DOM measurements.

**Files Affected:**
```
frontend/src/pages/RoughSortPage.tsx
frontend/src/components/GridSort.tsx
frontend/src/components/CardStack.tsx
frontend/src/hooks/useGridCalculations.ts
frontend/src/hooks/useGridZoom.ts
frontend/src/pages/FineSortPage.tsx
```

**Why This Matters:**
1. **Testability:** Direct DOM checks hard to mock in unit tests
2. **Consistency:** Same breakpoint might be written differently (< 768 vs. < 1024)
3. **SSR Safety:** `window` undefined during server-side rendering (React 19 SSR)
4. **Performance:** Multiple resize listeners instead of shared MediaQuery API

**Recommendation:**
- Centralize all breakpoint logic into hooks:
  - `useIsMobile()` → 768px
  - `useIsDesktop()` → 1024px+
  - `useBreakpoint()` → Returns current breakpoint name
- Replace direct checks with hook consumption

---

## 2. Layout System

### 2.1 Tailwind Configuration

**Strengths:**
- ✅ HSL color system with CSS custom properties (dark mode ready)
- ✅ Custom sidebar color palette for admin UI
- ✅ Container queries plugin enabled (`@tailwindcss/typography`)
- ✅ Mobile-first responsive utilities (gap, padding, typography)

**Gaps:**
- ❌ **No container queries** despite plugin being installed
- ❌ **Fixed container padding** (2rem) doesn't scale responsively
- ❌ **No fluid typography** (e.g., `clamp()` for responsive font sizes)
- ❌ **No safe-area-inset utilities** for iOS notches (iPhone 14+, etc.)

### 2.2 Viewport Configuration

**Current (index.html:6):**
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

**Enhancements Recommended:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=5.0" />
```

**Rationale:**
- `viewport-fit=cover`: Ensures content extends to edges on notched devices
- `maximum-scale=5.0`: Allows zoom for accessibility (WCAG 2.1 requirement) while preventing extreme over-zoom

### 2.3 Safe Area Insets (iOS Notches)

**Current State:** No safe area handling detected

**Impact:** On iPhone 14 Pro/15 Pro in landscape, content may be hidden behind:
- Notch/Dynamic Island (top)
- Home indicator (bottom)
- Rounded corners

**Recommendation:** Add to `index.css`:
```css
@supports (padding: env(safe-area-inset-top)) {
  .safe-top { padding-top: env(safe-area-inset-top); }
  .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
  .safe-left { padding-left: env(safe-area-inset-left); }
  .safe-right { padding-right: env(safe-area-inset-right); }
}
```

Then update Tailwind config to expose these:
```js
// tailwind.config.js
extend: {
  spacing: {
    'safe-top': 'env(safe-area-inset-top)',
    'safe-bottom': 'env(safe-area-inset-bottom)',
    'safe-left': 'env(safe-area-inset-left)',
    'safe-right': 'env(safe-area-inset-right)',
  }
}
```

**Apply to:**
- `StudyLayout.tsx` header (line 160-180)
- Bottom navigation buttons (RoughSortPage, FineSortPage)
- Fixed toolbars (GridSort zoom controls)

---

## 3. Component-Specific Issues

### 3.1 Sidebar (Admin Layout)

**File:** `src/components/ui/sidebar.tsx`

**Current:**
```typescript
const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_MOBILE = '16rem';
const SIDEBAR_WIDTH_ICON = '3rem';
```

**Issue:** Fixed rem values don't adapt to:
- Ultrawide monitors (1440p+, 4K)
- Small laptops (1366x768)
- Large tablets (iPad Pro 12.9")

**Recommendation:**
```typescript
// Use CSS custom properties for dynamic sizing
const SIDEBAR_WIDTH = 'var(--sidebar-width, 16rem)';
const SIDEBAR_WIDTH_MOBILE = 'var(--sidebar-width-mobile, 18rem)'; // Wider for touch targets
const SIDEBAR_WIDTH_ICON = 'var(--sidebar-width-icon, 3.5rem)';
```

Add to `index.css`:
```css
:root {
  --sidebar-width: clamp(14rem, 20vw, 20rem);
  --sidebar-width-mobile: clamp(16rem, 85vw, 24rem);
  --sidebar-width-icon: clamp(3rem, 5vw, 4rem);
}
```

### 3.2 Dialog Overflow

**File:** `src/components/ui/dialog.tsx`

**Recent Fix (c4fe249):**
```tsx
// Changed from: w-full
// To: w-[90%] sm:w-full max-h-[85vh] overflow-y-auto
```

**Additional Recommendations:**
1. **Max width on large screens:**
   ```tsx
   className="w-[90%] sm:w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[85vh] overflow-y-auto"
   ```

2. **ScrollLock when dialog opens** (prevent body scroll on mobile):
   ```tsx
   useEffect(() => {
     if (open) {
       document.body.style.overflow = 'hidden';
       return () => { document.body.style.overflow = ''; };
     }
   }, [open]);
   ```

### 3.3 GridSort Card Dimensions

**File:** `src/hooks/useGridCalculations.ts`

**Issue:** Cards have minimum size constraints (line 85-86):
```typescript
newWidth = Math.max(newWidth, 140);
newHeight = Math.max(newHeight, 90);
```

**Problem:** On phones < 360px wide (Galaxy Fold, small Android), minimum card width may exceed available space.

**Recommendation:**
```typescript
// Make minimums responsive
const MIN_CARD_WIDTH = window.innerWidth < 360 ? 100 : 140;
const MIN_CARD_HEIGHT = window.innerWidth < 360 ? 65 : 90;

newWidth = Math.max(newWidth, MIN_CARD_WIDTH);
newHeight = Math.max(newHeight, MIN_CARD_HEIGHT);
```

### 3.4 CardStack Touch Threshold

**File:** `src/components/CardStack.tsx:47-49`

**Recent Fix (c4fe249):**
```typescript
// Changed from: 100px fixed
// To: Math.min(100, window.innerWidth * 0.25)
```

**Status:** ✅ Good solution, but could be extracted to a constant:
```typescript
const SWIPE_THRESHOLD = Math.min(100, window.innerWidth * 0.25);
```

---

## 4. Z-Index Management

### Current State

**Usage Found:** 80 occurrences across 28 files

**Problems:**
1. **Arbitrary values** (`z-[60]`, `z-[70]`) scattered across components
2. **No central z-index scale** (layering conflicts possible)
3. **Magic numbers** without documentation

**Affected Layers:**
```
Header: z-50
Step menus: z-[60]
Offline banner: z-[70]
Modals/dialogs: z-50  ⚠️ CONFLICT with header
Grid toolbar: z-50    ⚠️ CONFLICT with header
```

**Recommendation:**

Create `src/styles/z-index.ts`:
```typescript
export const Z_INDEX = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  header: 30,
  sidebar: 35,
  overlay: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  notification: 80,
  emergency: 9999, // Network error banner, etc.
} as const;
```

Update Tailwind config:
```js
extend: {
  zIndex: {
    dropdown: '10',
    sticky: '20',
    header: '30',
    sidebar: '35',
    overlay: '40',
    modal: '50',
    popover: '60',
    tooltip: '70',
    notification: '80',
    emergency: '9999',
  }
}
```

**Apply to components:**
- `StudyLayout.tsx` header: `z-30` (instead of `z-50`)
- `GridSort.tsx` toolbar: `z-40` (instead of `z-50`)
- `HelpOverlay.tsx`: `z-modal` (50)
- Offline banner: `z-emergency` (9999)

---

## 5. Overflow & Scrolling

### 5.1 Overflow Issues Found

**51 files** use overflow utilities. Key patterns:

**Good:**
- `overflow-hidden` on modals/dialogs (prevents body scroll)
- `overflow-y-auto` on scrollable content areas
- Custom scrollbar styles (`.custom-scrollbar`, `.scrollbar-hide`)

**Risks:**
- **Nested overflow contexts:** Can cause scroll confusion on mobile
- **Missing touch-action:** Scroll areas don't specify touch-action CSS

**Audit Needed:**
1. Check if any `overflow-hidden` unintentionally clips content
2. Add `touch-action: pan-y` to vertical scroll areas
3. Add `overscroll-behavior: contain` to prevent iOS bounce on nested scrolls

### 5.2 Custom Scrollbar Styles

**File:** `src/index.css:130-149`

**Issue:** Uses `-webkit-scrollbar` (Chrome/Safari only)

**Recommendation:** Add Firefox support:
```css
.custom-scrollbar {
  scrollbar-width: thin; /* Firefox */
  scrollbar-color: #cbd5e1 transparent; /* Firefox */
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px; /* Chrome/Safari */
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
```

---

## 6. Typography & Text Handling

### 6.1 Responsive Font Scaling

**Current Approach:** Manual breakpoint classes
```tsx
className="text-sm sm:text-base md:text-lg"
```

**Issues:**
- Verbose (repeated across many components)
- Discrete jumps (not fluid)
- Hard to maintain consistent scale

**Recommendation:** Use CSS `clamp()` for fluid typography:

```css
/* Add to index.css */
:root {
  /* Fluid typography scale */
  --font-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --font-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --font-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  --font-lg: clamp(1.125rem, 1rem + 0.625vw, 1.5rem);
  --font-xl: clamp(1.25rem, 1.1rem + 0.75vw, 1.875rem);
  --font-2xl: clamp(1.5rem, 1.3rem + 1vw, 2.25rem);
}

.text-fluid-xs { font-size: var(--font-xs); }
.text-fluid-sm { font-size: var(--font-sm); }
.text-fluid-base { font-size: var(--font-base); }
.text-fluid-lg { font-size: var(--font-lg); }
.text-fluid-xl { font-size: var(--font-xl); }
.text-fluid-2xl { font-size: var(--font-2xl); }
```

**Then replace:**
```tsx
// Old
className="text-sm sm:text-base md:text-lg"

// New
className="text-fluid-lg"
```

### 6.2 Text Overflow & Truncation

**Current:** Manual truncation with `truncate` class

**Missing:** Multi-line truncation with ellipsis

**Add to `index.css`:**
```css
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

**Apply to:**
- Study titles in breadcrumbs
- Statement text in cards (as fallback)
- Participant names in tables

---

## 7. Touch Targets & Accessibility

### 7.1 WCAG Compliance

**Standard:** WCAG 2.1 Level AAA requires:
- **Minimum touch target:** 44x44 CSS pixels
- **Spacing:** 8px between targets (or 44x44 including spacing)

**Audit Required:** Check these components:
- Step navigation buttons (StudyLayout)
- Zoom controls (GridSort toolbar)
- Language selector (globe icon)
- Sidebar menu items (collapsed state)
- Card drag handles

**Quick Test:**
```bash
# Search for small buttons
grep -r "w-8\|h-8\|w-6\|h-6" src/components --include="*.tsx"
```

**Findings:**
- Many icon buttons use `w-8 h-8` (32x32px) ⚠️ Below minimum
- Should be `w-11 h-11` minimum (44x44px)

**Recommendation:**
```tsx
// Create touch-safe button variant
// components/ui/button.tsx

const buttonVariants = cva({
  variants: {
    size: {
      default: "h-10 px-4 py-2",
      sm: "h-9 px-3",
      lg: "h-11 px-8",
      icon: "h-11 w-11", // Changed from h-10 w-10
      "icon-sm": "h-9 w-9", // Below minimum, use sparingly
    }
  }
});
```

### 7.2 Focus Indicators

**Current:** Uses Tailwind's `ring-2` for focus states

**Issue:** Not all interactive elements have visible focus indicators

**Audit:**
```tsx
// Check if these have focus styles:
<button onClick={...} /> // Missing focus-visible:ring-2
<div role="button" tabIndex={0} /> // Missing focus indicator
```

**Recommendation:** Add global focus style:
```css
/* index.css */
*:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

---

## 8. Container Queries (Advanced)

### Current State

**Plugin Installed:** `@tailwindcss/typography` (but no container queries)

**Opportunity:** Replace some media queries with container queries for component-level responsiveness.

**Example Use Case:** Card layout in `GridSort` could respond to its container size, not viewport size.

**Implementation:**

1. **Install plugin:**
```bash
npm install @tailwindcss/container-queries
```

2. **Update tailwind.config.js:**
```js
plugins: [
  require("tailwindcss-animate"),
  require("@tailwindcss/typography"),
  require("@tailwindcss/container-queries"),
]
```

3. **Use in components:**
```tsx
// GridSort.tsx
<div className="@container">
  <div className="grid @md:grid-cols-2 @lg:grid-cols-3">
    {/* Cards respond to container width, not viewport */}
  </div>
</div>
```

**Benefits:**
- Reusable components adapt to any container size
- Designer preview can show different layouts without resizing browser
- Admin sidebar collapse doesn't break card layouts

---

## 9. Performance Optimizations

### 9.1 Resize Listeners

**Issue:** Multiple components attach window resize listeners:
- `useGridCalculations.ts` (ResizeObserver)
- `useGridZoom.ts` (window resize)
- `use-mobile.tsx` (matchMedia)

**Problem:** Each listener triggers reflows/repaints

**Recommendation:** Centralize in a single hook:

```typescript
// hooks/useViewport.ts
export const useViewport = () => {
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < 768,
    isDesktop: window.innerWidth >= 1024,
  });

  useEffect(() => {
    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setViewport({
          width: window.innerWidth,
          height: window.innerHeight,
          isMobile: window.innerWidth < 768,
          isDesktop: window.innerWidth >= 1024,
        });
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return viewport;
};
```

### 9.2 Font Loading

**Current:** Google Fonts loaded via CDN (preconnect)

**Issue:** Font swap can cause layout shift (CLS)

**Recommendation:**
1. Self-host fonts (already done for Google Sans Flex Local)
2. Add `font-display: swap` (already done ✅)
3. Add size-adjust for fallback fonts:

```css
@font-face {
  font-family: "Google Sans Flex Local";
  font-display: swap;
  size-adjust: 100%; /* Match x-height of fallback */
  ascent-override: 105%;
  descent-override: 35%;
}
```

---

## 10. Testing Gaps

### 10.1 Mobile Test Coverage

**Found:** Commented-out mobile tests:
- `FineSortPage.mobile.test.tsx` (selection state issues)
- Mobile detection doesn't trigger properly in JSDOM

**Problem:** Hard to catch mobile-specific regressions

**Recommendation:**
1. Use Playwright/Cypress for E2E mobile testing
2. Add viewport emulation:
   ```typescript
   // playwright.config.ts
   projects: [
     { name: 'mobile-chrome', use: { ...devices['iPhone 13'] } },
     { name: 'mobile-safari', use: { ...devices['iPhone 13 Pro'] } },
     { name: 'tablet', use: { ...devices['iPad Pro'] } },
   ]
   ```

### 10.2 Responsive Visual Regression

**Missing:** No visual regression tests for responsive breakpoints

**Recommendation:** Use Percy, Chromatic, or Playwright screenshots:
```typescript
test.describe('Responsive Layout', () => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }]) {
    test(`renders at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/study/test/rough-sort');
      await expect(page).toHaveScreenshot();
    });
  }
});
```

---

## 11. Prioritized Recommendations

### Immediate (Fix Now)

| Issue | Priority | Impact | Effort |
|-------|----------|--------|--------|
| Standardize breakpoints (768px vs. 1024px) | 🔴 HIGH | Prevents layout bugs | 2-4 hours |
| Fix z-index conflicts (header/modal) | 🔴 HIGH | Modal visibility issues | 1-2 hours |
| Increase touch target sizes (44x44px) | 🔴 HIGH | Accessibility violation | 2-3 hours |
| Add safe-area-inset for iOS notches | 🟠 MEDIUM | Content clipping on iPhone | 1 hour |

### Short-Term (Next Sprint)

| Issue | Priority | Impact | Effort |
|-------|----------|--------|--------|
| Centralize viewport hooks | 🟠 MEDIUM | Performance, consistency | 3-5 hours |
| Add container queries | 🟡 LOW | Component reusability | 4-6 hours |
| Implement fluid typography | 🟡 LOW | Visual polish | 2-3 hours |
| Enhance viewport meta tag | 🟡 LOW | iOS compatibility | 15 min |

### Long-Term (Technical Debt)

| Issue | Priority | Impact | Effort |
|-------|----------|--------|--------|
| Add E2E mobile tests (Playwright) | 🟠 MEDIUM | Catch regressions | 8-10 hours |
| Replace manual overflow with CSS scroll-snap | 🟡 LOW | UX improvement | 4-6 hours |
| Implement visual regression tests | 🟡 LOW | Design consistency | 6-8 hours |

---

## 12. Code Quality Metrics

### Responsive Design Patterns

| Pattern | Occurrences | Status |
|---------|-------------|--------|
| Hidden/visible classes (`hidden md:block`) | 47 files | ✅ Good |
| Responsive gap (`gap-2 sm:gap-4`) | Common | ✅ Good |
| Responsive typography (`text-sm sm:text-base`) | Common | ⚠️ Verbose |
| Aspect ratios (`aspect-[3/4]`) | 3 files | ✅ Good |
| Touch manipulation (`touch-manipulation`) | 2 files | ⚠️ Underused |
| Safe area insets | 0 files | ❌ Missing |

### Browser Compatibility

| Feature | Support | Fallback |
|---------|---------|----------|
| CSS Grid | ✅ IE11+ | N/A (required) |
| Flexbox | ✅ All | N/A (required) |
| CSS Custom Properties | ✅ All | None needed |
| Container Queries | ⚠️ Chrome 105+, Safari 16+ | Not used yet |
| `clamp()` | ✅ All modern | None needed |
| `env(safe-area-inset-*)` | ✅ iOS 11+, Chrome 69+ | Gracefully ignored |

---

## 13. Conclusion

**Strengths:**
- ✅ Mobile-first design philosophy
- ✅ Recent fixes show proactive UX attention
- ✅ Sophisticated "Focus Flow" architecture for card sorting
- ✅ Comprehensive responsive utilities via Tailwind
- ✅ Good use of semantic HTML and ARIA labels

**Critical Improvements:**
- 🔴 Standardize breakpoint system (768px vs. 1024px confusion)
- 🔴 Resolve z-index layering conflicts
- 🔴 Increase touch target sizes to meet WCAG AAA (44x44px)
- 🟠 Add safe area insets for iOS notched devices

**Strategic Enhancements:**
- 🟡 Adopt fluid typography with CSS `clamp()`
- 🟡 Implement CSS container queries for component-level responsiveness
- 🟡 Centralize viewport/breakpoint detection logic
- 🟡 Add E2E mobile testing infrastructure

**Overall:** The codebase demonstrates strong responsive design fundamentals. Addressing the breakpoint inconsistencies and touch target sizes will immediately improve reliability and accessibility. The suggested enhancements (fluid typography, container queries) will future-proof the design system as the platform scales.

---

## Appendix A: Files Requiring Attention

### Breakpoint Standardization
- `src/hooks/use-mobile.tsx` (define MOBILE_BREAKPOINT)
- `src/hooks/useGridCalculations.ts` (line 36, 103)
- `src/hooks/useGridZoom.ts` (line 49, 187)
- `src/components/GridSort.tsx`
- `src/components/CardStack.tsx`

### Z-Index Conflicts
- `src/layouts/StudyLayout.tsx` (header: z-50 → z-30)
- `src/components/GridSort.tsx` (toolbar: z-50 → z-40)
- `src/components/ui/dialog.tsx` (content: z-50 → z-modal)
- `src/components/study/HelpOverlay.tsx` (z-50 → z-modal)

### Touch Target Audit
- `src/components/ui/button.tsx` (icon variant: h-10 → h-11)
- `src/layouts/StudyLayout.tsx` (step buttons)
- `src/components/GridSort.tsx` (zoom controls)

### Safe Area Insets
- `src/index.css` (add CSS custom properties)
- `tailwind.config.js` (extend spacing utilities)
- `src/layouts/StudyLayout.tsx` (apply to header)
- `src/pages/RoughSortPage.tsx` (apply to bottom buttons)
- `src/pages/FineSortPage.tsx` (apply to bottom buttons)

---

**Next Steps:** Prioritize immediate fixes (breakpoints, z-index, touch targets) in upcoming sprint. Schedule design system workshop to discuss fluid typography and container query adoption.
