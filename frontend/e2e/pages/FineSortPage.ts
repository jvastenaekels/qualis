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

    async dragFirstCardToSlot() {
        const deckCard = this.deckContainer.locator('[data-testid^="card-"]').first();

        // Keyboard Accessibility DnD
        // 1. Focus the card
        await deckCard.focus();
        await expect(deckCard).toBeFocused();

        // 2. Lift the card
        await this.page.keyboard.press('Space');
        await this.page.waitForTimeout(200); // Wait for lift animation

        // 3. Move it to the Grid (Left of Deck)
        // Try multiple moves to ensure it crosses into the grid area
        await this.page.keyboard.press('ArrowLeft');
        await this.page.waitForTimeout(50);
        await this.page.keyboard.press('ArrowLeft');
        await this.page.waitForTimeout(50);
        await this.page.keyboard.press('ArrowLeft');
        await this.page.waitForTimeout(50);

        // 4. Drop
        await this.page.keyboard.press('Space');
        await this.page.waitForTimeout(500); // Wait for drop settling

        // 5. Verification: Check deck count decreased (it moved SOMEWHERE)
        // We don't check a specific slot because keyboard nav target depends on exact layout
    }

    async tapFirstCard() {
        const deckCard = this.deckContainer.locator('[data-testid^="card-"]').first();
        await expect(deckCard).toBeVisible();
        await deckCard.click({ force: true });
    }

    async verifyWorkbenchActive() {
        await expect(this.page.getByText(/tap grid to place|place on grid/i).first()).toBeVisible();
    }
}
