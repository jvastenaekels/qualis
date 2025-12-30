import { test, expect } from '@playwright/test';
import { mockStudyConfig, mockStudyAPI } from './fixtures/study-config';

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

    test.beforeEach(async ({ page }) => {
        await mockStudyAPI(page);
    });

    test('should activate workbench on card tap', async ({ page }) => {
        // Go directly to fine sort (requires implementing a shortcut or mocking state,
        // for now we navigate the happy path quickly)
        await page.goto(`/study/${mockStudyConfig.slug}/welcome`);
        await page.getByRole('button', { name: /continue|continuer/i }).click();

        await page.getByLabel(/consent/i).check();
        await page.getByRole('button', { name: /let's go|c'est parti/i }).click();
        await page.getByRole('button', { name: /continue|continuer|submit|soumettre/i }).click(); // Presort

        // Rough sort - just click Neutral for all
        const cardsTotal = mockStudyConfig.statements.length;
        // Distribute cards so Fine Sort default view (Disagree) has content
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowDown'];
        await page.mouse.click(1, 1);

        for (let i = 0; i < cardsTotal; i++) {
            const key = keys[i % 3];
            await page.keyboard.press(key);
            await page.keyboard.press(key);
            await page.waitForTimeout(800);
        }

        // Click Next (Intermediate screen)
        await page
            .getByRole('button', { name: /next|suivant/i })
            .first()
            .click();

        // Now in Fine Sort
        await expect(page).toHaveURL(/.*\/fine-sort/);

        // 1. Verify "Deck" is visible at bottom
        const deck = page.getByTestId('deck-cards-container');
        await expect(deck).toBeVisible();

        // 2. Tap a card in the deck
        // SortableCard usually has an id like 'card-X' or can be found by role/class
        // Let's tap the first button in the deck (the piles are buttons, the cards are motion divs)
        // Actually, cards inside the deck are rendered.
        // We can look for text of the first statement.
        // Use generic selector to avoid text matching issues
        const card = deck.locator('div[data-testid^="card-"]').first();
        await expect(card).toBeVisible();
        await card.click({ force: true });

        // 3. Verify Workbench activation
        // In mobile focus flow, tapping a card typically brings up the "Workbench" overlay
        // or highlights the card and shows "Tap Grid to Place".
        // We can check for a text that only appears in workbench mode.
        await expect(page.getByText(/tap grid to place|place on grid/i).first()).toBeVisible();
    });
});
