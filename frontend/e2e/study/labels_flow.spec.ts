import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('Labels Flow', () => {
    test('should complete the full study lifecycle', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('fine-sort', {
            title: 'Labels Flow Test',
            statements: testDataBuilders.statements(10),
            grid_config: [
                { score: -1, capacity: 3 },
                { score: 0, capacity: 4 },
                { score: 1, capacity: 3 },
            ],
        });

        const fineSortPage = new FineSortPage(page);
        await fineSortPage.verifyLayout();
        await fineSortPage.completeFineSort();

        // Should reach post-sort
        await expect(page).toHaveURL(/.*\/post-sort/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
            timeout: 10000,
        });
    });
});
