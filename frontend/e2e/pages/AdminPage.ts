import { type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AdminPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async login(email = 'admin@example.com', password = 'password123') {
        await this.goto('/login');
        await this.page.getByLabel(/email/i).fill(email);
        await this.page.getByLabel(/password/i).fill(password);
        await this.page.getByRole('button', { name: /continue/i }).click();
        await expect(this.page).toHaveURL('/admin');
    }

    async createStudy(title: string, slug: string) {
        // Handle sidebar if mobile
        // Need to know if mobile? Can check page viewport or try/catch.
        // Assuming desktop for now based on original test structure, or can add logic.
        const sidebarTrigger = this.page.locator('[data-sidebar="trigger"]');
        if (await sidebarTrigger.isVisible()) {
             await sidebarTrigger.click().catch(() => {});
        }

        await this.page.getByTestId('study-switcher').click();
        await this.page.getByRole('menuitem', { name: /add study/i }).click();
        await this.page.getByLabel(/study title/i).fill(title);
        await this.page.getByLabel(/url slug/i).fill(slug);

        const createResponsePromise = this.page.waitForResponse(
            (resp) => resp.url().includes('/api/admin/studies') && resp.status() === 201
        );
        await this.page.getByRole('button', { name: /create/i }).click();
        await createResponsePromise;
        await expect(this.page).toHaveURL(new RegExp(`/admin/studies/${slug}`));
    }

    async configureQSort(statements: string[]) {
        await this.page.getByText('Study design').first().click();
        await this.page.getByRole('tab', { name: /Q-Sort Task/i }).click();

        const textarea = this.page.getByPlaceholder(/paste your statements here/i);
        await textarea.fill(statements.join('\n'));
        await this.page.getByRole('button', { name: /process & replace/i }).click();
        // Verify first statement is visible
        await expect(this.page.getByText(statements[0].trim()).first()).toBeVisible();
    }

    async launchStudy() {
        await this.page.getByRole('link', { name: /dashboard/i }).click();
        await this.page.getByRole('button', { name: /active/i }).first().click();
        await this.page.getByRole('button', { name: /set to active/i }).click();
        await expect(this.page.getByText(/receiving data/i)).toBeVisible();
    }

    async exportCSV() {
        // Navigate to Analytics/Exports
        await this.page.getByRole('link', { name: /explore analytics/i }).first().click();

        // Switch to File downloads tab
        await this.page.getByRole('tab', { name: /file downloads/i }).click();

        const csvBtn = this.page.getByRole('button', { name: /export universal csv/i });
        const downloadPromise = this.page.waitForEvent('download');
        await csvBtn.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.csv');
    }

    async closeStudy(slug?: string) {
        if (slug) {
            await this.goto(`/admin/studies/${slug}`);
        }
        // Click the 'Closed' card to trigger the dialog
        await this.page.getByRole('button', { name: /Closed/i }).first().click();
        await this.page.getByRole('button', { name: /Close Study/i }).click();

        // Wait for status badge to update
        await expect(this.page.getByRole('status')).toHaveText(/Closed/i);
    }

    async verifyParticipant(text: string | RegExp) {
        await expect(this.page.getByText(text).first()).toBeVisible();
    }

    async verifyStatus(status: 'Draft' | 'Active' | 'Closed') {
        await expect(this.page.getByRole('status')).toHaveText(status);
    }

    async logout() {
        await this.page.keyboard.press('Control+k');
        await this.page.getByPlaceholder(/type a command/i).fill('logout');
        await this.page.keyboard.press('Enter');
        await expect(this.page).toHaveURL('/login');
    }
}
