import type { Page, Locator } from '@playwright/test';

export abstract class BasePage {
    protected readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async safeClick(locator: Locator, options?: { timeout?: number }) {
        await locator.first().waitFor({ state: 'visible', timeout: options?.timeout });
        await locator.first().click();
    }
}
