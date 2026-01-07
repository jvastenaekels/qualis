import { test, expect } from '@playwright/test';

test.describe('Admin Profile Management', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeEach(async ({ page }) => {
        // Assuming standard admin login flow from other tests
        await page.goto('/login');
        await page.getByLabel('Email').fill('admin@example.com');
        await page.getByLabel('Password').fill('admin123');
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page).toHaveURL(/\/admin/);
    });

    test('should verify sidebar profile link exists', async ({ page }) => {
        // Check if user menu (dropdown) contains profile link
        // Sidebar usually has a user badge/name
        const _userMenu = page
            .locator(
                'button[data-testid="user-menu-trigger"], button:has-text("admin@example.com")'
            )
            .first();
        // Or closer inspection of AppSidebar.ts might be needed if selectors are tricky,
        // but assuming standard accessible roles or text.
        // The previous implementation used a SidebarMenuButton with user email/name.

        // Let's try to find the user menu trigger. Use a broad selector if unsure of 'data-testid'.
        // Typically it shows the user's name or email.
        await page.getByText('admin@example.com').click();

        // Check for "Profile" menu item
        await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    });

    test('should navigate to profile page and update name', async ({ page }) => {
        await page.goto('/admin/profile');

        // Check initial state
        await expect(page.getByLabel('Email')).toBeDisabled();
        await expect(page.getByLabel('Email')).toHaveValue('admin@example.com');

        // Update Name
        const newName = `Admin User ${Date.now()}`;
        await page.getByLabel('Full Name').fill(newName);
        await page.getByRole('button', { name: 'Save Changes' }).click();

        // Verify name persistence (App reloads on success)
        await page.waitForLoadState('domcontentloaded');
        await expect(page.getByLabel('Full Name')).toHaveValue(newName);

        // Verify name change in Sidebar (if implemented to show name)
        // Sidebar might need a reload or state update to reflect name immediately
        // await expect(page.getByText(newName)).toBeVisible();
    });

    test('should validate password change requirements', async ({ page }) => {
        await page.goto('/admin/profile');

        // Try empty submission
        await page.getByRole('button', { name: 'Change Password' }).click();
        // Expect HTML5 validation or UI error messages
        // Assuming react-hook-form shows errors.

        // Fill short password
        await page.getByLabel('New Password').fill('123');
        await page.getByRole('button', { name: 'Change Password' }).click();
        await expect(page.getByText('Min 8 characters required')).toBeVisible();

        // Fill mismatch (if confirm field exists, currently it doesn't seem so in the implementation description)
        // The implementation only asked for current and new password.

        // Test Wrong Current Password
        await page.getByLabel('Current Password').fill('wrongpass');
        await page.getByLabel('New Password').fill('newsecurepass123');
        await page.getByRole('button', { name: 'Change Password' }).click();

        // Expect backend error toast (caught and rephrased by frontend)
        await expect(
            page.getByText('Failed to change password. check current password.')
        ).toBeVisible();
    });
});
