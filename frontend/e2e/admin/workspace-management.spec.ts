import { test, expect } from '../fixtures/db-setup';

test.describe('Workspace Management E2E Tests (Real Backend)', () => {
    test('should navigate to settings, update workspace, and verify team table', async ({
        page,
        testDb,
    }) => {
        await testDb.loginToAdminUI(page);
        const workspaceSlug = testDb.getWorkspaceSlug();

        // Navigate to workspace settings via sidebar
        await page.getByRole('link', { name: /settings/i }).last().click();
        await expect(page).toHaveURL(new RegExp(`/${workspaceSlug}/settings`));

        // Update workspace title and slug
        const titleInput = page.getByLabel(/workspace title/i);
        await titleInput.fill('Updated Workspace Title');

        const newSlug = `updated-${Date.now()}`;
        const slugInput = page.getByLabel(/url slug/i);
        await slugInput.fill(newSlug);

        await page.getByRole('button', { name: /save changes/i }).click();
        await expect(page.getByText(/workspace updated/i)).toBeVisible();
        await expect(page).toHaveURL(/\/updated-.*\/settings/);

        // Verify team members table is visible
        await expect(page.locator('table')).toBeVisible();
    });
});
