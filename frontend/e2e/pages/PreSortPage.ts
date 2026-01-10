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
        await expect(genderSelect).toBeVisible();
        await genderSelect.selectOption({ label: 'Female' }); // Select by label if possible

        const educationSelect = this.page.getByLabel('Education', { exact: false });
        await expect(educationSelect).toBeVisible();
        await educationSelect.selectOption({ value: 'Bachelor' });

        await expect(this.submitButton).toBeVisible();
        await expect(this.submitButton).toBeEnabled();
        await this.submitButton.click();
    }
    async submit() {
        await this.submitButton.click();
    }
}
