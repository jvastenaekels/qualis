import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('Study Resilience', () => {
    test('Session persistence: Reloading page should retain progress', async ({
        page,
        studyNav,
    }) => {
        const { slug } = await studyNav.navigateToStep('fine-sort', {
            grid_config: [{ score: 0, capacity: 3 }],
            statements: testDataBuilders.statements(3),
            presort_config: { enabled: false, fields: {} },
        });

        const fineSortPage = new FineSortPage(page);

        // Reload Page
        await page.reload();

        // Verify Persistence (Should still be on Fine Sort)
        await fineSortPage.waitForLoad();
        await expect(page).toHaveURL(new RegExp(`/study/${slug}/fine-sort`));
    });

    test('Validation: Should prevent submission of incomplete Q-Sort', async ({
        page,
        studyNav,
    }) => {
        await studyNav.navigateToStep('fine-sort', {
            grid_config: [{ score: 0, capacity: 2 }],
            statements: testDataBuilders.statements(2),
            presort_config: { enabled: false, fields: {} },
        });

        const fine = new FineSortPage(page);

        // Verify "Confirm" button is hidden initially (sort incomplete)
        const confirmButton = page.getByRole('button', {
            name: /confirm|finish|submit/i,
        });
        await expect(confirmButton).toBeHidden();

        // Place ONE card (incomplete)
        await fine.selectPile(2); // Agree (contains cards after default rough sort)
        await fine.moveFirstCardToGrid();

        // Verify still hidden (2 statements total, only 1 placed)
        await expect(confirmButton).toBeHidden();
    });
});
