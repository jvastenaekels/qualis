import { type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AdminPage extends BasePage {
    constructor(page: Page) {
        super(page);
    }

    async login(email = 'admin@example.com', password = 'password123') {
        await this.page.goto('/login');
        await this.page.getByLabel(/email/i).fill(email);
        await this.page.getByLabel(/password/i).fill(password);
        await this.page.getByRole('button', { name: /continue/i }).click();
        await expect(this.page).toHaveURL(/\/(admin|app\/)/);
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
        await expect(this.page).toHaveURL(new RegExp(`/studies/${slug}`));
    }

    async waitForSync() {
        await expect(this.page.getByTestId('sync-status')).toContainText(/saved/i, {
            timeout: 15000,
        });
    }

    async configureQSort(statements: string[]) {
        await this.page
            .getByRole('link', { name: /design/i })
            .first()
            .click();

        await this.page.getByTestId('tab-q-sort').click();

        // 1. Statements
        await this.page.getByTestId('subtab-statements').click();

        const textarea = this.page.getByPlaceholder(/paste your statements here/i);
        await textarea.fill(statements.join('\n'));

        // Handle confirm dialog for replacement
        this.page.once('dialog', (dialog) => dialog.accept());
        await this.page.getByRole('button', { name: /process & replace/i }).click();

        // Wait for statements to be saved
        await this.waitForSync();

        // 2. Grid & Auto-Balance
        await this.page.getByTestId('subtab-grid').click();
        await expect(this.page.getByText(/Forced distribution grid/i)).toBeVisible();

        // First, initialize/expand the grid if it's empty (the expand button creates a default grid)
        const expandBtn = this.page.getByTestId('expand-grid-button');
        await expandBtn.click();

        // Now click auto-balance button to adjust for statement count
        await this.page.getByTestId('auto-balance-button').click();

        // Verify balance indicator - check for Symmetric or Ideal Shape
        await expect(this.page.getByText(/Symmetric|Ideal Shape/i)).toBeVisible();

        // Wait for grid config to be saved
        await this.waitForSync();
    }

    async setInstructions(text: string) {
        await this.page.getByTestId('tab-condition').click();
        const input = this.page.locator('#condition_of_instruction');
        await input.fill(text);
        await this.waitForSync();
    }

    async launchStudy() {
        // Go to Interface tab (the last step before activation)
        await this.page.getByTestId('tab-interface').click();

        // Wait for autosave to complete
        await this.waitForSync();

        // WORKAROUND: Clear localStorage backup and reload to get a clean state from the server
        // TODO: Fix the underlying areStudiesEqual comparison bug that causes infinite sync
        await this.page.evaluate(() => {
            const keys = Object.keys(localStorage).filter((k) =>
                k.startsWith('open-q-draft-backup-')
            );
            keys.forEach((k) => {
                localStorage.removeItem(k);
            });
        });

        await this.page.reload();
        await this.page.waitForLoadState('networkidle');

        // If recovery dialog appeared, dismiss it
        const discardBtn = this.page.getByRole('button', {
            name: /discard local version/i,
        });
        if (await discardBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await discardBtn.click();
        }

        // Go to Interface tab again after reload
        await this.page.getByTestId('tab-interface').click();

        const activateBtn = this.page.getByTestId('activate-button');
        await expect(activateBtn).toBeEnabled({ timeout: 10000 });
        await activateBtn.click();

        // Check for validation error dialog
        const errorDialogTitle = this.page.locator('div[role="dialog"] h2', {
            hasText: /Configuration Incomplete/i,
        });
        if (await errorDialogTitle.isVisible({ timeout: 3000 }).catch(() => false)) {
            const errorItems = this.page.locator('div[role="dialog"] .bg-slate-50 span');
            const errors = await errorItems.allTextContents();
            throw new Error(`Activation failed with validation errors: ${errors.join(', ')}`);
        }

        // Wait for page reload and verify status
        await this.page.waitForLoadState('networkidle');

        const statusEl = this.page.getByTestId('study-status');
        await expect(statusEl).toHaveText(/Active/i, { timeout: 30000 });
    }

    async exportCSV() {
        // Navigate to Analytics/Exports
        await this.page.getByRole('link', { name: /data/i }).first().click();

        // Switch to Export data tab
        await this.page.getByRole('tab', { name: /Export data/i }).click();

        const csvBtn = this.page.getByRole('button', {
            name: /export universal csv/i,
        });
        const downloadPromise = this.page.waitForEvent('download');
        await csvBtn.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.csv');
    }

    async closeStudy(slug?: string) {
        if (slug) {
            await this.page.goto(`/admin/studies/${slug}`);
        }
        // Click the 'Closed' card to trigger the dialog
        await this.page
            .getByRole('button', { name: /Closed/i })
            .first()
            .click();
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
