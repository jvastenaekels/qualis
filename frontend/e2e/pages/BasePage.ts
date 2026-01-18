import type { Page, Locator } from '@playwright/test';

export abstract class BasePage {
    protected readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async goto(path: string) {
        await this.page.goto(path);
    }

    async waitForURL(url: string | RegExp, options?: { timeout?: number }) {
        await this.page.waitForURL(url, options);
    }

    async click(selector: string, options?: { timeout?: number }) {
        const element = this.page.locator(selector);
        await element.waitFor({ state: 'visible', timeout: options?.timeout });
        await element.click();
    }

    async safeClick(locator: Locator, options?: { timeout?: number }) {
        await locator.first().waitFor({ state: 'visible', timeout: options?.timeout });
        await locator.first().click();
    }
}
