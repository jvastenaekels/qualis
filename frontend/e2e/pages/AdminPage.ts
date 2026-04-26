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
        // Post-Phase-5D: study creation moved from the sidebar's study-switcher
        // dropdown to a "Create study" button on the project dashboard.
        // The user is dropped on /app/{projectSlug}/dashboard after login.
        const sidebarTrigger = this.page.locator('[data-sidebar="trigger"]');
        if (await sidebarTrigger.isVisible()) {
            await sidebarTrigger.click().catch(() => {});
        }

        await this.page
            .getByRole('button', { name: /create study/i })
            .first()
            .click();
        // CreateStudyDialog opens. Form labels: "Study Title", "URL Slug", language checkboxes.
        await this.page.getByLabel(/study title/i).fill(title);
        await this.page.getByLabel(/url slug/i).fill(slug);

        const createResponsePromise = this.page.waitForResponse(
            (resp) => resp.url().includes('/api/admin/studies') && resp.status() === 201
        );
        // The dialog's submit button reads "Create Study" (same string as the
        // dashboard trigger). Scope to the dialog with role=dialog parent to disambiguate.
        await this.page
            .getByRole('dialog')
            .getByRole('button', { name: /create study/i })
            .click();
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
        // Post-Phase-5D: caller is expected to already be on /data
        // (admin-flow does an explicit page.goto). InteractiveDataView is
        // single-page (no tabs); export lives behind an "Export" dropdown
        // whose menu items include "Universal CSV".
        const exportButton = this.page.getByRole('button', { name: /^export data$/i }).first();
        await exportButton.click();
        const downloadPromise = this.page.waitForEvent('download');
        // Dropdown items: Research Package (ZIP), CSV, PQMethod (ZIP), R-Kit (ZIP), JSON Dump.
        // ^CSV$ avoids matching the others; case-insensitive for safety.
        await this.page.getByRole('menuitem', { name: /^csv$/i }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.csv');
    }

    async closeStudy(slug?: string, projectSlug?: string) {
        // Phase 5D: legacy /admin/studies/{slug} redirects via LegacyRedirect,
        // but the redirect is async (useEffect) and racing the next click is
        // unreliable. Go straight to the new URL.
        if (slug && projectSlug) {
            await this.page.goto(`/app/${projectSlug}/studies/${slug}`);
        }
        // StudyStatusControl renders state-step cards as <div role="button">.
        // The accessible name is "{label} {description}" — for the closed
        // state it reads "Closed Analysis & export".
        await this.page.getByRole('button', { name: /^Closed/ }).click();
        // The AlertDialog has a footer action labelled "Close Study"
        // (admin.study_status.dialog.closed.action). Scope to the dialog so
        // we don't catch any other "Close" button on the page.
        await this.page
            .getByRole('alertdialog')
            .getByRole('button', { name: /^close study$/i })
            .click();

        // Wait for status badge to update
        await expect(this.page.getByTestId('study-status')).toHaveText(/Closed/i);
    }

    async verifyParticipant(text: string | RegExp) {
        await expect(this.page.getByText(text).first()).toBeVisible();
    }

    async verifyStatus(status: 'Draft' | 'Active' | 'Closed') {
        // dnd-kit mounts a global #DndLiveRegion-0 with role="status";
        // disambiguate with the testid on the study-status badge.
        await expect(this.page.getByTestId('study-status')).toHaveText(status);
    }

    async logout() {
        await this.page.keyboard.press('Control+k');
        await this.page.getByPlaceholder(/type a command/i).fill('logout');
        await this.page.keyboard.press('Enter');
        await expect(this.page).toHaveURL('/login');
    }
}
