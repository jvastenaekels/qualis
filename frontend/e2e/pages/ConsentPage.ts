import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ConsentPage extends BasePage {
    readonly checkbox = this.page.getByTestId('consent-checkbox');
    readonly acceptButton = this.page.getByTestId('consent-accept-btn');
    readonly loadingSpinner = this.page.locator('[data-testid="loading-spinner"]');

    async waitForLoad() {
        await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
        await expect(this.page).toHaveURL(/.*\/consent/, { timeout: 15000 });
    }

    async acceptConsent() {
        await this.checkbox.waitFor({ state: 'visible', timeout: 10000 });
        await this.checkbox.check();
        await this.page.waitForTimeout(300); // Allow checkbox state to propagate
        await expect(this.acceptButton).toBeEnabled({ timeout: 5000 });
        await this.acceptButton.click({ force: true });

        // Wait for navigation away from consent page
        try {
            await this.page.waitForURL((url) => !url.href.includes('/consent'), {
                timeout: 15000,
            });
        } catch {
            // Retry click if navigation didn't happen
            await this.acceptButton.click({ force: true });
            await this.page.waitForURL((url) => !url.href.includes('/consent'), {
                timeout: 10000,
            });
        }
    }
}
