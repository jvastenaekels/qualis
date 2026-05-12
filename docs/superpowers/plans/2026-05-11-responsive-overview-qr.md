# Responsive Overview QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed responsive regressions around the admin overview, recruitment QR controls, narrow metric cards, designer tabs, and long text in participant-facing Markdown/buttons.

**Architecture:** Keep changes local first: make the overview grid switch to dense desktop layout later, make `RecruitmentModule` layout-agnostic, and opt affected buttons into wrapping instead of changing the global `Button` contract immediately. Add focused component tests for class-level responsive contracts and one Playwright smoke spec for real viewport overflow detection.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright.

---

## File Map

- Modify: `frontend/src/pages/admin/StudyOverviewPage.tsx`
  - Move metric cards and the overview side column from `md` to `lg` breakpoints.
  - Add `min-w-0`/wrapping to metric labels so labels do not force card overflow.
- Modify: `frontend/src/components/admin/dashboard/RecruitmentModule.tsx`
  - Remove grid-span responsibility from the card.
  - Make QR/Live buttons one-column in narrow sidebars, two-column only where there is enough width.
  - Let text buttons wrap cleanly with stable minimum heights.
- Modify: `frontend/src/pages/WelcomePage.tsx`
  - Keep the existing CTA full-width on mobile, but allow wrapped text.
- Modify: `frontend/src/pages/ConsentPage.tsx`
  - Add `min-w-0`/`w-full` to the page/form wrappers and make the submit CTA wrap safely.
- Modify: `frontend/src/components/SafeMarkdown.tsx`
  - Add `break-words [overflow-wrap:anywhere]` to protect prose against URLs and long unbroken strings.
- Modify: `frontend/src/pages/admin/StudyDesignPage.tsx`
  - Keep tabs horizontally scrollable, but make the scroll affordance visible enough by removing fully hidden scrollbar on the tab strip.
- Create: `frontend/src/components/admin/dashboard/RecruitmentModule.responsive.test.tsx`
  - Assert responsive classes and QR expanded state contracts.
- Create: `frontend/src/pages/admin/StudyOverviewPage.responsive.test.tsx`
  - Assert overview breakpoint classes and metric label wrapping contracts.
- Create: `frontend/tests/responsive-overflow.spec.ts`
  - Playwright smoke test for `/app/:projectSlug/studies/:studySlug` at `320`, `375`, and `768`, including QR opened.

---

### Task 1: Lock The Recruitment Module Responsive Contract

**Files:**
- Create: `frontend/src/components/admin/dashboard/RecruitmentModule.responsive.test.tsx`
- Modify later: `frontend/src/components/admin/dashboard/RecruitmentModule.tsx`

- [ ] **Step 1: Add failing tests for the QR/action layout**

Create `frontend/src/components/admin/dashboard/RecruitmentModule.responsive.test.tsx`:

```tsx
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import RecruitmentModule from './RecruitmentModule';

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('RecruitmentModule responsive layout', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: new URL('https://qualis.test/app/project/studies/study'),
            writable: true,
        });
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });
        vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('keeps grid ownership outside of the reusable card', () => {
        const { container } = renderWithProviders(<RecruitmentModule slug="long-study" />);

        const card = container.querySelector('[data-testid="recruitment-module"]');

        expect(card?.className).not.toContain('md:col-span-4');
        expect(card?.className).not.toContain('col-span-12');
    });

    it('uses a single-column action layout in narrow sidebar breakpoints', () => {
        const { container } = renderWithProviders(<RecruitmentModule slug="long-study" />);

        const actions = container.querySelector('[data-testid="recruitment-actions"]');

        expect(actions?.className).toContain('grid-cols-1');
        expect(actions?.className).toContain('sm:grid-cols-2');
        expect(actions?.className).toContain('lg:grid-cols-1');
        expect(actions?.className).toContain('xl:grid-cols-2');
    });

    it('allows QR and live-study labels to wrap instead of clipping', () => {
        renderWithProviders(<RecruitmentModule slug="long-study" />);

        const showQr = screen.getByRole('button', { name: /show qr/i });
        const liveStudy = screen.getByRole('button', { name: /live study/i });

        expect(showQr.className).toContain('whitespace-normal');
        expect(showQr.className).toContain('h-auto');
        expect(liveStudy.className).toContain('whitespace-normal');
        expect(liveStudy.className).toContain('h-auto');
    });

    it('allows the expanded download button label to wrap', async () => {
        const user = userEvent.setup();
        renderWithProviders(<RecruitmentModule slug="long-study" />);

        await user.click(screen.getByRole('button', { name: /show qr/i }));

        const download = screen.getByRole('button', { name: /download image/i });
        expect(download.className).toContain('whitespace-normal');
        expect(download.className).toContain('h-auto');
    });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd frontend
npm test -- RecruitmentModule.responsive.test.tsx
```

Expected: fail because `data-testid` values and the new responsive classes are not present.

- [ ] **Step 3: Implement the minimal recruitment module changes**

In `frontend/src/components/admin/dashboard/RecruitmentModule.tsx`, make these exact JSX class changes:

```tsx
<Card
    data-testid="recruitment-module"
    className="shadow-md border-none bg-white overflow-hidden h-fit min-w-0"
>
```

Replace the public URL row with:

```tsx
<div className="flex gap-2 min-w-0">
    <Input
        id="public-url"
        readOnly
        value={publicUrl}
        className="min-w-0 bg-slate-50 border-slate-100 text-xs text-slate-500 font-mono focus-visible:ring-indigo-500"
    />
    <Button
        variant="outline"
        size="icon"
        onClick={handleCopy}
        className="bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600 shrink-0"
        aria-label={copied ? t('admin.recruitment.copied', 'Copied') : t('admin.recruitment.copy_url', 'Copy URL')}
    >
        {copied ? (
            <Check className="h-4 w-4 text-emerald-500" />
        ) : (
            <Copy className="h-4 w-4" />
        )}
    </Button>
</div>
```

Replace the two-button action grid with:

```tsx
<div
    data-testid="recruitment-actions"
    className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-1 xl:grid-cols-2"
>
    <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowQR(!showQR)}
        className="w-full min-w-0 h-auto min-h-8 whitespace-normal text-center leading-tight gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border-none font-bold"
    >
        <QrCode className="h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">
            {showQR
                ? t('admin.recruitment.hide_qr', 'Hide QR')
                : t('admin.recruitment.show_qr', 'Show QR')}
        </span>
    </Button>
    <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="w-full min-w-0 h-auto min-h-8 whitespace-normal text-center leading-tight gap-2 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 font-bold"
    >
        <ExternalLink className="h-4 w-4 shrink-0" />
        <span className="min-w-0 break-words">
            {t('admin.recruitment.live_study', 'Live Study')}
        </span>
    </Button>
</div>
```

Replace the download button with:

```tsx
<Button
    variant="outline"
    size="sm"
    onClick={handleDownloadQR}
    className="w-full min-w-0 h-auto min-h-8 whitespace-normal text-center leading-tight gap-2 border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl"
>
    <Download className="h-3.5 w-3.5 shrink-0" />
    <span className="min-w-0 break-words">
        {t('admin.recruitment.download_qr', 'Download Image')}
    </span>
</Button>
```

- [ ] **Step 4: Run the recruitment module test**

Run:

```bash
cd frontend
npm test -- RecruitmentModule.responsive.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/dashboard/RecruitmentModule.tsx frontend/src/components/admin/dashboard/RecruitmentModule.responsive.test.tsx
git commit -m "fix: make recruitment QR controls responsive"
```

---

### Task 2: Fix Overview Breakpoints And Metric Card Labels

**Files:**
- Create: `frontend/src/pages/admin/StudyOverviewPage.responsive.test.tsx`
- Modify: `frontend/src/pages/admin/StudyOverviewPage.tsx`

- [ ] **Step 1: Add failing tests for overview layout classes**

Create `frontend/src/pages/admin/StudyOverviewPage.responsive.test.tsx`:

```tsx
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, expect, it, vi } from 'vitest';
import StudyOverviewPage from './StudyOverviewPage';

const loaderData = {
    stats: {
        started_count: 24,
        completed_count: 9,
        median_duration_seconds: 88,
    },
    participants: [],
    study: {
        state: 'active',
        translations: [
            {
                language_code: 'en',
                title: 'Study overview with a long title',
            },
        ],
    },
    slug: 'long-study',
};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: () => loaderData,
        useRevalidator: () => ({ revalidate: vi.fn() }),
    };
});

vi.mock('@/hooks/useAdminContext', () => ({
    useAdminContext: () => ({
        project: { id: 1, slug: 'long-project', title: 'Long Project' },
    }),
}));

vi.mock('@/components/admin/dashboard/StudyStatusControl', () => ({
    default: () => <div data-testid="study-status-control" />,
}));

vi.mock('@/components/admin/dashboard/RecentActivityCard', () => ({
    default: () => <div data-testid="recent-activity-card" />,
}));

vi.mock('@/components/admin/dashboard/RecruitmentModule', () => ({
    default: () => <div data-testid="recruitment-module" />,
}));

describe('StudyOverviewPage responsive layout', () => {
    it('does not switch metric cards to three columns at the md breakpoint', () => {
        const { container } = renderWithProviders(<StudyOverviewPage />);

        const metricsGrid = container.querySelector('[data-testid="overview-metrics-grid"]');

        expect(metricsGrid?.className).toContain('lg:grid-cols-3');
        expect(metricsGrid?.className).not.toContain('md:grid-cols-3');
    });

    it('does not put the recruitment column into a narrow md sidebar', () => {
        const { container } = renderWithProviders(<StudyOverviewPage />);

        const contentGrid = container.querySelector('[data-testid="overview-content-grid"]');
        const recruitmentColumn = container.querySelector('[data-testid="overview-recruitment-column"]');

        expect(contentGrid?.className).toContain('lg:grid-cols-12');
        expect(contentGrid?.className).not.toContain('md:grid-cols-12');
        expect(recruitmentColumn?.className).toContain('lg:col-span-4');
        expect(recruitmentColumn?.className).not.toContain('md:col-span-4');
    });

    it('allows metric labels to wrap inside narrow cards', () => {
        renderWithProviders(<StudyOverviewPage />);

        const sampleSize = screen.getByText(/sample size/i);
        const completionRate = screen.getByText(/completion rate/i);
        const medianDuration = screen.getByText(/median duration/i);

        expect(sampleSize.className).toContain('min-w-0');
        expect(sampleSize.className).toContain('break-words');
        expect(completionRate.className).toContain('min-w-0');
        expect(medianDuration.className).toContain('min-w-0');
    });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd frontend
npm test -- StudyOverviewPage.responsive.test.tsx
```

Expected: fail because `data-testid` values and `lg` breakpoint classes are not present.

- [ ] **Step 3: Implement overview layout changes**

In `frontend/src/pages/admin/StudyOverviewPage.tsx`, replace:

```tsx
<div className="grid gap-3 sm:gap-4 md:grid-cols-3">
```

with:

```tsx
<div data-testid="overview-metrics-grid" className="grid gap-3 sm:gap-4 lg:grid-cols-3">
```

In each metric card header, replace label spans like:

```tsx
<span className="text-xs font-bold text-slate-500">
```

with:

```tsx
<span className="min-w-0 text-xs font-bold text-slate-500 leading-tight break-words">
```

Replace:

```tsx
<div className="grid gap-6 md:grid-cols-12 pb-12">
```

with:

```tsx
<div data-testid="overview-content-grid" className="grid gap-6 lg:grid-cols-12 pb-12">
```

Replace:

```tsx
<div className="col-span-12 md:col-span-4 space-y-6">
```

with:

```tsx
<div data-testid="overview-recruitment-column" className="col-span-12 lg:col-span-4 space-y-6 min-w-0">
```

- [ ] **Step 4: Run the overview responsive test**

Run:

```bash
cd frontend
npm test -- StudyOverviewPage.responsive.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/StudyOverviewPage.tsx frontend/src/pages/admin/StudyOverviewPage.responsive.test.tsx
git commit -m "fix: delay overview desktop layout breakpoint"
```

---

### Task 3: Protect Markdown And Participant CTA Text From Overflow

**Files:**
- Modify: `frontend/src/components/SafeMarkdown.tsx`
- Modify: `frontend/src/pages/ConsentPage.tsx`
- Modify: `frontend/src/pages/WelcomePage.tsx`
- Test: `frontend/src/components/SafeMarkdown.test.tsx`

- [ ] **Step 1: Add a failing SafeMarkdown class assertion**

If `frontend/src/components/SafeMarkdown.test.tsx` does not exist, create it. If it exists, append the test below:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

describe('SafeMarkdown responsive text handling', () => {
    it('applies wrapping utilities for long URLs and unbroken strings', () => {
        render(
            <SafeMarkdown>
                {'https://example.test/a/very/very/very/long/path/that/should/wrap'}
            </SafeMarkdown>
        );

        const wrapper = screen.getByText(/example\.test/).closest('.prose');

        expect(wrapper?.className).toContain('break-words');
        expect(wrapper?.className).toContain('[overflow-wrap:anywhere]');
    });
});
```

- [ ] **Step 2: Run the failing SafeMarkdown test**

Run:

```bash
cd frontend
npm test -- SafeMarkdown.test.tsx
```

Expected: fail because `break-words` and `[overflow-wrap:anywhere]` are not present.

- [ ] **Step 3: Implement SafeMarkdown wrapping**

In `frontend/src/components/SafeMarkdown.tsx`, replace the wrapper class:

```tsx
className={`prose prose-sm max-w-none text-slate-600 [hyphens:manual] ${className || ''}`}
```

with:

```tsx
className={`prose prose-sm max-w-none min-w-0 text-slate-600 break-words [overflow-wrap:anywhere] [hyphens:manual] ${className || ''}`}
```

- [ ] **Step 4: Make consent page wrappers shrink safely**

In `frontend/src/pages/ConsentPage.tsx`, replace:

```tsx
<div className="max-w-2xl mx-auto py-6 sm:py-12 px-4 animate-in fade-in duration-500">
```

with:

```tsx
<div className="w-full max-w-2xl min-w-0 mx-auto py-6 sm:py-12 px-4 animate-in fade-in duration-500">
```

Replace the form class:

```tsx
className="bg-white p-5 sm:p-8 rounded-xl border border-gray-200 shadow-sm space-y-8"
```

with:

```tsx
className="w-full min-w-0 bg-white p-5 sm:p-8 rounded-xl border border-gray-200 shadow-sm space-y-8"
```

Replace the submit button class:

```tsx
className="w-full sm:w-auto px-8 py-3 text-white rounded-md font-bold text-base hover:brightness-110 shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
```

with:

```tsx
className="w-full sm:w-auto min-w-0 h-auto min-h-12 px-6 sm:px-8 py-3 text-white rounded-md font-bold text-base leading-tight hover:brightness-110 shadow-md flex items-center justify-center gap-2 whitespace-normal text-center disabled:opacity-50 disabled:cursor-not-allowed transition-all"
```

- [ ] **Step 5: Make welcome CTA wrap safely**

In `frontend/src/pages/WelcomePage.tsx`, replace the main start button class segment:

```tsx
'group w-full sm:w-auto px-10 py-4 text-white rounded-full font-bold text-lg hover:brightness-110 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3'
```

with:

```tsx
'group w-full sm:w-auto min-w-0 h-auto min-h-14 px-6 sm:px-10 py-4 text-white rounded-full font-bold text-lg leading-tight hover:brightness-110 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 whitespace-normal text-center'
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd frontend
npm test -- SafeMarkdown.test.tsx ConsentPage.test.tsx WelcomePage.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SafeMarkdown.tsx frontend/src/components/SafeMarkdown.test.tsx frontend/src/pages/ConsentPage.tsx frontend/src/pages/WelcomePage.tsx
git commit -m "fix: prevent long prose and CTA overflow"
```

---

### Task 4: Improve Designer Tab Scroll Discoverability

**Files:**
- Modify: `frontend/src/pages/admin/StudyDesignPage.tsx`
- Test: `frontend/src/pages/admin/StudyDesignPage.responsive.test.tsx`

- [ ] **Step 1: Add a failing test for visible horizontal overflow affordance**

Append to `frontend/src/pages/admin/StudyDesignPage.responsive.test.tsx`:

```tsx
it('keeps the main tab list horizontally scrollable with a visible affordance', async () => {
    renderPage();

    await screen.findByRole('tab', {
        name: /(General|admin\.design\.tabs\.welcome)/i,
    });

    const tabList = screen.getByRole('tablist');

    expect(tabList.className).toContain('overflow-x-auto');
    expect(tabList.className).toContain('scrollbar-thin');
    expect(tabList.className).not.toContain('scrollbar-hide');
    expect(tabList.className).not.toContain('[&::-webkit-scrollbar]:hidden');
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd frontend
npm test -- StudyDesignPage.responsive.test.tsx
```

Expected: fail because the tab list currently hides its scrollbar.

- [ ] **Step 3: Change the tab list class**

In `frontend/src/pages/admin/StudyDesignPage.tsx`, find the `TabsList` with class containing:

```tsx
scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]
```

Replace the full `className` with:

```tsx
className="bg-white/70 backdrop-blur-md border border-slate-200/60 p-1 flex flex-nowrap justify-start overflow-x-auto w-full max-w-full shadow-sm snap-x snap-mandatory scroll-smooth rounded-xl h-12 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
```

- [ ] **Step 4: Run the responsive design page test**

Run:

```bash
cd frontend
npm test -- StudyDesignPage.responsive.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/StudyDesignPage.tsx frontend/src/pages/admin/StudyDesignPage.responsive.test.tsx
git commit -m "fix: show designer tab scroll affordance"
```

---

### Task 5: Add Browser-Level Overflow Regression Coverage

**Files:**
- Create: `frontend/tests/responsive-overflow.spec.ts`

- [ ] **Step 1: Add Playwright overflow smoke test**

Create `frontend/tests/responsive-overflow.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const projectSlug = 'responsive-project';
const studySlug = 'responsive-study';

const project = {
    id: 1,
    slug: projectSlug,
    title: 'Responsive Project',
    user_role: 'owner',
};

const user = {
    id: 1,
    email: 'researcher.with.long.email@example.test',
    full_name: 'Responsive Researcher',
    is_superuser: true,
};

const study = {
    id: 1,
    slug: studySlug,
    project_id: 1,
    state: 'active',
    rough_sort_enabled: true,
    translations: [
        {
            language_code: 'en',
            title: 'Responsive study with a long but valid title',
        },
    ],
    grid_config: [],
    statements: [],
    presort_config: {},
    postsort_config: {},
};

function responseFor(pathname: string) {
    if (pathname === '/api/me') return user;
    if (pathname === '/api/admin/projects') {
        return { items: [project], total: 1, page: 1, size: 50, pages: 1 };
    }
    if (pathname === `/api/admin/projects/${projectSlug}`) return project;
    if (pathname === `/api/admin/studies/${studySlug}`) return study;
    if (pathname === `/api/admin/studies/${studySlug}/stats`) {
        return { started_count: 24, completed_count: 9, median_duration_seconds: 88 };
    }
    if (pathname === `/api/admin/studies/${studySlug}/participants`) {
        return { items: [], total: 0, page: 1, size: 50, pages: 0 };
    }
    return { items: [], total: 0, page: 1, size: 50, pages: 0 };
}

async function installMocks(page: import('@playwright/test').Page) {
    await page.addInitScript(
        ({ user, project }) => {
            sessionStorage.setItem(
                'admin-auth-storage',
                JSON.stringify({
                    state: {
                        token: 'fake-token',
                        user,
                        projects: [project],
                        currentProject: project,
                    },
                    version: 2,
                })
            );
        },
        { user, project }
    );

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) {
            await route.continue();
            return;
        }
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(responseFor(url.pathname)),
        });
    });
}

async function getOverflowingButtons(page: import('@playwright/test').Page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
            .filter((button) => {
                const rect = button.getBoundingClientRect();
                return rect.width > 0 && button.scrollWidth > button.clientWidth + 2;
            })
            .map((button) => button.innerText.trim() || button.getAttribute('aria-label') || '')
    );
}

for (const viewport of [
    { width: 320, height: 760 },
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
]) {
    test(`overview QR controls do not clip at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await installMocks(page);

        await page.goto(`/app/${projectSlug}/studies/${studySlug}`);
        await page.getByRole('button', { name: /show qr/i }).click();

        const overflowingButtons = await getOverflowingButtons(page);
        expect(overflowingButtons).toEqual([]);

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
    });
}
```

- [ ] **Step 2: Run the Playwright smoke test**

Run:

```bash
cd frontend
npm run e2e -- tests/responsive-overflow.spec.ts
```

Expected: pass after Tasks 1-2.

- [ ] **Step 3: Run the focused Vitest suite**

Run:

```bash
cd frontend
npm test -- RecruitmentModule.responsive.test.tsx StudyOverviewPage.responsive.test.tsx SafeMarkdown.test.tsx StudyDesignPage.responsive.test.tsx
```

Expected: pass.

- [ ] **Step 4: Run type-check**

Run:

```bash
cd frontend
npm run type-check
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/responsive-overflow.spec.ts
git commit -m "test: cover responsive overflow regressions"
```

---

### Task 6: Final Verification

**Files:**
- No code changes unless a verification failure identifies a specific fix.

- [ ] **Step 1: Run lint on changed frontend files**

Run:

```bash
cd frontend
npm run lint
```

Expected: pass.

- [ ] **Step 2: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: pass.

- [ ] **Step 3: Manual responsive smoke**

Run:

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Open these routes at `320`, `375`, `768`, and `1280` widths:

```text
/app/responsive-project/studies/responsive-study
/app/responsive-project/studies/responsive-study/design
/study/responsive-study/welcome?mode=test
/study/responsive-study/consent?mode=test
```

Expected:

```text
No horizontal page scroll.
Overview metric labels stay inside cards.
Show QR / Live Study / Download Image labels are readable and not clipped.
Designer tabs are horizontally scrollable with a visible scrollbar/thumb.
Consent Markdown wraps long URLs or long unbroken strings.
Welcome and consent CTAs wrap without overflowing.
```

- [ ] **Step 4: Commit any verification-only fixes**

If Step 1, 2, or 3 forces a change, commit it:

```bash
git add frontend/src frontend/tests
git commit -m "fix: resolve responsive verification issues"
```

---

## Self-Review

**Spec coverage:** The plan covers the confirmed QR button issue, overview metric card compression, designer tab overflow affordance, long Markdown/prose overflow, and long CTA labels.

**Placeholder scan:** No task contains `TBD`, `TODO`, or an unspecified “add tests” instruction. Every code task includes concrete file paths, code, commands, and expected outcomes.

**Type consistency:** New test imports match existing frontend test utilities. New JSX class changes use existing Tailwind utilities already used elsewhere in the project, except `scrollbar-thin`; if Tailwind does not emit `scrollbar-thin`, replace that exact class in Task 4 with `[scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300`.
