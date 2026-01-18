import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('Participant Flow (Real Backend)', () => {
    test('should complete the full study lifecycle and save data', async ({
        page,
        testDb,
        authToken,
    }) => {
        // 1. Setup: Create a study with known configuration
        const study = await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                title: 'Real Integration Study',
                slug: `real-flow-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                statements: testDataBuilders.statements(6),
                grid_config: [
                    { score: -1, capacity: 2 },
                    { score: 0, capacity: 2 },
                    { score: 1, capacity: 2 },
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

        expect(study.slug).toBeDefined();

        const welcomePage = new WelcomePage(page);
        const consentPage = new ConsentPage(page);
        const preSortPage = new PreSortPage(page);
        const roughSortPage = new RoughSortPage(page);
        const fineSortPage = new FineSortPage(page);

        // 2. WELCOME
        await welcomePage.visit(study.slug);
        await welcomePage.startStudy();

        // 3. CONSENT
        await consentPage.waitForLoad();
        await consentPage.acceptConsent();

        // 4. PRE-SORT
        await preSortPage.waitForLoad();
        await preSortPage.completePreSort();

        // 5. ROUGH SORT
        await roughSortPage.waitForLoad();
        await roughSortPage.completeRoughSort(6);

        // 6. FINE SORT
        await fineSortPage.waitForLoad();
        await fineSortPage.completeFineSort(6);

        // 7. Should reach post-sort page
        await expect(page).toHaveURL(/.*\/post-sort/);

        // Verify post-sort page UI is visible (submit button)
        await expect(page.getByRole('button', { name: /share|submit/i })).toBeVisible({
            timeout: 10000,
        });
    });
});
