import { expect, test } from '@playwright/test';
import { mockStudyAPI, mockStudyConfig } from './fixtures/study-config';

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
        // Go directly to fine sort
        await page.goto(`/study/${mockStudyConfig.slug}/welcome`);

        // Welcome Page
        const startBtn = page.getByTestId('start-btn');
        await expect(startBtn).toBeVisible({ timeout: 15000 });
        await startBtn.click();

        // Consent Page
        const checkbox = page.getByTestId('consent-checkbox');
        await expect(checkbox).toBeVisible({ timeout: 15000 });
        await checkbox.check();

        const acceptBtn = page.getByTestId('consent-accept-btn');
        await expect(acceptBtn).toBeVisible({ timeout: 15000 });
        await acceptBtn.click();

        // Presort Page
        const presortSubmit = page.getByTestId('presort-submit-btn');
        await expect(presortSubmit).toBeVisible({ timeout: 15000 });
        await presortSubmit.click();

        // Rough sort - just click Neutral for all
        await expect(page).toHaveURL(/.*\/rough-sort/, { timeout: 15000 });
        const cardsTotal = mockStudyConfig.statements.length;
        const neutralBtn = page.getByTestId('rough-neutral-btn');
        const disagreeBtn = page.getByTestId('rough-disagree-btn');

        for (let i = 0; i < cardsTotal; i++) {
            if (i === 0) {
                await disagreeBtn.click();
            } else {
                await neutralBtn.click();
            }
            await page.waitForTimeout(300); // Allow for mobile animation
        }

        // Click Next (Intermediate screen)
        const nextBtn = page.getByRole('button', { name: /next|suivant|continue/i }).first();
        await expect(nextBtn).toBeEnabled({ timeout: 15000 });
        await nextBtn.click();

        // Now in Fine Sort
        await expect(page).toHaveURL(/.*\/fine-sort/, { timeout: 15000 });

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
