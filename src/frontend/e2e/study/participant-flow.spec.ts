import { test, expect } from '../fixtures/db-setup';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('Participant Flow', () => {
    test('should complete the full study lifecycle', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('fine-sort');

        // Verify we're on fine-sort
        const fineSortPage = new FineSortPage(page);
        await fineSortPage.verifyLayout();
        await fineSortPage.completeFineSort();

        // Should reach post-sort page
        await expect(page).toHaveURL(/.*\/post-sort/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
            timeout: 10000,
        });
    });

    test('should complete study without presort', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('post-sort', {
            presort_config: { enabled: false, fields: {} },
        });

        // Should reach post-sort page
        await expect(page).toHaveURL(/.*\/post-sort/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
            timeout: 10000,
        });
    });
});
