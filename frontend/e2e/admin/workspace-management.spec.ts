import { test, expect } from '@playwright/test';
import { setupAdminMocks, resetStores } from '../fixtures/admin-mocks';
import { AdminPage } from '../pages/AdminPage';
import { VisualAssertions } from '../helpers/VisualAssertions';

test.beforeEach(async ({ page }) => {
    resetStores();
    await setupAdminMocks(page);
});

test.describe('Workspace Management E2E Tests', () => {
    let adminPage: AdminPage;
    let visual: VisualAssertions;

    test.beforeEach(async ({ page }) => {
        adminPage = new AdminPage(page);
        visual = new VisualAssertions(page);
        await adminPage.login();
    });

    test('should navigate to workspace settings via switcher', async ({ page }) => {
        // Open workspace switcher
        await page.getByTestId('workspace-switcher').click();

        // Screenshot dropdown
        await visual.captureElement('[role="menu"]', 'workspace-switcher-dropdown');

        // Click workspace settings
        await page.getByRole('menuitem', { name: /workspace settings/i }).click();

        // Wait for navigation
        await expect(page).toHaveURL(/\/admin\/workspaces\/.*\/settings/);

        // Capture workspace settings page
        await visual.compareScreenshot('workspace-settings-page', {
            fullPage: true,
        });
    });

    test('should navigate to workspace settings via Command Menu', async ({ page }) => {
        // Open command menu
        await page.keyboard.press('Control+k');
        await page.waitForSelector('[role="dialog"]', { state: 'visible' });

        // Screenshot command menu
        await visual.captureElement('[role="dialog"]', 'command-menu-open');

        // Search for workspace settings
        await page.getByPlaceholder(/type a command/i).fill('workspace settings');
        await page.keyboard.press('Enter');

        // Wait for navigation
        await expect(page).toHaveURL(/\/admin\/workspaces\/.*\/settings/);

        await visual.compareScreenshot('workspace-settings-via-cmd-k');
    });

    test('should update workspace title and slug', async ({ page }) => {
        await page.goto('/admin/workspaces/example-workspace/settings');

        // Capture initial state
        await visual.compareScreenshot('workspace-settings-before-update');

        // Update title
        const titleInput = page.getByLabel(/workspace title/i);
        await titleInput.fill('Updated Workspace Title');

        // Update slug
        const slugInput = page.getByLabel(/url slug/i);
        await slugInput.fill('updated-workspace');

        // Capture form with changes
        await visual.captureElement('form', 'workspace-settings-form-filled');

        // Submit
        await page.getByRole('button', { name: /save changes/i }).click();

        // Wait for success toast
        await expect(page.getByText(/workspace updated/i)).toBeVisible();

        // Verify URL changed
        await expect(page).toHaveURL('/admin/workspaces/updated-workspace/settings');
    });

    test('should display team members table', async ({ page }) => {
        await page.goto('/admin/workspaces/example-workspace/settings');

        // Wait for members table
        await page.waitForSelector('[data-testid="members-table"]', { state: 'visible' });

        // Capture members table
        await visual.captureElement('[data-testid="members-table"]', 'workspace-members-table');
    });

    test('should change team member role', async ({ page }) => {
        await page.goto('/admin/workspaces/example-workspace/settings');

        // Wait for table
        await page.waitForSelector('[data-testid="members-table"]', { state: 'visible' });

        // Find first member row (not current user)
        const memberRow = page.locator('[data-testid="member-row"]').nth(1);

        // Click role dropdown
        const roleSelect = memberRow.locator('[role="combobox"]');
        await roleSelect.click();

        // Capture role dropdown
        await visual.captureElement('[role="listbox"]', 'member-role-dropdown');

        // Select new role
        await page.getByRole('option', { name: /researcher/i }).click();

        // Wait for update
        await expect(page.getByText(/role updated/i)).toBeVisible();

        // Capture updated table
        await visual.captureElement(
            '[data-testid="members-table"]',
            'workspace-members-table-after-role-change'
        );
    });

    test('should remove team member', async ({ page }) => {
        await page.goto('/admin/workspaces/example-workspace/settings');

        // Find member row
        const memberRow = page.locator('[data-testid="member-row"]').nth(1);

        // Click remove button
        const removeButton = memberRow.getByRole('button', { name: /remove/i });
        await removeButton.click();

        // Confirm dialog
        page.on('dialog', (dialog) => dialog.accept());

        // Wait for removal
        await expect(page.getByText(/member removed/i)).toBeVisible();

        // Capture updated table
        await visual.compareScreenshot('workspace-members-after-removal');
    });

    test('should display permissions matrix sidebar', async ({ page }) => {
        await page.goto('/admin/workspaces/example-workspace/settings');

        // Capture permissions info card
        await visual.captureElement(
            '[data-testid="permissions-matrix"]',
            'permissions-matrix-card'
        );
    });

    test('should show invite collaborator placeholder', async ({ page }) => {
        await page.goto('/admin/workspaces/example-workspace/settings');

        // Capture invite card
        await visual.captureElement('[data-testid="invite-card"]', 'invite-collaborator-card');

        // Verify button is disabled
        const inviteButton = page.getByRole('button', { name: /inv ite collaborator/i });
        await expect(inviteButton).toBeDisabled();
    });

    test('should prevent self-removal', async ({ page }) => {
        await page.goto('/admin/workspaces/example-workspace/settings');

        // Try to change own role (should be disabled)
        const currentUserRow = page.locator('[data-testid="member-row"]').first();
        const roleSelect = currentUserRow.locator('[role="combobox"]');

        await expect(roleSelect).toBeDisabled();

        // Try to remove self (should be disabled)
        const removeButton = currentUserRow.getByRole('button', { name: /remove/i });
        await expect(removeButton).toBeDisabled();
    });

    test.describe('Visual States', () => {
        test('should display workspace settings on tablet', async ({ page }) => {
            await page.setViewportSize({ width: 768, height: 1024 });
            await page.goto('/admin/workspaces/example-workspace/settings');

            await visual.compareScreenshot('workspace-settings-tablet');
        });

        test('should display workspace settings on mobile', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/admin/workspaces/example-workspace/settings');

            await visual.compareScreenshot('workspace-settings-mobile', {
                fullPage: true,
            });
        });
    });
});
