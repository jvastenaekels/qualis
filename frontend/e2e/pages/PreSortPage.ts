import { type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PreSortPage extends BasePage {
    readonly submitButton = this.page.getByTestId('presort-submit-btn');

    constructor(page: Page) {
        super(page);
    }

    async waitForLoad() {
        // Pre-sort might be skipped in some studies, but we assume it exists if called
        await expect(this.page).toHaveURL(/.*\/presort/, { timeout: 15000 });
    }

    async completePreSort() {
        // Wait for connection/render to stabilize
        await this.page.waitForTimeout(1000);

        // Name selectors are robust with RHF
        const ageInput = this.page.locator('input[name="age"]');
        await expect(ageInput).toBeVisible({ timeout: 10000 });
        await ageInput.fill('25');

        // Verify filling
        const ageVal = await ageInput.inputValue();
        if (ageVal !== '25') {
             // Try force
             await ageInput.fill('25', { force: true });
        }

        const genderSelect = this.page.locator('select[name="gender"]');
        await expect(genderSelect).toBeVisible();
        await genderSelect.selectOption({ index: 1 });

        const educationSelect = this.page.locator('select[name="education"]');
        await expect(educationSelect).toBeVisible();
        await educationSelect.selectOption({ index: 1 });

        await expect(this.submitButton).toBeVisible();
        await expect(this.submitButton).toBeEnabled();
        await this.submitButton.click();
    }
}
