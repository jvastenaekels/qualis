import { test, expect } from '../fixtures/db-setup';

test.describe('Admin Profile Management', () => {
    test('should navigate to profile, update name, and validate password change', async ({
        page,
        testDb,
    }) => {
        await testDb.loginToAdminUI(page);
        const email = testDb.getUserEmail();

        // Verify sidebar profile link
        await page.getByText(email).click();
        await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();

        // Navigate to profile
        await page.getByRole('menuitem', { name: 'Profile' }).click();
        await expect(page).toHaveURL(/\/profile/);

        // Verify email is read-only
        await expect(page.getByLabel('Email')).toBeDisabled();
        await expect(page.getByLabel('Email')).toHaveValue(email);

        // Update name and verify persistence
        const newName = `Admin User ${Date.now()}`;
        await page.getByLabel('Full Name').fill(newName);
        await page.getByRole('button', { name: 'Save Changes' }).click();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.getByLabel('Full Name')).toHaveValue(newName);

        // Validate password change — short password
        await page.getByLabel('New Password').fill('123');
        await page.getByRole('button', { name: 'Change Password' }).click();
        await expect(page.getByText('Min 8 characters required')).toBeVisible();

        // Validate password change — wrong current password
        await page.getByLabel('Current Password').fill('wrongpass');
        await page.getByLabel('New Password').fill('newsecurepass123');
        await page.getByRole('button', { name: 'Change Password' }).click();
        await expect(
            page.getByText('Failed to change password. check current password.')
        ).toBeVisible();
    });
});
