import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PreSortPage extends BasePage {
    readonly submitButton = this.page.getByTestId('presort-submit-btn');

    async waitForLoad() {
        // Pre-sort might be skipped in some studies, but we assume it exists if called
        await expect(this.page).toHaveURL(/.*\/presort/, { timeout: 15000 });
    }

    async completePreSort() {
        const ageInput = this.page.getByLabel('Age', { exact: false });
        await expect(ageInput).toBeVisible({ timeout: 10000 });
        await ageInput.fill('25');

        const genderSelect = this.page.getByLabel('Gender', { exact: false });
        await expect(genderSelect).toBeVisible({ timeout: 5000 });
        await genderSelect.selectOption({ index: 1 });

        const educationSelect = this.page.getByLabel('Education', { exact: false });
        await expect(educationSelect).toBeVisible({ timeout: 5000 });
        await educationSelect.selectOption({ index: 1 });

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
