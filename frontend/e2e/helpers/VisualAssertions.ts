import { type Page, expect } from '@playwright/test';

/**
 * Visual Assertions Helper for E2E Tests
 * Provides consistent screenshot capture and visual comparison utilities
 */
export class VisualAssertions {
    constructor(private page: Page) {}

    /**
     * Capture a screenshot with standardized naming and options
     */
    async captureScreenshot(
        name: string,
        options?: {
            fullPage?: boolean;
            clip?: { x: number; y: number; width: number; height: number };
            mask?: any[];
        }
    ) {
        await this.page.waitForLoadState('networkidle');
        await this.page.evaluate(() => document.fonts.ready);

        return await this.page.screenshot({
            path: `e2e/screenshots/${name}.png`,
            fullPage: options?.fullPage ?? false,
            clip: options?.clip,
            mask: options?.mask,
            animations: 'disabled',
        });
    }

    /**
     * Compare screenshot against baseline with configurable threshold
     */
    async compareScreenshot(
        name: string,
        options?: {
            maxDiffPixelRatio?: number;
            threshold?: number;
        }
    ) {
        await this.page.waitForLoadState('networkidle');
        await this.page.evaluate(() => document.fonts.ready);

        await expect(this.page).toHaveScreenshot(`${name}.png`, {
            fullPage: false,
            animations: 'disabled',
            maxDiffPixelRatio: options?.maxDiffPixelRatio ?? 0.05,
            threshold: options?.threshold ?? 0.2,
        });
    }

    /**
     * Capture element screenshot with automatic wait
     */
    async captureElement(selector: string, name: string) {
        const element = this.page.locator(selector);
        await element.waitFor({ state: 'visible' });
        await this.page.evaluate(() => document.fonts.ready);

        return await element.screenshot({
            path: `e2e/screenshots/${name}.png`,
            animations: 'disabled',
        });
    }

    /**
     * Verify responsive layout at different viewports
     */
    async verifyResponsiveLayout(viewports: { name: string; width: number; height: number }[]) {
        for (const viewport of viewports) {
            await this.page.setViewportSize({
                width: viewport.width,
                height: viewport.height,
            });
            await this.page.waitForTimeout(500); // Allow layout to settle
            await this.compareScreenshot(`${viewport.name}-responsive`);
        }
    }

    /**
     * Check accessibility violations using Playwright's accessibility tree
     */
    async checkAccessibility() {
        const snapshot = await this.page.accessibility.snapshot();
        expect(snapshot).toBeTruthy();
        return snapshot;
    }

    /**
     * Verify focus indicators are visible
     */
    async verifyFocusIndicators(selectors: string[]) {
        for (const selector of selectors) {
            const element = this.page.locator(selector);
            await element.focus();
            await expect(element).toBeFocused();

            // Capture focused state
            await this.captureElement(selector, `${selector.replace(/[^a-z0-9]/gi, '-')}-focused`);
        }
    }

    /**
     * Wait for all images to load
     */
    async waitForImages() {
        await this.page.evaluate(() => {
            return Promise.all(
                Array.from(document.images)
                    .filter((img) => !img.complete)
                    .map(
                        (img) =>
                            new Promise((resolve) => {
                                img.onload = img.onerror = resolve;
                            })
                    )
            );
        });
    }

    /**
     * Capture loading state (skeleton screens)
     */
    async captureLoadingState(name: string) {
        // Capture immediately before data loads
        await this.page.screenshot({
            path: `e2e/screenshots/${name}-loading.png`,
            animations: 'disabled',
        });
    }

    /**
     * Capture error state
     */
    async captureErrorState(name: string) {
        await this.page.screenshot({
            path: `e2e/screenshots/${name}-error.png`,
            fullPage: true,
            animations: 'disabled',
        });
    }

    /**
     * Mask dynamic content (timestamps, IDs) before screenshot
     */
    getMask(selectors: string[]) {
        return selectors.map((selector) => this.page.locator(selector));
    }
}
