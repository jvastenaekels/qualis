import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './rules';

test.describe('Public page accessibility', () => {
    test('landing page has no public Axe smoke violations', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByAltText('Qualis')).toBeVisible();
        await expect(page.locator('#study-code')).toBeVisible();
        await expect(page.getByRole('button')).toBeVisible();

        await expectNoA11yViolations(page);
    });

    test('login page has no public Axe smoke violations', async ({ page }) => {
        await page.goto('/login');

        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
        await expect(page.getByRole('button')).toBeVisible();
        await expect(page.locator('main > div.w-full')).toHaveCSS('opacity', '1');
        await page.locator('#email').fill('researcher@example.com');
        await page.locator('#password').fill('correct horse battery staple');

        await expectNoA11yViolations(page);
    });
});
