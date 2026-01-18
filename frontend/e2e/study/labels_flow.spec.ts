import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('Labels Flow (Real Backend)', () => {
    let studySlug: string;

    test.beforeEach(async ({ page, testDb, authToken }) => {
        page.on('console', (msg) => console.log(`[Browser]: ${msg.text()}`));

        // Create study with custom UI labels
        const study = await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                title: 'Labels Flow Test',
                slug: `labels-flow-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
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

    test('should complete the full study lifecycle', async ({ page }) => {
        const welcomePage = new WelcomePage(page);
        const consentPage = new ConsentPage(page);
        const preSortPage = new PreSortPage(page);
        const roughSortPage = new RoughSortPage(page);
        const fineSortPage = new FineSortPage(page);

        // 1. WELCOME
        await welcomePage.visit(studySlug);
        await expect(page.getByTestId('start-btn')).toBeVisible();
        await welcomePage.startStudy();

        // 2. CONSENT
        await consentPage.waitForLoad();
        await consentPage.acceptConsent();

        // 3. PRE-SORT
        await preSortPage.waitForLoad();
        await preSortPage.completePreSort();

        // 4. ROUGH SORT
        await roughSortPage.waitForLoad();
        await roughSortPage.completeRoughSort(10);

        // 5. FINE SORT
        await fineSortPage.waitForLoad();
        await fineSortPage.verifyLayout();

        // Complete fine sort
        await fineSortPage.completeFineSort(10);

        // Should reach post-sort
        await expect(page).toHaveURL(/.*\/post-sort/);

        // Verify post-sort page UI
        await expect(page.getByRole('button', { name: /share|submit/i })).toBeVisible({
            timeout: 10000,
        });
    });
});
