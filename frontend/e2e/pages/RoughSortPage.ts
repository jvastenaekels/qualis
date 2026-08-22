import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class RoughSortPage extends BasePage {
    readonly agreeBtn = this.page.getByTestId('rough-agree-btn');
    readonly disagreeBtn = this.page.getByTestId('rough-disagree-btn');
    readonly neutralBtn = this.page.getByTestId('rough-neutral-btn');

    async waitForLoad() {
        await expect(this.page).toHaveURL(/.*\/rough-sort/, { timeout: 15000 });
    }

    async completeRoughSort(
        totalCards: number,
        distributions: { agree?: number; disagree?: number; neutral?: number } = {}
    ) {
        // Default to distributed sort if no specific distribution is asked,
        // to ensure Fine Sort gets popluated decks
        const defaultMode =
            !distributions.agree && !distributions.disagree && !distributions.neutral;

        if (defaultMode) {
            // Distribute: First to Disagree, rest to Agree
            for (let i = 0; i < totalCards; i++) {
                const btn = i === 0 ? this.disagreeBtn : this.agreeBtn;
                await expect(btn).toBeEnabled({ timeout: 5000 });
                await btn.click();
                // Wait for card animation: counter advances or all cards sorted
                if (i < totalCards - 1) {
                    await expect(this.page.getByText(`${i + 2}/${totalCards}`)).toBeVisible({
                        timeout: 5000,
                    });
                }
            }
        } else {
            // Custom distribution logic would go here if needed
            // For now, implementing the robust default logic is key for CI stability
            // This mimics the fix applied in recent troubleshooting.
        }

        // After sorting, we need to click "Next"
        // Wait for completion screen
        const nextBtn = this.page.getByTestId('rough-sort-next-btn');
        await expect(nextBtn).toBeVisible({ timeout: 5000 });

        // Use JS click for robustness against dnd-kit sensors
        await nextBtn.evaluate((node: HTMLElement) => node.click());

        /*
         * Wait for the navigation the click causes, not for the button to
         * disappear.
         *
         * `toBeHidden({timeout: 5000})` on this button flaked: observed once
         * on the mobile accessibility walk, the button was still visible after
         * 13 polls and the run failed, then passed on an immediate rerun and
         * every run after. The completion screen animates out, so "hidden" is
         * a property of an animation finishing rather than of the step being
         * done — and every caller of this method goes straight to the fine
         * sort, so the URL is both the real post-condition and a stabler one.
         */
        await this.page.waitForURL(/\/fine-sort(\?|$)/, { timeout: 15000 });
    }
}
