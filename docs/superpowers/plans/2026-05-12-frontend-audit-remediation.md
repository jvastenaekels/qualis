# Frontend Audit Remediation Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the first production-critical frontend audit findings: CI lint failures, cross-study participant session leakage, public-page accessibility regressions, and participant-critical untranslated ARIA labels.

**Architecture:** Keep this wave narrow and testable. Add one small pure helper for the study/session isolation invariant, keep layout accessibility fixes in the public shell, and localize existing ARIA labels without changing Q-sort behavior. Dependency replacement for `xlsx` is intentionally handled in a separate security wave because it requires a product decision about import/export compatibility.

**Tech Stack:** React 19, Vite, TypeScript, React Router 7, Zustand, Tailwind CSS, i18next, Vitest, Playwright, @axe-core/playwright, Biome.

---

## File Map

- Modify: `frontend/src/components/SortingAnimation.tsx`
  - Biome formatting only.
- Modify: `frontend/src/layouts/StudyLayout.tsx`
  - Biome formatting.
  - Use a pure session-isolation helper before route guards.
- Modify: `frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts`
  - Remove the unused-parameter warning and literal-key lint warnings.
- Modify: `frontend/src/components/admin/designer/ProcessStepEditor.test.tsx`
  - Remove the unused Biome suppression.
- Create: `frontend/src/utils/studySessionIsolation.ts`
  - Pure helper for deciding when participant state belongs to a different study.
- Create: `frontend/src/utils/studySessionIsolation.test.ts`
  - Characterization tests for same-study, different-study, empty-slug, and legacy-null behavior.
- Modify: `frontend/src/layouts/PublicPageLayout.tsx`
  - Add a single public `<main>` landmark.
- Modify: `frontend/src/pages/LandingPage.tsx`
  - Add an `h1` and keep the visual layout stable.
- Modify: `frontend/src/pages/LoginPage.tsx`
  - Add an `h1` and fix low-contrast decorative text.
- Modify: `frontend/src/components/Footer.tsx`
  - Increase footer text contrast.
- Create: `frontend/e2e/accessibility/public-pages.spec.ts`
  - Axe smoke coverage for `/` and `/login`.
- Modify: `frontend/src/components/GridSort.tsx`
  - Replace hardcoded English ARIA labels with `t()` keys.
- Modify: `frontend/src/pages/RoughSortPage.tsx`
  - Replace hardcoded English close-tip ARIA label with `t()`.
- Modify: `frontend/public/locales/en/translation.json`
  - Add ARIA label keys used by Q-sort.
- Modify: `frontend/public/locales/fr/translation.json`
  - Add French ARIA label values.
- Modify: `frontend/public/locales/fi/translation.json`
  - Add Finnish ARIA label values.

---

## Task 1: Restore Biome Lint To Green

**Files:**
- Modify: `frontend/src/components/SortingAnimation.tsx`
- Modify: `frontend/src/layouts/StudyLayout.tsx`
- Modify: `frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts`
- Modify: `frontend/src/components/admin/designer/ProcessStepEditor.test.tsx`

- [ ] **Step 1: Reproduce the lint failure**

Run:

```bash
cd frontend
npm run lint
```

Expected: FAIL with formatter errors in `SortingAnimation.tsx` and `StudyLayout.tsx`, plus lint warnings in the two test files.

- [ ] **Step 2: Apply Biome formatting to the two formatter-failing files**

Run:

```bash
cd frontend
npx biome format --write src/components/SortingAnimation.tsx src/layouts/StudyLayout.tsx
```

Expected: Biome rewrites only formatting in those two files.

- [ ] **Step 3: Fix the unused mock parameter**

In `frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts`, replace:

```ts
const t = vi.fn((key: string, fallback: string) => fallback) as unknown as TFunction;
```

with:

```ts
const t = vi.fn((_key: string, fallback: string) => fallback) as unknown as TFunction;
```

- [ ] **Step 4: Fix literal-key warnings in `SurveyResponseTable.helpers.test.ts`**

In `frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts`, replace these assertions:

```ts
expect(map['q1']).toEqual({ id: 'q1', label: 'L1' });
expect(map['q2']).toEqual({ id: 'q2', label: 'L2' });
expect(map['f1']).toEqual({ id: 'f1', label: 'F1' });
expect(map['q1']).toMatchObject({ id: 'q1', label: 'L1' });
expect(map['a1']).toEqual({ id: 'a1', label: 'A1' });
```

with:

```ts
expect(map.q1).toEqual({ id: 'q1', label: 'L1' });
expect(map.q2).toEqual({ id: 'q2', label: 'L2' });
expect(map.f1).toEqual({ id: 'f1', label: 'F1' });
expect(map.q1).toMatchObject({ id: 'q1', label: 'L1' });
expect(map.a1).toEqual({ id: 'a1', label: 'A1' });
```

- [ ] **Step 5: Remove the unused Biome suppression**

In `frontend/src/components/admin/designer/ProcessStepEditor.test.tsx`, remove this line:

```ts
// biome-ignore lint/suspicious/noExplicitAny: convenient partial mock for the StudyUpdate draft
```

Keep the suppression on the `steps: any[]` parameter because that one is still active.

- [ ] **Step 6: Verify lint is green**

Run:

```bash
cd frontend
npm run lint
```

Expected: PASS with no formatter errors. Existing cognitive-complexity warnings may still be printed only if Biome treats them as warnings; this task is complete when the command exits 0.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/src/components/SortingAnimation.tsx frontend/src/layouts/StudyLayout.tsx frontend/src/components/admin/dashboard/SurveyResponseTable.helpers.test.ts frontend/src/components/admin/designer/ProcessStepEditor.test.tsx
git commit -m "chore(frontend): restore biome lint gate"
```

---

## Task 2: Pin The Cross-Study Session Isolation Contract

**Files:**
- Create: `frontend/src/utils/studySessionIsolation.ts`
- Create: `frontend/src/utils/studySessionIsolation.test.ts`

- [ ] **Step 1: Write failing tests for the isolation helper**

Create `frontend/src/utils/studySessionIsolation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldResetParticipantSessionForStudy } from './studySessionIsolation';

describe('shouldResetParticipantSessionForStudy', () => {
    it('does not reset when the route slug is missing', () => {
        expect(shouldResetParticipantSessionForStudy(undefined, 'study-a')).toBe(false);
        expect(shouldResetParticipantSessionForStudy('', 'study-a')).toBe(false);
    });

    it('does not reset a fresh legacy session with no stored study slug', () => {
        expect(shouldResetParticipantSessionForStudy('study-a', null)).toBe(false);
        expect(shouldResetParticipantSessionForStudy('study-a', undefined)).toBe(false);
    });

    it('does not reset when the stored session belongs to the current study', () => {
        expect(shouldResetParticipantSessionForStudy('study-a', 'study-a')).toBe(false);
    });

    it('resets when the stored participant session belongs to a different study', () => {
        expect(shouldResetParticipantSessionForStudy('study-b', 'study-a')).toBe(true);
    });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
cd frontend
npx vitest run src/utils/studySessionIsolation.test.ts
```

Expected: FAIL because `./studySessionIsolation` does not exist.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/utils/studySessionIsolation.ts`:

```ts
/**
 * Returns true when the persisted participant session is explicitly tied to a
 * different study than the current route.
 *
 * A missing stored study slug is treated as legacy/fresh state and is not reset
 * here; other guards can still reset completed legacy sessions.
 */
export function shouldResetParticipantSessionForStudy(
    routeSlug: string | null | undefined,
    storedStudySlug: string | null | undefined
): boolean {
    if (!routeSlug) return false;
    if (!storedStudySlug) return false;
    return storedStudySlug !== routeSlug;
}
```

- [ ] **Step 4: Verify the helper tests pass**

Run:

```bash
cd frontend
npx vitest run src/utils/studySessionIsolation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/utils/studySessionIsolation.ts frontend/src/utils/studySessionIsolation.test.ts
git commit -m "test(frontend): pin participant study session isolation"
```

---

## Task 3: Apply Cross-Study Reset In `StudyLayout`

**Files:**
- Modify: `frontend/src/layouts/StudyLayout.tsx`
- Test: `frontend/src/utils/studySessionIsolation.test.ts`

- [ ] **Step 1: Import the helper**

In `frontend/src/layouts/StudyLayout.tsx`, add this import near the other utility imports:

```ts
import { shouldResetParticipantSessionForStudy } from '../utils/studySessionIsolation';
```

- [ ] **Step 2: Replace the completed-only cross-study cleanup effect**

In `frontend/src/layouts/StudyLayout.tsx`, replace the current cross-study cleanup effect:

```ts
useEffect(() => {
    if (slug && isCompleted && studySlug !== slug) {
        resetAllStores({ skipConfig: true });
    }
}, [slug, isCompleted, studySlug]);
```

with:

```ts
useEffect(() => {
    if (shouldResetParticipantSessionForStudy(slug, studySlug)) {
        resetAllStores({ skipConfig: true });
    }
}, [slug, studySlug]);
```

- [ ] **Step 3: Keep stale completed legacy handling unchanged**

Do not change this existing block in the same file:

```ts
const isStaleCompletedSession = isCompleted && studySlug !== slug;
if (isStaleCompletedSession) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 space-y-6">
            <div
                data-testid="loading-spinner"
                className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin"
                style={{
                    borderColor: 'var(--brand-accent)',
                    borderTopColor: 'transparent',
                }}
            ></div>
        </div>
    );
}
```

This preserves the current completed-session cleanup path while adding reset coverage for active sessions explicitly tied to another study.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd frontend
npx vitest run src/utils/studySessionIsolation.test.ts src/layouts/StudyLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run wider participant/session tests**

Run:

```bash
cd frontend
npx vitest run src/hooks/useStudyConfig.session-isolation.test.ts src/pages/ConsentPage.test.tsx src/pages/WelcomePage.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/src/layouts/StudyLayout.tsx
git commit -m "fix(frontend): reset participant state across studies"
```

---

## Task 4: Fix Public-Page Landmarks And Headings

**Files:**
- Modify: `frontend/src/layouts/PublicPageLayout.tsx`
- Modify: `frontend/src/pages/LandingPage.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/components/Footer.tsx`
- Modify: `frontend/public/locales/en/translation.json`
- Modify: `frontend/public/locales/fr/translation.json`
- Modify: `frontend/public/locales/fi/translation.json`

- [ ] **Step 1: Add a public main landmark**

Replace `frontend/src/layouts/PublicPageLayout.tsx` with:

```tsx
/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';

interface PublicPageLayoutProps {
    children: ReactNode;
}

export const PublicPageLayout = ({ children }: PublicPageLayoutProps) => (
    <div className="min-h-screen flex flex-col">
        <main id="main-content" className="flex-1 flex flex-col">
            {children}
        </main>
        <Footer />
    </div>
);
```

- [ ] **Step 2: Add an `h1` to the landing page**

In `frontend/src/pages/LandingPage.tsx`, inside the `<div className="text-center space-y-2">` and after the logo block, add:

```tsx
<h1 className="sr-only">{t('landing.title', 'Join a study')}</h1>
```

The resulting block should be:

```tsx
<div className="text-center space-y-2">
    <div className="flex justify-center mb-6">
        <img
            src="/qualis-logo.svg"
            alt="Qualis"
            className="h-20 w-auto object-contain"
        />
    </div>
    <h1 className="sr-only">{t('landing.title', 'Join a study')}</h1>
    <p className="text-gray-500">
        {t('landing.instruction', 'Enter your study code to begin.')}
    </p>
</div>
```

- [ ] **Step 3: Add an `h1` to the login page and fix the decorative text contrast**

In `frontend/src/pages/LoginPage.tsx`, inside the `motion.div` and before the icon block, add:

```tsx
<h1 className="sr-only">{t('auth.login.page_title', 'Sign in to Qualis')}</h1>
```

Replace the decorative footer paragraph:

```tsx
<p className="text-center text-2xs text-slate-400 mt-12 font-medium opacity-50">
    Qualis
</p>
```

with:

```tsx
<p className="text-center text-2xs text-slate-600 mt-12 font-medium">
    Qualis
</p>
```

- [ ] **Step 4: Increase public footer contrast**

In `frontend/src/components/Footer.tsx`, replace:

```tsx
<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-3 text-center text-xs text-slate-400">
```

with:

```tsx
<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-3 text-center text-xs text-slate-600">
```

- [ ] **Step 5: Add translation keys**

In each locale file, add `landing.title` inside the existing `landing` object and `auth.login.page_title` inside the existing `auth.login` object.

Use these exact values:

```json
// frontend/public/locales/en/translation.json
"title": "Join a study"
```

```json
// frontend/public/locales/fr/translation.json
"title": "Rejoindre une etude"
```

```json
// frontend/public/locales/fi/translation.json
"title": "Liity tutkimukseen"
```

For `auth.login.page_title`, use:

```json
// frontend/public/locales/en/translation.json
"page_title": "Sign in to Qualis"
```

```json
// frontend/public/locales/fr/translation.json
"page_title": "Connexion a Qualis"
```

```json
// frontend/public/locales/fi/translation.json
"page_title": "Kirjaudu Qualisiin"
```

- [ ] **Step 6: Verify localization sync**

Run:

```bash
cd frontend
npm run i18n-check
```

Expected: PASS.

- [ ] **Step 7: Run focused unit tests**

Run:

```bash
cd frontend
npx vitest run src/AppRouter.test.tsx src/pages/LoginPage.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add frontend/src/layouts/PublicPageLayout.tsx frontend/src/pages/LandingPage.tsx frontend/src/pages/LoginPage.tsx frontend/src/components/Footer.tsx frontend/public/locales/en/translation.json frontend/public/locales/fr/translation.json frontend/public/locales/fi/translation.json
git commit -m "fix(a11y): add public landmarks and page headings"
```

---

## Task 5: Add Public Axe Smoke Tests

**Files:**
- Create: `frontend/e2e/accessibility/public-pages.spec.ts`

- [ ] **Step 1: Create the Axe smoke spec**

Create `frontend/e2e/accessibility/public-pages.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const publicPages = ['/', '/login'] as const;

test.describe('public page accessibility smoke', () => {
    for (const path of publicPages) {
        test(`${path} has no axe violations`, async ({ page }) => {
            await page.goto(path);
            await page.waitForLoadState('networkidle');

            const results = await new AxeBuilder({ page }).analyze();

            expect(results.violations).toEqual([]);
        });
    }
});
```

- [ ] **Step 2: Run the new smoke spec**

Run:

```bash
cd frontend
npx playwright test e2e/accessibility/public-pages.spec.ts --config playwright.mock.config.ts
```

Expected: PASS for `/` and `/login`.

- [ ] **Step 3: Commit**

Run:

```bash
git add frontend/e2e/accessibility/public-pages.spec.ts
git commit -m "test(a11y): add public axe smoke coverage"
```

---

## Task 6: Localize Participant-Critical ARIA Labels

**Files:**
- Modify: `frontend/src/components/GridSort.tsx`
- Modify: `frontend/src/pages/RoughSortPage.tsx`
- Modify: `frontend/public/locales/en/translation.json`
- Modify: `frontend/public/locales/fr/translation.json`
- Modify: `frontend/public/locales/fi/translation.json`

- [ ] **Step 1: Add ARIA keys to locale files**

Add these keys and values to the existing locale JSON structures.

English:

```json
{
  "rough": {
    "tip": {
      "close": "Close tip"
    }
  },
  "fine": {
    "header": {
      "expand_instructions": "Expand instructions",
      "minimize_instructions": "Minimize instructions"
    },
    "toolbar": {
      "label": "Grid controls"
    },
    "legend": {
      "label": "Grid legend"
    },
    "workbench": {
      "cancel_selection": "Cancel selection"
    }
  }
}
```

French:

```json
{
  "rough": {
    "tip": {
      "close": "Fermer l'aide"
    }
  },
  "fine": {
    "header": {
      "expand_instructions": "Afficher les consignes",
      "minimize_instructions": "Masquer les consignes"
    },
    "toolbar": {
      "label": "Commandes de la grille"
    },
    "legend": {
      "label": "Legende de la grille"
    },
    "workbench": {
      "cancel_selection": "Annuler la selection"
    }
  }
}
```

Finnish:

```json
{
  "rough": {
    "tip": {
      "close": "Sulje vinkki"
    }
  },
  "fine": {
    "header": {
      "expand_instructions": "Nayta ohjeet",
      "minimize_instructions": "Piilota ohjeet"
    },
    "toolbar": {
      "label": "Ruudukon ohjaimet"
    },
    "legend": {
      "label": "Ruudukon selite"
    },
    "workbench": {
      "cancel_selection": "Peruuta valinta"
    }
  }
}
```

- [ ] **Step 2: Localize `InstructionHeader` ARIA labels**

In `frontend/src/components/GridSort.tsx`, replace:

```tsx
aria-label="Expand instructions"
```

with:

```tsx
aria-label={t('fine.header.expand_instructions', 'Expand instructions')}
```

Replace:

```tsx
aria-label="Minimize instructions"
```

with:

```tsx
aria-label={t('fine.header.minimize_instructions', 'Minimize instructions')}
```

- [ ] **Step 3: Localize the grid toolbar label**

In the `GridToolbar` props type in `frontend/src/components/GridSort.tsx`, replace:

```ts
labels: { in: string; out: string; fit: string };
```

with:

```ts
labels: { in: string; out: string; fit: string; toolbar: string };
```

Replace:

```tsx
aria-label="Grid controls"
```

with:

```tsx
aria-label={labels.toolbar}
```

In the `toolbarLabels` memo, replace:

```ts
const toolbarLabels = useMemo(
    () => ({
        in: t('fine.toolbar.zoom_in'),
        out: t('fine.toolbar.zoom_out'),
        fit: t('fine.toolbar.fit_screen'),
    }),
    [t]
);
```

with:

```ts
const toolbarLabels = useMemo(
    () => ({
        in: t('fine.toolbar.zoom_in'),
        out: t('fine.toolbar.zoom_out'),
        fit: t('fine.toolbar.fit_screen'),
        toolbar: t('fine.toolbar.label', 'Grid controls'),
    }),
    [t]
);
```

- [ ] **Step 4: Localize grid legend and cancel-selection labels**

In `frontend/src/components/GridSort.tsx`, replace:

```tsx
aria-label="Grid legend"
```

with:

```tsx
aria-label={t('fine.legend.label', 'Grid legend')}
```

Add `cancelSelection: string;` to the `ValidationFooter` `labels` type:

```ts
labels: {
    validate: string;
    place: string;
    initial: string;
    finish: string;
    cancelSelection: string;
};
```

Replace:

```tsx
aria-label="Cancel selection"
```

with:

```tsx
aria-label={labels.cancelSelection}
```

In `inventoryLabels`, add:

```ts
cancelSelection: t('fine.workbench.cancel_selection', 'Cancel selection'),
```

- [ ] **Step 5: Localize the rough-sort tip close button**

In `frontend/src/pages/RoughSortPage.tsx`, replace:

```tsx
aria-label="Close tip"
```

with:

```tsx
aria-label={t('rough.tip.close', 'Close tip')}
```

- [ ] **Step 6: Verify no participant-critical hardcoded ARIA labels remain**

Run:

```bash
cd ..
rg -n 'aria-label="(Expand instructions|Minimize instructions|Grid controls|Grid legend|Cancel selection|Close tip)"' frontend/src
```

Expected: no output.

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd frontend
npm run i18n-check
npx vitest run src/components/GridSort.interactions.test.tsx src/pages/RoughSortPage.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add frontend/src/components/GridSort.tsx frontend/src/pages/RoughSortPage.tsx frontend/public/locales/en/translation.json frontend/public/locales/fr/translation.json frontend/public/locales/fi/translation.json
git commit -m "fix(a11y): localize q-sort aria labels"
```

---

## Task 7: Final Wave Verification

**Files:**
- No source changes.

- [ ] **Step 1: Run the frontend verification gate**

Run:

```bash
cd frontend
npm run lint
npm run type-check
npm run test -- --run
npm run build
npm run i18n-check
npx playwright test e2e/accessibility/public-pages.spec.ts --config playwright.mock.config.ts
npx playwright test e2e/admin/responsive-overflow.spec.ts --config playwright.mock.config.ts
```

Expected:

- `npm run lint`: exits 0.
- `npm run type-check`: exits 0.
- `npm run test -- --run`: all non-skipped tests pass.
- `npm run build`: exits 0. Existing chunk-size warnings may remain in this wave.
- `npm run i18n-check`: exits 0.
- Public Axe smoke: passes.
- Admin responsive overflow smoke: passes.

- [ ] **Step 2: Capture remaining known audit items**

Append this exact note to the PR description or local implementation summary:

```md
Remaining frontend audit items after Wave 1:
- Security dependency remediation: `fast-uri` audit fix and `xlsx` replacement/mitigation.
- Participant/designer native `window.confirm()` replacement with Radix AlertDialog.
- Finnish full-sentence translation pass for admin analysis/history/factor voices.
- Bundle/chunk follow-up for ineffective dynamic imports and heavy initial chunks.
- AudioRecorder complexity refactor.
```

- [ ] **Step 3: Commit verification-only documentation if a PR description file exists**

If the implementation branch uses a PR description file, add the note from Step 2 and commit it. If there is no PR description file, do not create one in this task.

Run only when a PR description file was edited:

```bash
git add <edited-pr-description-file>
git commit -m "docs: record remaining frontend audit follow-ups"
```

---

## Self-Review

- **Spec coverage:** This wave covers CI lint failures, active cross-study participant session leakage, public-page Axe failures, and participant-critical hardcoded ARIA labels.
- **Explicitly out of scope for this wave:** `xlsx` remediation, native confirm migration, full Finnish admin translation pass, and bundle splitting. These are listed in Task 7 as remaining audit items because each is independently testable and should receive its own plan.
- **Placeholder scan:** The plan contains exact file paths, code blocks, commands, and expected outcomes. It does not rely on undefined functions.
- **Type consistency:** `shouldResetParticipantSessionForStudy(routeSlug, storedStudySlug)` is defined in Task 2 and used with `slug` and `studySlug` in Task 3. ARIA label property names added in Task 6 match the labels object passed to `ValidationFooter` and `GridToolbar`.
