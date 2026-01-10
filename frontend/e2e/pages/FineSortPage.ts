import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class FineSortPage extends BasePage {
    readonly deckContainer = this.page.getByTestId('deck-cards-container');
    readonly footerInstruction = this.page.locator(
        '#footer-instruction, .footer-instruction, [class*="footer"]'
    ); // Adjust selector as needed based on actual implementation or text

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
        // Wait for stability
        await this.page.waitForTimeout(300);
        await deckCard.click({ force: true });

        // 1b. Verify selection (wait for ring-2 class on INNER element)
        const innerCard = deckCard.locator('div').first();
        // If not selected within timeout, click again (retry mechanism)
        try {
            await expect(innerCard).toHaveClass(/ring-2/, { timeout: 2000 });
        } catch (e) {
            console.log('Card not selected, retrying click with JS dispatch...');
            await this.page.waitForTimeout(500);
            // Use JS click to bypass dnd-kit sensors
            await deckCard.evaluate((node: HTMLElement) => node.click());
            await expect(innerCard).toHaveClass(/ring-2/, { timeout: 2000 });
        }

        // 2. Find the first empty grid slot
        // An empty slot is a gridcell that does NOT contain a card
        const emptySlot = this.page.locator('[role="gridcell"]:not(:has([data-testid^="card-"]))').first();

        // Ensure visibility and scroll into view
        await expect(emptySlot).toBeVisible();
        await emptySlot.scrollIntoViewIfNeeded();

        // Debug: Log the slot ID
        const slotId = await emptySlot.getAttribute('id');
        console.log(`Clicking empty slot: ${slotId}`);

        // 3. Click the empty slot to place the card
        // Use force: true to bypass potential overlays/transform issues from zoom-pan-pinch
        await emptySlot.click({ force: true });

        // 4. Wait for the move to complete (card should appear in slot)
        // We verify this implicitly by checking deck count in the calling loop
    }

    async verifyWorkbenchActive() {
        await expect(this.page.getByText(/tap grid to place|place on grid/i).first()).toBeVisible();
    }

    /**
     * Completes the Fine Sort by placing all cards onto the grid using keyboard drag-and-drop.
     * Iterates through all 3 tabs (Disagree, Neutral, Agree) and empties the decks.
     */
    async completeFineSort(expectedTotalCards: number) {
        // Zoom out to ensure grid is fully visible (critical for mobile tests to avoid footer overlap)
        const zoomOutBtn = this.page.getByRole('button', { name: /zoom out/i }).first();
        if (await zoomOutBtn.isVisible()) {
            await zoomOutBtn.click();
            await this.page.waitForTimeout(200);
            await zoomOutBtn.click(); // Zoom out twice for safety
            await this.page.waitForTimeout(200);
        }

        // Iterate through the 3 tabs: Disagree (0), Neutral (1), Agree (2)
        for (let pileIndex = 0; pileIndex < 3; pileIndex++) {
            await this.selectPile(pileIndex);

            // Wait for deck animation
            await this.page.waitForTimeout(500);

            // While cards remain in the current deck, move them to the grid
            let cardsInDeck = await this.getDeckCount();
            while (cardsInDeck > 0) {
               await this.moveFirstCardToGrid();

               // Verification: Deck count should decrease
               await expect.poll(async () => {
                   return await this.getDeckCount();
               }, { timeout: 5000 }).toBeLessThan(cardsInDeck);

               cardsInDeck = await this.getDeckCount();
            }
        }

        // Verify all cards are placed (grid should have expectedTotalCards)
        // Adjust selector to match cards placed on the grid (grid-cell-filled) or similar
        // For robustness, waiting for the "Finish" or "Next" button to be enabled is a good proxy.
        // Assuming "Next" button appears or enables when full.
        const nextButton = this.page.getByRole('button', { name: /next|finish|continue/i });
        await expect(nextButton).toBeEnabled();
        await nextButton.click();
    }
}
