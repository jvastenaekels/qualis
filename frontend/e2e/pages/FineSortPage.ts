import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class FineSortPage extends BasePage {
    readonly deckContainer = this.page.getByTestId('deck-cards-container');

    async waitForLoad() {
        await expect(this.page).toHaveURL(/.*\/fine-sort/, { timeout: 20000 });
    }

    async verifyLayout() {
        await expect(this.page.getByTestId('legend-disagree')).toBeVisible();
        await expect(this.page.getByTestId('legend-agree')).toBeVisible();
        await expect(this.page.getByRole('button', { name: /zoom/i })).toHaveCount(2);
        await expect(this.page.getByRole('tab')).toHaveCount(3);
    }

    async checkFooter(instructionRegex: RegExp) {
        await expect(this.page.getByText(instructionRegex)).toBeVisible();
    }

    async getDeckCount() {
        return await this.deckContainer.locator('[data-testid^="card-"]').count();
    }

    async selectPile(pileIndex: number) {
        // 0=Disagree, 1=Neutral, 2=Agree
        const tab = this.page.getByRole('tab').nth(pileIndex);
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(this.deckContainer).toBeVisible();
    }

    async moveFirstCardToGrid() {
        // 1. Click the first card in the deck to select it
        const deckCard = this.deckContainer.locator('[data-testid^="card-"]').first();
        await expect(deckCard).toBeVisible();
        await deckCard.click({ force: true });

        // 1b. Verify selection (wait for ring-2 class on INNER element)
        const innerCard = deckCard.locator('div').first();
        try {
            await expect(innerCard).toHaveClass(/ring-2/, { timeout: 2000 });
        } catch (_e) {
            // Use JS click to bypass dnd-kit sensors
            await deckCard.evaluate((node: HTMLElement) => node.click());
            await expect(innerCard).toHaveClass(/ring-2/, { timeout: 2000 });
        }

        // 2. Find the first empty grid slot
        const emptySlot = this.page
            .locator('[role="gridcell"]:not(:has([data-testid^="card-"]))')
            .first();

        await expect(emptySlot).toBeVisible();
        await emptySlot.scrollIntoViewIfNeeded();

        // 3. Click the empty slot to place the card
        await emptySlot.evaluate((node: HTMLElement) => node.click());
    }

    async verifyWorkbenchActive() {
        await expect(this.page.getByText(/tap grid to place|place on grid/i).first()).toBeVisible();
    }

    async tapFirstCard() {
        const deckCard = this.deckContainer.locator('[data-testid^="card-"]').first();
        await expect(deckCard).toBeVisible();
        await deckCard.click();
        const innerCard = deckCard.locator('div').first();
        await expect(innerCard).toHaveClass(/ring-2/);
    }

    async completeFineSort() {
        // Zoom out to ensure grid is fully visible
        const zoomOutBtn = this.page.getByRole('button', { name: /zoom out/i }).first();
        if (await zoomOutBtn.isVisible()) {
            await zoomOutBtn.click();
            await expect(zoomOutBtn).toBeEnabled({ timeout: 2000 });
            await zoomOutBtn.click();
        }

        // Iterate through the 3 tabs: Disagree (0), Neutral (1), Agree (2)
        for (let pileIndex = 0; pileIndex < 3; pileIndex++) {
            await this.selectPile(pileIndex);

            // While cards remain in the current deck, move them to the grid
            let cardsInDeck = await this.getDeckCount();
            while (cardsInDeck > 0) {
                await this.moveFirstCardToGrid();

                // Verification: Deck count should decrease
                await expect
                    .poll(
                        async () => {
                            return await this.getDeckCount();
                        },
                        { timeout: 5000 }
                    )
                    .toBeLessThan(cardsInDeck);

                cardsInDeck = await this.getDeckCount();
            }
        }

        // Wait for the finish/next button to enable and click it
        const nextButton = this.page.getByRole('button', {
            name: /next|finish|continue|confirm|submit/i,
        });
        await expect(nextButton).toBeEnabled();
        await nextButton.evaluate((node: HTMLElement) => node.click());
    }
}
