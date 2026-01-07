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

    async configureQSort(statements: string[]) {
        await this.page.getByRole('link', { name: /design/i }).first().click();
        await this.page.getByTestId('tab-q-sort').click();

        const textarea = this.page.getByPlaceholder(/paste your statements here/i);
        await textarea.fill(statements.join('\n'));
        await this.page.getByRole('button', { name: /process & replace/i }).click();
        // Verify first statement is visible
        await expect(this.page.getByText(statements[0].trim()).first()).toBeVisible();
    }

    async launchStudy() {
        await this.page.getByRole('link', { name: /dashboard/i }).click();
        await this.page
            .getByRole('button', { name: /active/i })
            .first()
            .click();
        await this.page.getByRole('button', { name: /set to active/i }).click();
        await expect(this.page.getByText(/Collecting responses/i)).toBeVisible();
    }

    async exportCSV() {
        // Navigate to Analytics/Exports
        await this.page.getByRole('link', { name: /data/i }).first().click();

        // Switch to Export data tab
        await this.page.getByRole('tab', { name: /Export data/i }).click();

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
        await this.page.waitForSelector('[data-testid="participants-table"]', { state: 'visible' });
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
