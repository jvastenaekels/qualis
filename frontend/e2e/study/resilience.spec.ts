import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('Study Resilience', () => {
    test('Session persistence: Reloading page should retain progress', async ({ page, testDb, authToken }) => {
        // 1. Setup minimal study
        const studyData = testDataBuilders.study({
            grid_config: [{ score: 0, capacity: 3 }],
            statements: testDataBuilders.statements(3),
            state: 'active',
        });
        const study = await testDb.createStudy(authToken, studyData);

        // 2. Start Study & Complete Rough Sort
        const welcomePage = new WelcomePage(page);
        await welcomePage.goto(`/study/${study.slug}`);
        await welcomePage.waitForLoad();
        await welcomePage.startStudy();

        const consentPage = new ConsentPage(page);
        await consentPage.waitForLoad();
        await consentPage.acceptConsent();

        const roughSortPage = new RoughSortPage(page);
        await roughSortPage.waitForLoad();
        await roughSortPage.completeRoughSort(3);

        // 3. Arrive at Fine Sort
        const fineSortPage = new FineSortPage(page);
        await fineSortPage.waitForLoad();

        // 4. Reload Page
        await page.reload();

        // 5. Verify Persistence (Should still be on Fine Sort)
        await fineSortPage.waitForLoad();
        await expect(page).toHaveURL(new RegExp(`/study/${study.slug}/fine-sort`));
    });

    test('Validation: Should prevent submission of incomplete Q-Sort', async ({ page, testDb, authToken }) => {
        // 1. Setup standard study
        const studyData = testDataBuilders.study({
            grid_config: [{ score: 0, capacity: 2 }],
            statements: testDataBuilders.statements(2),
            state: 'active',
        });
        const study = await testDb.createStudy(authToken, studyData);

        // 2. Navigate to Fine Sort
        const welcomePage = new WelcomePage(page);
        await welcomePage.goto(`/study/${study.slug}`);
        await welcomePage.waitForLoad();
        await welcomePage.startStudy();

        const consentPage = new ConsentPage(page);
        await consentPage.waitForLoad();
        await consentPage.acceptConsent();

        const rough = new RoughSortPage(page);
        await rough.waitForLoad();
        await rough.completeRoughSort(2);

        const fine = new FineSortPage(page);
        await fine.waitForLoad();

        // 3. Verify "Confirm" button is missing initially
        // Use a more specific locator or check for the instruction div
        const confirmButton = page.getByRole('button', { name: /confirm|finish|submit/i });

        // Assert it is hidden initially because the sort is incomplete
        await expect(confirmButton).toBeHidden();

        // Check for the "1. Drag or Tap Statement" instruction
        await expect(page.getByText(/Drag or Tap Statement/i)).toBeVisible();

        // 4. Place ONE card (incomplete)
        await fine.selectPile(2); // Agree (contains cards after default rough sort)
        await fine.moveFirstCardToGrid();

        // 5. Verify still hidden (2 statements total, only 1 placed)
        await expect(confirmButton).toBeHidden();

        // Optional: Check instruction changed to "Tap Grid to Place" if card selected
        // but here we just want to ensure we can't submit.
    });

    test.skip('Concurrency: Multiple participants', async () => {
        // Future implementation
    });
});
