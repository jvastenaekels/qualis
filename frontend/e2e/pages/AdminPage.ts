import { type Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { VisualAssertions } from '../helpers/VisualAssertions';

export class AdminPage extends BasePage {
    private visual: VisualAssertions;

    constructor(page: Page) {
        super(page);
        this.visual = new VisualAssertions(page);
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

    async waitForSync() {
        // Wait for debounce and status update
        await this.page.waitForTimeout(2000);
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
        await this.page.waitForTimeout(500);

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
        // Go to finish step (Interface is the last) - this ensures we're on the right tab
        await this.page.getByTestId('tab-interface').click();

        // Wait for autosave to complete at least one cycle
        await this.page.waitForTimeout(5000);

        // WORKAROUND: Clear localStorage backup and reload to get a clean state from the server
        // This bypasses the infinite sync loop issue in auto-save
        // TODO: Fix the underlying areStudiesEqual comparison bug that causes infinite sync
        await this.page.evaluate(() => {
            const keys = Object.keys(localStorage).filter((k) =>
                k.startsWith('open-q-draft-backup-')
            );
            keys.forEach((k) => localStorage.removeItem(k));
        });

        await this.page.reload();
        await this.page.waitForLoadState('networkidle');

        // Wait for the recovery dialog to NOT appear (it shouldn't since we cleared localStorage)
        await this.page.waitForTimeout(2000);

        // If recovery dialog appeared anyway, dismiss it
        const discardBtn = this.page.getByRole('button', {
            name: /discard local version/i,
        });
        if (await discardBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            console.error('Recovery dialog appeared, discarding local version...');
            await discardBtn.click();
            await this.page.waitForTimeout(1000);
        }

        // Go to Interface tab again after reload
        await this.page.getByTestId('tab-interface').click();

        // Wait for page to settle
        await this.page.waitForTimeout(2000);

        const activateBtn = this.page.getByTestId('activate-button');

        if (await activateBtn.isDisabled()) {
            console.error('Activate button is DISABLED. Checking checklist...');
            const checklistContainer = this.page.getByTestId('readiness-checklist');
            const items = await checklistContainer.locator('> div').all();
            console.error(`Found ${items.length} checklist items.`);
            for (const item of items) {
                const text = await item.innerText();
                const isComplete = (await item.locator('svg.text-green-500').count()) > 0;
                console.error(`Item text: "${text.replace(/\n/g, ' ')}" | Complete: ${isComplete}`);
            }

            const progress = await this.page
                .getByTestId('checklist-progress')
                .getAttribute('style');
            const status = await this.page.getByTestId('checklist-status').innerText();
            console.error(`Checklist Progress: ${progress}`);
            console.error(`Checklist Status Text: ${status}`);

            // Take a targeted screenshot
            await checklistContainer.screenshot({ path: 'checklist_debug.png' });
        }

        await expect(activateBtn).toBeEnabled({ timeout: 10000 });
        console.error('Clicking activate button...');
        await activateBtn.click();

        // Wait for validation errors dialog OR success (page may reload)
        // First check for validation errors with a short timeout
        await this.page.waitForTimeout(3000);

        // Check for the validation error dialog by its title
        const errorDialogTitle = this.page.locator('div[role="dialog"] h2', {
            hasText: /Configuration Incomplete/i,
        });
        const appeared = await errorDialogTitle.isVisible().catch(() => false);

        if (appeared) {
            // Capture all validation errors from the dialog
            const errorItems = this.page.locator('div[role="dialog"] .bg-slate-50 span');
            const errors = await errorItems.allTextContents();
            throw new Error(`Activation failed with validation errors: ${errors.join(', ')}`);
        }

        // Take a screenshot to see the current state
        await this.page.screenshot({ path: 'after_activate_click.png' });
        console.error('After activate click, waiting for networkidle...');

        // Wait for page reload (activation reloads the page) and then check status
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(2000);

        // Log the current URL and study-status text
        console.error(`Current URL: ${this.page.url()}`);
        const statusEl = this.page.getByTestId('study-status');
        const statusText = await statusEl.textContent().catch(() => 'NOT FOUND');
        console.error(`Study status text: ${statusText}`);

        // After reload, the study-status badge should show Active
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
            await this.goto(`/admin/studies/${slug}`);
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

    // Visual Assertion Methods

    async captureWorkspaceSwitcher(name: string = 'workspace-switcher') {
        await this.page.getByTestId('workspace-switcher').click();
        await this.page.waitForSelector('[role="menu"]', { state: 'visible' });
        return await this.visual.captureElement('[role="menu"]', name);
    }

    async captureCommandMenu(name: string = 'command-menu') {
        await this.page.keyboard.press('Control+k');
        await this.page.waitForSelector('[role="dialog"]', { state: 'visible' });
        return await this.visual.captureElement('[role="dialog"]', name);
    }

    async captureParticipantTable(name: string = 'participant-table') {
        await this.page.waitForSelector('[data-testid="participants-table"]', {
            state: 'visible',
        });
        return await this.visual.captureElement('[data-testid="participants-table"]', name);
    }

    async verifyResponsiveLayout(viewport: { width: number; height: number }) {
        await this.page.setViewportSize(viewport);
        await this.page.waitForTimeout(500); // Allow layout to settle
        return await this.visual.compareScreenshot(
            `responsive-${viewport.width}x${viewport.height}`
        );
    }

    async captureDashboard(name: string = 'dashboard-overview') {
        return await this.visual.compareScreenshot(name);
    }

    async captureRecentActivity(name: string = 'recent-activity') {
        const activityCard = this.page.locator('text=Recent activity').locator('..');
        await activityCard.waitFor({ state: 'visible' });
        return await this.visual.captureElement('text=Recent activity >> ..', name);
    }
}
