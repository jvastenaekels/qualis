import { test } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('Mobile UX (Focus Flow)', () => {
    test.use({
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
    });

    test.skip(
        ({ browserName }) => browserName === 'firefox',
        'Firefox does not support mobile emulation'
    );

    test('should activate workbench on card tap', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('fine-sort', {
            title: 'Mobile UX Test',
            statements: testDataBuilders.statements(10),
            grid_config: [
                { score: -1, capacity: 3 },
                { score: 0, capacity: 4 },
                { score: 1, capacity: 3 },
            ],
        });

        const fineSortPage = new FineSortPage(page);
        await fineSortPage.tapFirstCard();
        await fineSortPage.verifyWorkbenchActive();
    });
});
