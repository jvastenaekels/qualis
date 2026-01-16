---
type: implementation_plan
created: 2026-01-15
status: planned
source: RESPONSIVENESS_LAYOUT_ANALYSIS.md
branch: TBD
focus: Systematic Responsiveness Improvements
---

# Responsiveness & Layout Improvements - Implementation Plan

> **Source Analysis:** `RESPONSIVENESS_LAYOUT_ANALYSIS.md` (798 lines)
> **Current Health Score:** 7.5/10
> **Target Health Score:** 9.0/10
> **Total Estimated Effort:** 33-48 hours

## Executive Summary

This implementation plan addresses systematic responsiveness and accessibility improvements identified in the comprehensive layout analysis. The work is structured in three phases (Immediate, Short-Term, Long-Term) to balance impact, risk, and team bandwidth.

**Key Goals:**

1. Fix critical accessibility violations (WCAG AAA compliance)
2. Standardize breakpoint system across CSS and JavaScript
3. Prevent layout conflicts and visual bugs
4. Enhance mobile experience on edge-case devices (iOS notches, small screens)
5. Improve maintainability through centralized patterns

---

## Phase 1: Immediate Fixes (Sprint 1)

**Timeline:** 1-2 weeks
**Total Effort:** 6-10 hours
**Risk Level:** Low (isolated changes)
**Impact:** High (accessibility, bug fixes)

### 1.1 Standardize Breakpoint System

**Priority:** 🔴 CRITICAL
**Effort:** 2-4 hours
**Impact:** Prevents layout bugs, improves consistency

#### Problem

- CSS uses 768px (`md:` breakpoint for mobile detection)
- JavaScript hooks use 1024px in `useGridCalculations`, `useGridZoom`
- Creates layout mismatches where CSS shows desktop while JS acts mobile

#### Implementation

**Step 1: Define breakpoint constants** (`src/constants/breakpoints.ts`)

```typescript
/**
 * Centralized breakpoint definitions matching Tailwind CSS configuration.
 * Keep in sync with tailwind.config.js screens configuration.
 */
export const BREAKPOINTS = {
  /** Mobile devices (0-767px) */
  MOBILE: 768,

  /** Tablet devices (768-1023px) */
  TABLET: 1024,

  /** Desktop devices (1024px+) */
  DESKTOP: 1024,

  /** Large desktop (1400px+) */
  WIDE: 1400,
} as const;

/**
 * Legacy constant for backward compatibility.
 * @deprecated Use BREAKPOINTS.MOBILE instead
 */
export const MOBILE_BREAKPOINT = BREAKPOINTS.MOBILE;

/**
 * Breakpoint for enabling desktop-specific features like focus mode.
 */
export const DESKTOP_FOCUS_BREAKPOINT = BREAKPOINTS.DESKTOP;
```

**Step 2: Update `useIsMobile` hook** (`src/hooks/use-mobile.tsx`)

```typescript
import { BREAKPOINTS } from "@/constants/breakpoints";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" && window.innerWidth < BREAKPOINTS.MOBILE,
  );

  useEffect(() => {
    // Use matchMedia for better performance
    const mediaQuery = window.matchMedia(
      `(max-width: ${BREAKPOINTS.MOBILE - 1}px)`,
    );

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    // Initial check
    handleChange(mediaQuery);

    // Listen for changes
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}
```

**Step 3: Create companion hooks** (`src/hooks/use-viewport.tsx`)

```typescript
import { BREAKPOINTS } from "@/constants/breakpoints";

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" && window.innerWidth >= BREAKPOINTS.DESKTOP,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(min-width: ${BREAKPOINTS.DESKTOP}px)`,
    );

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(e.matches);
    };

    handleChange(mediaQuery);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isDesktop;
}

export type Breakpoint = "mobile" | "tablet" | "desktop" | "wide";

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    if (typeof window === "undefined") return "desktop";
    const width = window.innerWidth;
    if (width < BREAKPOINTS.MOBILE) return "mobile";
    if (width < BREAKPOINTS.DESKTOP) return "tablet";
    if (width < BREAKPOINTS.WIDE) return "desktop";
    return "wide";
  });

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      if (width < BREAKPOINTS.MOBILE) setBreakpoint("mobile");
      else if (width < BREAKPOINTS.DESKTOP) setBreakpoint("tablet");
      else if (width < BREAKPOINTS.WIDE) setBreakpoint("desktop");
      else setBreakpoint("wide");
    };

    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateBreakpoint);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return breakpoint;
}
```

**Step 4: Replace direct checks**

Update these files to use hooks instead of `window.innerWidth`:

- `src/hooks/useGridCalculations.ts` (lines 36, 103)
- `src/hooks/useGridZoom.ts` (lines 49, 187)
- `src/components/GridSort.tsx` (if any direct checks)
- `src/components/CardStack.tsx` (line 47-49)
- `src/pages/RoughSortPage.tsx`
- `src/pages/FineSortPage.tsx`

**Example refactor** (`useGridCalculations.ts`):

```typescript
// Before
if (selectedCardId && window.innerWidth < 1024) return;

// After
import { useIsDesktop } from "@/hooks/use-viewport";

const isDesktop = useIsDesktop();
// Later in logic:
if (selectedCardId && !isDesktop) return;
```

#### Testing

```typescript
// src/hooks/use-viewport.test.tsx
describe("useBreakpoint", () => {
  it("returns mobile for width < 768px", () => {
    window.innerWidth = 375;
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("mobile");
  });

  it("returns tablet for width 768-1023px", () => {
    window.innerWidth = 800;
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("tablet");
  });

  it("returns desktop for width >= 1024px", () => {
    window.innerWidth = 1440;
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe("desktop");
  });
});
```

#### Acceptance Criteria

- [ ] All breakpoint values centralized in `src/constants/breakpoints.ts`
- [ ] No direct `window.innerWidth < 768|1024` checks in component code
- [ ] `useIsMobile()`, `useIsDesktop()`, `useBreakpoint()` hooks tested
- [ ] GridSort focus mode respects 1024px desktop breakpoint
- [ ] CSS `md:` and JS mobile detection aligned at 768px
- [ ] SSR-safe (no crashes with `window` undefined)

---

### 1.2 Fix Z-Index Conflicts

**Priority:** 🔴 HIGH
**Effort:** 1-2 hours
**Impact:** Prevents modal/header overlap bugs

#### Problem

Multiple components use `z-50` causing stacking conflicts:

- Header: `z-50`
- Modals/dialogs: `z-50`
- Grid toolbar: `z-50`

#### Implementation

**Step 1: Create z-index scale** (`src/styles/z-index.ts`)

```typescript
/**
 * Centralized z-index scale for consistent layering.
 * Import and use these constants instead of arbitrary z-index values.
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
```

**Step 2: Update Tailwind config** (`tailwind.config.js`)

```javascript
module.exports = {
  theme: {
    extend: {
      zIndex: {
        dropdown: "10",
        sticky: "20",
        header: "30",
        sidebar: "35",
        overlay: "40",
        toolbar: "45",
        modal: "50",
        popover: "60",
        tooltip: "70",
        notification: "80",
        emergency: "9999",
      },
    },
  },
};
```

**Step 3: Apply to components**

| Component          | Current | New                  | File                                   |
| ------------------ | ------- | -------------------- | -------------------------------------- |
| StudyLayout header | `z-50`  | `z-header` (30)      | `src/layouts/StudyLayout.tsx`          |
| GridSort toolbar   | `z-50`  | `z-toolbar` (45)     | `src/components/GridSort.tsx`          |
| Dialog             | `z-50`  | `z-modal` (50)       | `src/components/ui/dialog.tsx`         |
| HelpOverlay        | `z-50`  | `z-modal` (50)       | `src/components/study/HelpOverlay.tsx` |
| Offline banner     | (new)   | `z-emergency` (9999) | (if exists)                            |

**Example change** (`StudyLayout.tsx`):

```tsx
// Before
<header className="sticky top-0 z-50 bg-white border-b">

// After
<header className="sticky top-0 z-header bg-white border-b">
```

#### Testing

- [ ] Manual: Open modal with header visible → Modal should be above header
- [ ] Manual: Open GridSort toolbar → Should not overlap with modals
- [ ] Visual regression: Screenshot tests for layering

#### Acceptance Criteria

- [ ] Z-index scale defined in `src/styles/z-index.ts`
- [ ] Tailwind config extended with named z-index values
- [ ] All arbitrary `z-[50]`, `z-[60]`, etc. replaced with semantic names
- [ ] No visual stacking bugs in common scenarios
- [ ] Documented in `docs/reference/design-system.md`

---

### 1.3 Increase Touch Target Sizes

**Priority:** 🔴 HIGH (Accessibility)
**Effort:** 2-3 hours
**Impact:** WCAG AAA compliance

#### Problem

Many icon buttons use `w-8 h-8` (32px) which is below WCAG AAA requirement of 44x44px.

#### Implementation

**Step 1: Update button variants** (`src/components/ui/button.tsx`)

```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-11 w-11", // Changed from h-10 w-10 (WCAG AAA: 44x44px)
        "icon-sm": "h-9 w-9", // Use sparingly, below minimum
      },
    },
  },
);
```

**Step 2: Audit and update components**

Run search for undersized buttons:

```bash
grep -r "w-8 h-8\|w-6 h-6\|w-10 h-10" src/components --include="*.tsx" -n
```

Update these files:

- `src/layouts/StudyLayout.tsx` - Step navigation buttons
- `src/components/GridSort.tsx` - Zoom controls
- `src/components/ui/button.tsx` - Icon variant default
- Language selector globe icon
- Sidebar menu items (collapsed state)

**Step 3: Add touch-friendly spacing**

```css
/* src/index.css */

/** Ensure adequate spacing between touch targets (WCAG 2.5.5) */
.touch-target-group > * + * {
  margin-left: 0.5rem; /* 8px spacing minimum */
}

@media (hover: none) {
  /* On touch devices, increase spacing */
  .touch-target-group > * + * {
    margin-left: 0.75rem; /* 12px on touch devices */
  }
}
```

#### Testing

Manual accessibility audit:

```bash
# Use browser DevTools to measure elements
# All interactive elements should be >= 44x44px
```

#### Acceptance Criteria

- [ ] Button icon variant is `h-11 w-11` (44px)
- [ ] All critical touch targets >= 44x44px or have 8px spacing
- [ ] Touch target audit documented
- [ ] No regression in desktop layouts
- [ ] Test on actual mobile device (iOS/Android)

---

### 1.4 Add iOS Safe Area Insets

**Priority:** 🟠 MEDIUM
**Effort:** 1 hour
**Impact:** Fixes content clipping on notched iPhones

#### Problem

Content can be hidden behind:

- iPhone notch/Dynamic Island (top)
- Home indicator (bottom)
- Rounded corners (sides)

#### Implementation

**Step 1: Update viewport meta** (`index.html`)

```html
<!-- Before -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />

<!-- After -->
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=5.0"
/>
```

**Rationale:**

- `viewport-fit=cover`: Content extends to edges
- `maximum-scale=5.0`: Allows zoom for accessibility

**Step 2: Add safe area utilities** (`src/index.css`)

```css
/**
 * iOS Safe Area Insets
 * Ensures content is not hidden behind notches, home indicators, etc.
 */
@supports (padding: env(safe-area-inset-top)) {
  .safe-top {
    padding-top: env(safe-area-inset-top);
  }

  .safe-bottom {
    padding-bottom: env(safe-area-inset-bottom);
  }

  .safe-left {
    padding-left: env(safe-area-inset-left);
  }

  .safe-right {
    padding-right: env(safe-area-inset-right);
  }

  .safe-inset {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
```

**Step 3: Extend Tailwind** (`tailwind.config.js`)

```javascript
module.exports = {
  theme: {
    extend: {
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
    },
  },
};
```

**Step 4: Apply to fixed elements**

```tsx
// src/layouts/StudyLayout.tsx - Header
<header className="sticky top-0 z-header bg-white border-b pt-safe-top">
  {/* content */}
</header>

// src/pages/RoughSortPage.tsx - Bottom button
<div className="pb-safe-bottom">
  <Button>Continue</Button>
</div>

// src/pages/FineSortPage.tsx - Validation footer
<div className="pb-safe-bottom">
  {/* validation UI */}
</div>

// src/components/GridSort.tsx - Toolbar (if sticky)
<div className="sticky top-safe-top">
  {/* zoom controls */}
</div>
```

#### Testing

Test on:

- iPhone 14 Pro (with Dynamic Island)
- iPhone 15/15 Plus (with notch)
- Landscape orientation
- Verify via Safari Desktop with device simulation

#### Acceptance Criteria

- [ ] Viewport meta includes `viewport-fit=cover`
- [ ] Safe area CSS utilities defined
- [ ] Tailwind config extended with safe area spacing
- [ ] Applied to header, bottom buttons, fixed toolbars
- [ ] Tested on physical iPhone or Safari simulator
- [ ] No content clipped in landscape/portrait

---

## Phase 2: Short-Term Improvements (Sprint 2-3)

**Timeline:** 2-4 weeks
**Total Effort:** 9-14 hours
**Risk Level:** Medium (refactoring, potential regressions)
**Impact:** Medium-High (maintainability, performance)

### 2.1 Centralize Viewport Detection

**Priority:** 🟠 MEDIUM
**Effort:** 3-5 hours
**Impact:** Better testability, performance, SSR safety

#### Problem

Multiple components attach separate resize listeners:

- `useGridCalculations.ts` - ResizeObserver
- `useGridZoom.ts` - window resize
- `use-mobile.tsx` - matchMedia

Each listener triggers reflows/repaints independently.

#### Implementation

**Step 1: Create centralized viewport context** (`src/contexts/ViewportContext.tsx`)

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BREAKPOINTS } from '@/constants/breakpoints';

interface ViewportContextValue {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  breakpoint: 'mobile' | 'tablet' | 'desktop' | 'wide';
}

const ViewportContext = createContext<ViewportContextValue | undefined>(undefined);

export function ViewportProvider({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState<ViewportContextValue>(() => {
    if (typeof window === 'undefined') {
      return {
        width: 1024,
        height: 768,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isWide: false,
        breakpoint: 'desktop',
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const isMobile = width < BREAKPOINTS.MOBILE;
    const isTablet = width >= BREAKPOINTS.MOBILE && width < BREAKPOINTS.DESKTOP;
    const isDesktop = width >= BREAKPOINTS.DESKTOP;
    const isWide = width >= BREAKPOINTS.WIDE;

    let breakpoint: ViewportContextValue['breakpoint'];
    if (width < BREAKPOINTS.MOBILE) breakpoint = 'mobile';
    else if (width < BREAKPOINTS.DESKTOP) breakpoint = 'tablet';
    else if (width < BREAKPOINTS.WIDE) breakpoint = 'desktop';
    else breakpoint = 'wide';

    return { width, height, isMobile, isTablet, isDesktop, isWide, breakpoint };
  });

  useEffect(() => {
    let rafId: number;

    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isMobile = width < BREAKPOINTS.MOBILE;
        const isTablet = width >= BREAKPOINTS.MOBILE && width < BREAKPOINTS.DESKTOP;
        const isDesktop = width >= BREAKPOINTS.DESKTOP;
        const isWide = width >= BREAKPOINTS.WIDE;

        let breakpoint: ViewportContextValue['breakpoint'];
        if (width < BREAKPOINTS.MOBILE) breakpoint = 'mobile';
        else if (width < BREAKPOINTS.DESKTOP) breakpoint = 'tablet';
        else if (width < BREAKPOINTS.WIDE) breakpoint = 'desktop';
        else breakpoint = 'wide';

        setViewport({ width, height, isMobile, isTablet, isDesktop, isWide, breakpoint });
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <ViewportContext.Provider value={viewport}>
      {children}
    </ViewportContext.Provider>
  );
}

export function useViewport(): ViewportContextValue {
  const context = useContext(ViewportContext);
  if (!context) {
    throw new Error('useViewport must be used within ViewportProvider');
  }
  return context;
}

// Convenience hooks
export function useIsMobile(): boolean {
  return useViewport().isMobile;
}

export function useIsDesktop(): boolean {
  return useViewport().isDesktop;
}

export function useBreakpoint() {
  return useViewport().breakpoint;
}
```

**Step 2: Add provider to app** (`src/App.tsx` or `src/main.tsx`)

```tsx
import { ViewportProvider } from "@/contexts/ViewportContext";

function App() {
  return <ViewportProvider>{/* existing providers */}</ViewportProvider>;
}
```

**Step 3: Migrate components**

Replace individual hooks/checks with `useViewport()`:

```typescript
// Before
const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

// After
const { isMobile } = useViewport();
```

#### Acceptance Criteria

- [ ] Single shared viewport context
- [ ] All components use `useViewport()` instead of direct checks
- [ ] Performance: Only one resize listener globally
- [ ] SSR-safe initialization
- [ ] Tests pass with viewport mocking

---

### 2.2 Implement Fluid Typography

**Priority:** 🟡 LOW
**Effort:** 2-3 hours
**Impact:** Visual polish, fewer breakpoint classes

#### Implementation

**Step 1: Define fluid scale** (`src/index.css`)

```css
:root {
  /* Fluid typography using clamp() */
  --font-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem); /* 12-14px */
  --font-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem); /* 14-16px */
  --font-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem); /* 16-18px */
  --font-lg: clamp(1.125rem, 1rem + 0.625vw, 1.5rem); /* 18-24px */
  --font-xl: clamp(1.25rem, 1.1rem + 0.75vw, 1.875rem); /* 20-30px */
  --font-2xl: clamp(1.5rem, 1.3rem + 1vw, 2.25rem); /* 24-36px */
  --font-3xl: clamp(1.875rem, 1.5rem + 1.5vw, 3rem); /* 30-48px */
}

.text-fluid-xs {
  font-size: var(--font-xs);
}
.text-fluid-sm {
  font-size: var(--font-sm);
}
.text-fluid-base {
  font-size: var(--font-base);
}
.text-fluid-lg {
  font-size: var(--font-lg);
}
.text-fluid-xl {
  font-size: var(--font-xl);
}
.text-fluid-2xl {
  font-size: var(--font-2xl);
}
.text-fluid-3xl {
  font-size: var(--font-3xl);
}
```

**Step 2: Replace manual breakpoints**

```tsx
// Before (verbose)
<h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl">

// After (clean)
<h1 className="text-fluid-3xl">
```

#### Acceptance Criteria

- [ ] Fluid typography scale defined
- [ ] High-use headings migrated to fluid classes
- [ ] Visual regression tests pass
- [ ] Typography documented in design system

---

### 2.3 Add Container Queries

**Priority:** 🟡 LOW
**Effort:** 4-6 hours
**Impact:** Component-level responsiveness

#### Implementation

**Step 1: Install plugin**

```bash
npm install @tailwindcss/container-queries
```

**Step 2: Update Tailwind config**

```javascript
module.exports = {
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/container-queries"),
  ],
};
```

**Step 3: Apply to GridSort**

```tsx
// src/components/GridSort.tsx
<div className="@container">
  <div className="grid @md:grid-cols-2 @lg:grid-cols-3">
    {/* Cards respond to container width, not viewport */}
  </div>
</div>
```

#### Acceptance Criteria

- [ ] Plugin installed and configured
- [ ] GridSort uses container queries
- [ ] Components responsive to container, not viewport
- [ ] Admin preview works without full-page resize

---

## Phase 3: Long-Term Enhancements (Sprint 4+)

**Timeline:** 4-6 weeks
**Total Effort:** 18-24 hours
**Risk Level:** Low-Medium
**Impact:** Medium (testing infrastructure, UX polish)

### 3.1 E2E Mobile Testing

**Priority:** 🟠 MEDIUM
**Effort:** 8-10 hours

#### Implementation

**Update Playwright config** (`playwright.config.ts`)

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "Tablet iPad",
      use: { ...devices["iPad Pro"] },
    },
  ],
});
```

#### Acceptance Criteria

- [ ] E2E tests run on mobile viewports
- [ ] Critical flows tested (study completion)
- [ ] Touch interactions validated

---

### 3.2 Visual Regression Testing

**Priority:** 🟡 LOW
**Effort:** 6-8 hours

#### Implementation

Use Playwright screenshots:

```typescript
test("GridSort responsive layout", async ({ page }) => {
  for (const viewport of [
    { width: 375, height: 667, name: "mobile" },
    { width: 768, height: 1024, name: "tablet" },
    { width: 1440, height: 900, name: "desktop" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/study/test/fine-sort");
    await expect(page).toHaveScreenshot(`grid-sort-${viewport.name}.png`);
  }
});
```

---

### 3.3 Advanced CSS Improvements

**Priority:** 🟡 LOW
**Effort:** 4-6 hours

- Custom scrollbar styles (Firefox support)
- Touch-action properties for scroll areas
- Overscroll-behavior for nested scrolls

---

## Testing Strategy

### Unit Tests

```bash
# Run breakpoint hook tests
npm run test -- use-viewport

# Run component integration tests
npm run test -- GridSort
```

### E2E Tests

```bash
# Run mobile-specific E2E tests
npm run test:e2e -- --project="Mobile Chrome"

# Visual regression
npm run test:e2e -- --update-snapshots
```

### Manual Testing Checklist

**Devices to test:**

- [ ] iPhone 13/14 (Safari, Chrome)
- [ ] iPhone 14 Pro (Dynamic Island)
- [ ] iPad Pro (Safari, split-screen)
- [ ] Android phone <360px wide (Galaxy Fold)
- [ ] Desktop 1920x1080
- [ ] Desktop 4K

**Scenarios:**

- [ ] Study completion flow (all steps)
- [ ] Modal opening/closing
- [ ] GridSort zoom/pan
- [ ] Keyboard navigation
- [ ] Portrait/landscape rotation
- [ ] Zoom accessibility (200% browser zoom)

---

## Success Metrics

| Metric                      | Before             | Target     | Measurement        |
| --------------------------- | ------------------ | ---------- | ------------------ |
| **Health Score**            | 7.5/10             | 9.0/10     | Manual audit       |
| **WCAG Compliance**         | Level AA (partial) | Level AAA  | Lighthouse audit   |
| **Touch Target Violations** | ~15 elements       | 0 elements | Accessibility scan |
| **Breakpoint Consistency**  | 60%                | 100%       | Code review        |
| **Mobile Test Coverage**    | ~20%               | 80%        | Test report        |
| **Lighthouse Mobile Score** | TBD                | 90+        | Lighthouse CI      |

---

## Risk Management

### High-Risk Changes

1. **Breakpoint refactoring** - Could break existing layouts
   - Mitigation: Comprehensive visual regression tests
   - Rollback plan: Git revert + hotfix deploy

2. **Z-index changes** - May reveal hidden layering bugs
   - Mitigation: Manual testing of all modal/overlay scenarios
   - Rollback plan: Keep old z-index values in comments

### Medium-Risk Changes

3. **Viewport context** - Centralized state could impact performance
   - Mitigation: Performance profiling before/after
   - Rollback plan: Keep individual hooks as fallback

---

## Dependencies

**Phase 1 → Phase 2:**

- Phase 2.1 (Viewport context) depends on Phase 1.1 (Breakpoint constants)

**Phase 2 → Phase 3:**

- Phase 3.1 (E2E mobile tests) validates Phase 1 & 2 changes

**External Dependencies:**

- None (all changes internal to codebase)

---

## Rollout Strategy

### Week 1-2: Phase 1 (Immediate Fixes)

- Day 1-2: Breakpoint standardization
- Day 3: Z-index fixes
- Day 4-5: Touch targets + Safe areas
- Day 6-7: Testing + Bug fixes

### Week 3-4: Phase 2 (Short-Term)

- Week 3: Viewport context + Fluid typography
- Week 4: Container queries + Documentation

### Week 5+: Phase 3 (Long-Term)

- Spread over multiple sprints
- E2E testing infrastructure
- Visual regression setup
- Advanced CSS improvements

---

## Documentation Updates

After completion, update:

- [ ] `docs/reference/design-system.md` - Z-index scale, breakpoints
- [ ] `docs/guides/contributing/development.md` - Viewport hooks usage
- [ ] `docs/guides/accessibility.md` - Touch target requirements
- [ ] `README.md` - Testing strategy updates
- [ ] Component Storybook docs (if applicable)

---

## Appendix: File Checklist

### Phase 1 Files

**New:**

- `src/constants/breakpoints.ts`
- `src/styles/z-index.ts`

**Modified:**

- `src/hooks/use-mobile.tsx`
- `src/hooks/use-viewport.tsx` (new)
- `src/hooks/useGridCalculations.ts`
- `src/hooks/useGridZoom.ts`
- `src/components/GridSort.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/dialog.tsx`
- `src/layouts/StudyLayout.tsx`
- `src/pages/RoughSortPage.tsx`
- `src/pages/FineSortPage.tsx`
- `src/index.css`
- `tailwind.config.js`
- `index.html`

### Phase 2 Files

**New:**

- `src/contexts/ViewportContext.tsx`

**Modified:**

- `src/App.tsx` or `src/main.tsx`
- Components using viewport detection

### Phase 3 Files

**New:**

- E2E test files for mobile
- Visual regression test utilities

**Modified:**

- `playwright.config.ts`

---

**Next Steps:**

1. Review and approve this plan with team
2. Create GitHub issues for each phase
3. Schedule Phase 1 for next sprint
4. Assign ownership for each task
5. Set up tracking dashboard for metrics

**Document Version:** 1.0
**Last Updated:** 2026-01-15
**Status:** 📋 Awaiting Approval
