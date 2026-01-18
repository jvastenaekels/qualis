import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PreSortPage extends BasePage {
    readonly submitButton = this.page.getByTestId('presort-submit-btn');

    async waitForLoad() {
        // Pre-sort might be skipped in some studies, but we assume it exists if called
        await expect(this.page).toHaveURL(/.*\/presort/, { timeout: 15000 });
    }

    async completePreSort() {
        // Wait for connection/render to stabilize
        await this.page.waitForTimeout(1000);

        // Name selectors are robust with RHF
        // Use label-based selection for robustness
        const ageInput = this.page.getByLabel('Age', { exact: false });
        await expect(ageInput).toBeVisible({ timeout: 10000 });
        await ageInput.fill('25');

        // Verify filling
        const ageVal = await ageInput.inputValue();
        if (ageVal !== '25') {
            await ageInput.fill('25', { force: true });
        }

        const genderSelect = this.page.getByLabel('Gender', { exact: false });
        await expect(genderSelect).toBeVisible({ timeout: 5000 });
        // Use index 1 to select first real option (0 is usually placeholder)
        await genderSelect.selectOption({ index: 1 });

        const educationSelect = this.page.getByLabel('Education', { exact: false });
        await expect(educationSelect).toBeVisible({ timeout: 5000 });
        // Use index 1 to select first real option
        await educationSelect.selectOption({ index: 1 });

        await this.page.waitForTimeout(300); // Allow form validation
        await expect(this.submitButton).toBeVisible();
        await expect(this.submitButton).toBeEnabled({ timeout: 5000 });
        await this.submitButton.click();

        // Wait for navigation away from presort
        await this.page.waitForURL((url) => !url.href.includes('/presort'), {
            timeout: 15000,
        });
    }
    async submit() {
        await this.submitButton.click();
    }
}
