import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { FineSortPage } from '../pages/FineSortPage';

test.describe('Fine Sort Comprehensive UX & Layout', () => {
    test.setTimeout(120_000);

    test('should verify all critical UI elements and interactions', async ({ page, studyNav }) => {
        const fineSortPage = new FineSortPage(page);

        await test.step('Navigate to Fine Sort', async () => {
            await studyNav.navigateToStep('fine-sort', {
                statements: testDataBuilders.statements(10),
                grid_config: [
                    { score: -1, capacity: 3 },
                    { score: 0, capacity: 4 },
                    { score: 1, capacity: 3 },
                ],
            });
        });

        await test.step('Verify Critical Layout Elements', async () => {
            await fineSortPage.verifyLayout();
        });

        await test.step('Verify Footer Interactions', async () => {
            await fineSortPage.checkFooter(/Drag|Glissez|Tap|Appuyez/);

            const deckCard = fineSortPage.deckContainer.locator('[data-testid^="card-"]').first();
            await deckCard.click();

            await fineSortPage.checkFooter(/Select a slot|Place|Choisi/i);
        });

        await test.step('Verify Deck & Drag Functionality', async () => {
            const initialDeckCount = await fineSortPage.getDeckCount();
            await fineSortPage.moveFirstCardToGrid();

            const newDeckCount = await fineSortPage.getDeckCount();
            expect(newDeckCount).toBe(initialDeckCount - 1);
        });

        await test.step('Verify Pile Switching', async () => {
            await fineSortPage.selectPile(2); // Agree
        });
    });
});
