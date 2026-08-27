/**
 * Participant fine-sort flow — DECK MODE (rough_sort_enabled = false).
 *
 * Walks the full participant journey (welcome → consent → presort → fine-sort
 * → post-sort) on four form factors, capturing a screenshot at each
 * transition. The critical assertion is that the URL settles on `/fine-sort`
 * (never `/rough-sort`) once presort completes — this validates the Phase 3
 * RoughSortGuard redirect plus the deck-mode rendering branch in GridSort.
 *
 * Tablet viewports also run a rotation test that verifies placed cards
 * persist when the device flips between portrait and landscape.
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { FineSortPage } from '../pages/FineSortPage';
import {
    FORM_FACTORS,
    captureTransition,
    placeAllCards,
    placeNCards,
    countPlacedCards,
} from '../helpers/rough-sort';

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
    test.describe(`Fine-sort flow [deck mode] — ${vp.name}`, () => {
        test.use({
            viewport: { width: vp.width, height: vp.height },
            isMobile: vp.isMobile ?? false,
            hasTouch: vp.hasTouch ?? false,
        });

        test(`completes fine-sort with rough disabled (${vp.name})`, async ({
            page,
            testDb,
            authToken,
        }) => {
            // 1. Create the study with rough_sort_enabled=false directly via API.
            const studyConfig = testDataBuilders.study({
                slug: `deck-mode-${vp.name.replace(/_/g, '-')}-${Date.now()}`,
                statements: testDataBuilders.statements(STATEMENT_COUNT),
                grid_config: GRID_CONFIG,
                presort_config: PRESORT_CONFIG,
                state: 'active',
            });
            const study = (await testDb.createStudy(authToken, {
                ...studyConfig,
                rough_sort_enabled: false,
            } as unknown as Parameters<typeof testDb.createStudy>[1])) as { slug: string };

            // 2. Welcome.
            const welcomePage = new WelcomePage(page);
            await welcomePage.visit(study.slug);
            await captureTransition(page, vp.name, 'deck', 1, 'welcome');
            await welcomePage.startStudy();

            // 3. Consent.
            const consentPage = new ConsentPage(page);
            await consentPage.waitForLoad();
            await captureTransition(page, vp.name, 'deck', 2, 'consent');
            await consentPage.acceptConsent();

            // 4. Presort.
            const preSortPage = new PreSortPage(page);
            await preSortPage.waitForLoad();
            await captureTransition(page, vp.name, 'deck', 3, 'presort');
            await preSortPage.completePreSort();

            // 5. CRITICAL ASSERTION: URL must settle on /fine-sort, not /rough-sort.
            // The PreSortPage navigates to /rough-sort, but RoughSortGuard
            // redirects deck-mode studies to /fine-sort with `replace`.
            await page.waitForURL(/\/fine-sort(\?|$)/, { timeout: 15000 });
            expect(page.url()).toMatch(/\/fine-sort(\?|$)/);
            expect(page.url()).not.toMatch(/\/rough-sort(\?|$)/);

            const fineSortPage = new FineSortPage(page);
            await fineSortPage.waitForLoad();

            // The deck-cards-container is the canonical anchor for both modes;
            // assert it's present.
            await expect(page.getByTestId('deck-cards-container')).toBeVisible({
                timeout: 10000,
            });

            // Assert NO pile tabs are rendered (deck mode collapses the 3 piles).
            // Pile tabs use role="tab"; deck mode renders none.
            await expect(page.getByRole('tab')).toHaveCount(0);

            await captureTransition(page, vp.name, 'deck', 4, 'fine-sort-empty');

            // 6. Place half the cards.
            await placeNCards(page, Math.ceil(STATEMENT_COUNT / 2));
            await captureTransition(page, vp.name, 'deck', 5, 'fine-sort-half');

            // 7. Place the rest.
            await placeAllCards(page);
            await captureTransition(page, vp.name, 'deck', 6, 'fine-sort-full');

            // 8. Submit fine-sort and reach post-sort.
            const validateBtn = page.getByTestId('fine-sort-validate-btn');
            await expect(validateBtn).toBeEnabled({ timeout: 10000 });
            await validateBtn.evaluate((node: HTMLElement) => node.click());

            await page.waitForURL(/\/post-sort(\?|$)/, { timeout: 20000 });
            await captureTransition(page, vp.name, 'deck', 7, 'post-sort');
        });

        // Rotation test — tablets only.
        test(`rotation mid-sort preserves placement state (${vp.name})`, async ({
            page,
            testDb,
            authToken,
        }) => {
            test.skip(
                !vp.name.startsWith('tablet'),
                'Rotation test only meaningful for tablet viewports'
            );

            const studyConfig = testDataBuilders.study({
                slug: `deck-rot-${vp.name.replace(/_/g, '-')}-${Date.now()}`,
                statements: testDataBuilders.statements(STATEMENT_COUNT),
                grid_config: GRID_CONFIG,
                presort_config: { enabled: false, fields: {} },
                state: 'active',
            });
            const study = (await testDb.createStudy(authToken, {
                ...studyConfig,
                rough_sort_enabled: false,
            } as unknown as Parameters<typeof testDb.createStudy>[1])) as { slug: string };

            // Walk straight to fine-sort.
            const welcomePage = new WelcomePage(page);
            await welcomePage.visit(study.slug);
            await welcomePage.startStudy();

            const consentPage = new ConsentPage(page);
            await consentPage.waitForLoad();
            await consentPage.acceptConsent();

            await page.waitForURL(/\/fine-sort(\?|$)/, { timeout: 15000 });
            const fineSortPage = new FineSortPage(page);
            await fineSortPage.waitForLoad();

            await placeNCards(page, 3);
            const placedBefore = await countPlacedCards(page);
            expect(placedBefore).toBeGreaterThanOrEqual(1);

            // Flip orientation: portrait <-> landscape.
            const isPortrait = vp.height > vp.width;
            const newSize = isPortrait
                ? { width: vp.height, height: vp.width }
                : { width: vp.height, height: vp.width };
            await page.setViewportSize(newSize);

            // Brief settle.
            await page.waitForTimeout(500);

            const placedAfter = await countPlacedCards(page);
            expect(placedAfter).toBe(placedBefore);
        });
    });
}
