/**
 * Participant fine-sort flow — FREE distribution mode.
 *
 * Mirror of `fine-sort-no-rough.spec.ts` and `fine-sort-with-rough.spec.ts`,
 * but exercises `distribution_mode='free'` across 4 viewports × 2 rough/deck
 * combinations = 8 tests. Free mode relaxes per-column capacity at submission
 * validation (only the total card count must match the Q-set size). The
 * activation check still requires sum(grid capacity) == Q-set size, so we use
 * a grid whose middle column is deliberately oversized (capacity 4) to stress
 * vertical stacking when most cards land in column 0.
 *
 * Q-set: 6 statements
 * Grid:  [-1: cap 1, 0: cap 4, +1: cap 1] (total 6)
 *
 * Each test captures 5 screenshots:
 *   free-01-empty           — fine-sort entry, no cards placed
 *   free-02-half            — 3 cards stacked in column 0
 *   free-03-full-stacked    — column 0 full (4 cards), 2 cards still in deck
 *                             (stress case — vertical stacking + non-empty deck)
 *   free-04-mixed           — redistributed: 1 / 4 / 1
 *   free-05-post-sort       — after submission
 *
 * Total new screenshot baselines: 4 × 2 × 5 = 40.
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';
import {
    FORM_FACTORS,
    captureWithSuffix,
    placeNCardsInColumn,
    countPlacedCards,
} from '../helpers/rough-sort';

// 6 statements with a centre-heavy grid (1/4/1 = 6) so we can exercise the
// "stack column 0" + "still cards in deck" stress case. Total capacity = Q-set
// size, which the activation check requires regardless of distribution_mode.
const STATEMENT_COUNT = 6;
const GRID_CONFIG = [
    { score: -1, capacity: 1 },
    { score: 0, capacity: 4 },
    { score: 1, capacity: 1 },
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

type Mode = 'rough' | 'deck';

for (const vp of FORM_FACTORS) {
    for (const mode of ['rough', 'deck'] as Mode[]) {
        test.describe(`Fine-sort flow [free mode, ${mode}] — ${vp.name}`, () => {
            test.use({
                viewport: { width: vp.width, height: vp.height },
                isMobile: vp.isMobile ?? false,
                hasTouch: vp.hasTouch ?? false,
            });

            test(`free distribution_mode (${mode}, ${vp.name})`, async ({
                page,
                testDb,
                authToken,
            }) => {
                const studyConfig = testDataBuilders.study({
                    slug: `free-${mode}-${vp.name.replace(/_/g, '-')}-${Date.now()}`,
                    statements: testDataBuilders.statements(STATEMENT_COUNT),
                    grid_config: GRID_CONFIG,
                    presort_config: PRESORT_CONFIG,
                    state: 'active',
                });
                const study = (await testDb.createStudy(authToken, {
                    ...studyConfig,
                    rough_sort_enabled: mode === 'rough',
                    distribution_mode: 'free',
                } as unknown as Parameters<typeof testDb.createStudy>[1])) as { slug: string };

                // 1. Walk through welcome → consent → presort.
                const welcomePage = new WelcomePage(page);
                await welcomePage.visit(study.slug);
                await welcomePage.startStudy();

                const consentPage = new ConsentPage(page);
                await consentPage.waitForLoad();
                await consentPage.acceptConsent();

                const preSortPage = new PreSortPage(page);
                await preSortPage.waitForLoad();
                await preSortPage.completePreSort();

                // 2. If rough mode, complete rough-sort first; otherwise the
                //    RoughSortGuard redirects directly to /fine-sort.
                if (mode === 'rough') {
                    await page.waitForURL(/\/rough-sort(\?|$)/, { timeout: 15000 });
                    const roughSortPage = new RoughSortPage(page);
                    await roughSortPage.waitForLoad();
                    await roughSortPage.completeRoughSort(STATEMENT_COUNT);
                }

                await page.waitForURL(/\/fine-sort(\?|$)/, { timeout: 20000 });
                const fineSortPage = new FineSortPage(page);
                await fineSortPage.waitForLoad();

                // Sanity: deck container present in both modes.
                await expect(page.getByTestId('deck-cards-container')).toBeVisible({
                    timeout: 10000,
                });

                // 3. Empty state.
                await captureWithSuffix(page, vp.name, mode, 'free-01-empty');

                // 4. Half — 3 cards stacked in the centre column (index 1,
                //    score 0, cap 4).
                const placedHalf = await placeNCardsInColumn(page, 3, 1);
                expect(placedHalf).toBe(3);
                await captureWithSuffix(page, vp.name, mode, 'free-02-half');

                // 5. Full-stacked — centre column reaches capacity (4 cards),
                //    2 cards still in the deck. This is the visual stress case:
                //    one column fully stacked while cards remain unplaced.
                const placedToFull = await placeNCardsInColumn(page, 1, 1);
                expect(placedToFull).toBe(1);
                const placedAfterFull = await countPlacedCards(page);
                expect(placedAfterFull).toBe(4);
                await captureWithSuffix(page, vp.name, mode, 'free-03-full-stacked');

                // 6. Mixed — distribute the remaining 2 cards into the outer
                //    columns. Final layout: 1 in -1, 4 in 0, 1 in +1. Total 6.
                const placedCol0 = await placeNCardsInColumn(page, 1, 0);
                expect(placedCol0).toBe(1);
                const placedCol2 = await placeNCardsInColumn(page, 1, 2);
                expect(placedCol2).toBe(1);
                expect(await countPlacedCards(page)).toBe(STATEMENT_COUNT);
                await captureWithSuffix(page, vp.name, mode, 'free-04-mixed');

                // 7. Submit and capture post-sort.
                const validateBtn = page.getByTestId('fine-sort-validate-btn');
                await expect(validateBtn).toBeEnabled({ timeout: 10000 });
                await validateBtn.evaluate((node: HTMLElement) => node.click());

                await page.waitForURL(/\/post-sort(\?|$)/, { timeout: 20000 });
                await captureWithSuffix(page, vp.name, mode, 'free-05-post-sort');
            });
        });
    }
}
