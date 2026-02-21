import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('UI Consistency & Logic Verification', () => {
    test('Case A: Maximal Study (Pre-Sort + Post-Questions)', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('fine-sort', {
            title: 'Maximal UI Test',
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

    test('Case B: Minimal (No Pre-Sort)', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('fine-sort', {
            title: 'Minimal UI Test',
            statements: testDataBuilders.statements(6),
            grid_config: [
                { score: -1, capacity: 2 },
                { score: 0, capacity: 2 },
                { score: 1, capacity: 2 },
            ],
            presort_config: { enabled: false, fields: {} },
        });

        const fineSortPage = new FineSortPage(page);
        await fineSortPage.completeFineSort();

        // Should reach post-sort
        await expect(page).toHaveURL(/.*\/post-sort/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
            timeout: 10000,
        });
    });
});
