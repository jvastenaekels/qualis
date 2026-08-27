/**
 * Participant fine-sort flow — ROUGH MODE (rough_sort_enabled = true).
 *
 * Mirror of `fine-sort-no-rough.spec.ts`. Walks the full participant
 * journey on four form factors with rough-sort enabled (welcome → consent
 * → presort → rough-sort → fine-sort → post-sort), capturing a screenshot
 * at each transition. The critical assertion is that the URL passes
 * through `/rough-sort` between presort and fine-sort — this validates
 * that the existing flow keeps working after the Phase 3 deck-mode work.
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';
import { FORM_FACTORS, captureTransition, placeAllCards, placeNCards } from '../helpers/rough-sort';

const STATEMENT_COUNT = 6;
const GRID_CONFIG = [
    { score: -1, capacity: 2 },
    { score: 0, capacity: 2 },
    { score: 1, capacity: 2 },
];

const PRESORT_CONFIG = testDataBuilders.presortConfig({
    age: testDataBuilders.presortField('number', 'Age', { required: true }),
    gender: testDataBuilders.presortField('select', 'Gender', {
        required: true,
        options: ['Male', 'Female'],
    }),
    education: testDataBuilders.presortField('select', 'Education', {
        required: true,
        options: ['High School', 'Bachelor'],
    }),
});

for (const vp of FORM_FACTORS) {
    test.describe(`Fine-sort flow [rough enabled] — ${vp.name}`, () => {
        test.use({
            viewport: { width: vp.width, height: vp.height },
            isMobile: vp.isMobile ?? false,
            hasTouch: vp.hasTouch ?? false,
        });

        test(`completes fine-sort with rough enabled (${vp.name})`, async ({
            page,
            testDb,
            authToken,
        }) => {
            const studyConfig = testDataBuilders.study({
                slug: `rough-mode-${vp.name.replace(/_/g, '-')}-${Date.now()}`,
                statements: testDataBuilders.statements(STATEMENT_COUNT),
                grid_config: GRID_CONFIG,
                presort_config: PRESORT_CONFIG,
                state: 'active',
            });
            const study = (await testDb.createStudy(authToken, {
                ...studyConfig,
                rough_sort_enabled: true,
            } as unknown as Parameters<typeof testDb.createStudy>[1])) as { slug: string };

            // 1. Welcome.
            const welcomePage = new WelcomePage(page);
            await welcomePage.visit(study.slug);
            await captureTransition(page, vp.name, 'rough', 1, 'welcome');
            await welcomePage.startStudy();

            // 2. Consent.
            const consentPage = new ConsentPage(page);
            await consentPage.waitForLoad();
            await captureTransition(page, vp.name, 'rough', 2, 'consent');
            await consentPage.acceptConsent();

            // 3. Presort.
            const preSortPage = new PreSortPage(page);
            await preSortPage.waitForLoad();
            await captureTransition(page, vp.name, 'rough', 3, 'presort');
            await preSortPage.completePreSort();

            // 4. CRITICAL ASSERTION: URL passes through /rough-sort.
            await page.waitForURL(/\/rough-sort(\?|$)/, { timeout: 15000 });
            expect(page.url()).toMatch(/\/rough-sort(\?|$)/);

            // Capture rough-sort once before completing it (acts as the
            // "fine-sort empty" parallel — it's the equivalent transition
            // marker for the rough-mode flow).
            await captureTransition(page, vp.name, 'rough', 4, 'rough-sort');

            const roughSortPage = new RoughSortPage(page);
            await roughSortPage.waitForLoad();
            await roughSortPage.completeRoughSort(STATEMENT_COUNT);

            // 5. Now on fine-sort.
            const fineSortPage = new FineSortPage(page);
            await fineSortPage.waitForLoad();
            expect(page.url()).toMatch(/\/fine-sort(\?|$)/);

            // Pile tabs ARE rendered in rough mode.
            await expect(page.getByRole('tab')).toHaveCount(3);

            await placeNCards(page, Math.ceil(STATEMENT_COUNT / 2));
            await captureTransition(page, vp.name, 'rough', 5, 'fine-sort-half');

            await placeAllCards(page);
            await captureTransition(page, vp.name, 'rough', 6, 'fine-sort-full');

            // 6. Submit and reach post-sort.
            const validateBtn = page.getByTestId('fine-sort-validate-btn');
            await expect(validateBtn).toBeEnabled({ timeout: 10000 });
            await validateBtn.evaluate((node: HTMLElement) => node.click());

            await page.waitForURL(/\/post-sort(\?|$)/, { timeout: 20000 });
            await captureTransition(page, vp.name, 'rough', 7, 'post-sort');
        });
    });
}
