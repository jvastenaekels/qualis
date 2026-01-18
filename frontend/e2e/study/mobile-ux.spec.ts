import { test } from '../fixtures/db-setup';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';
import { testDataBuilders } from '../fixtures/test-data';

test.describe('Mobile UX (Focus Flow) (Real Backend)', () => {
    test.use({
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
    });

    test.skip(
        ({ browserName }) => browserName === 'firefox',
        'Firefox does not support mobile emulation'
    );

    let studySlug: string;

    test.beforeEach(async ({ testDb, authToken }) => {
        const study = await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                title: 'Mobile UX Test',
                slug: `mobile-ux-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                statements: testDataBuilders.statements(10),
                grid_config: [
                    { score: -1, capacity: 3 },
                    { score: 0, capacity: 4 },
                    { score: 1, capacity: 3 },
                ],
                presort_config: testDataBuilders.presortConfig({
                    age: testDataBuilders.presortField('number', 'Age', {
                        required: true,
                    }),
                    gender: testDataBuilders.presortField('select', 'Gender', {
                        required: true,
                        options: ['Male', 'Female'],
                    }),
                    education: testDataBuilders.presortField('select', 'Education', {
                        required: true,
                        options: ['High School', 'Bachelor'],
                    }),
                }),
                state: 'active',
            })
        );
        studySlug = study.slug;
    });

    test('should activate workbench on card tap', async ({ page, testDb, authToken }) => {
        const welcomePage = new WelcomePage(page);
        const consentPage = new ConsentPage(page);
        const preSortPage = new PreSortPage(page);
        const roughSortPage = new RoughSortPage(page);
        const fineSortPage = new FineSortPage(page);

        // 1. WELCOME
        await welcomePage.visit(studySlug);
        await welcomePage.startStudy();

        // 2. CONSENT
        await consentPage.waitForLoad();
        await consentPage.acceptConsent();

        // 3. PRESORT
        await preSortPage.waitForLoad();
        await preSortPage.completePreSort();

        // 4. ROUGH SORT
        await roughSortPage.waitForLoad();
        // Distribute to populate Fine Sort Disagree deck
        // completeRoughSort puts cards into piles.
        // We have 10 cards.
        await roughSortPage.completeRoughSort(10);

        // 5. FINE SORT
        await fineSortPage.waitForLoad();

        // Mobile Interactions
        await fineSortPage.tapFirstCard();
        await fineSortPage.verifyWorkbenchActive();
    });
});
