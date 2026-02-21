import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class WelcomePage extends BasePage {
    readonly startButton = this.page.getByTestId('start-btn');
    readonly loadingSpinner = this.page.locator('[data-testid="loading-spinner"]');

    async visit(slug: string) {
        await this.page.goto(`/study/${slug}/welcome`);
        await this.waitForLoad();
    }

    async waitForLoad() {
        await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    }

    async startStudy() {
        const startBtn = this.page.getByTestId('start-btn');
        await expect(startBtn).toBeVisible({ timeout: 10000 });
        // Use dispatchEvent to bypass the <main> overflow container
        // intercepting pointer events at the button's coordinates
        await startBtn.dispatchEvent('click');
    }
}
