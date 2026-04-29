import { test, expect } from '../fixtures/db-setup';

test.describe('Project Management E2E Tests (Real Backend)', () => {
    test('should navigate to settings, update project, and verify team table', async ({
        page,
        testDb,
    }) => {
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();

        // Navigate to project settings via sidebar
        await page
            .getByRole('link', { name: /settings/i })
            .last()
            .click();
        await expect(page).toHaveURL(new RegExp(`/${projectSlug}/settings`));

        // Update project title and slug (Phase 5D rename: workspace → project).
        const titleInput = page.getByLabel(/project title/i);
        await titleInput.fill('Updated Project Title');

        const newSlug = `updated-${Date.now()}`;
        // Slug field is wrapped in a relative div with an absolute-positioned
        // "/admin/w/" prefix; getByLabel sometimes fails to resolve through
        // the wrapper. Target the input by name directly.
        const slugInput = page.locator('input[name="slug"]');
        await slugInput.fill(newSlug);

        // Wave E (E1) — save-button label standardised from "Save changes" → "Save"
        await page.getByRole('button', { name: /^save$/i }).click();
        await expect(page.getByText(/project updated/i)).toBeVisible();
        await expect(page).toHaveURL(/\/updated-.*\/settings/);

        // Verify team members table is visible
        await expect(page.locator('table')).toBeVisible();
    });
});
