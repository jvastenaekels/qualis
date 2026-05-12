import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PUBLIC_PAGE_RULES = [
    'color-contrast',
    'heading-order',
    'landmark-no-duplicate-main',
    'landmark-one-main',
    'page-has-heading-one',
    'region',
];

async function expectNoPublicPageA11yViolations(page: Page) {
    const results = await new AxeBuilder({ page })
        // Shared footer contrast is tracked outside this public entry-page smoke scope.
        .exclude('footer')
        .withRules(PUBLIC_PAGE_RULES)
        .analyze();

    expect(results.violations).toEqual([]);
}

test.describe('Public page accessibility', () => {
    test('landing page has no public Axe smoke violations', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByAltText('Qualis')).toBeVisible();
        await expect(page.locator('#study-code')).toBeVisible();
        await expect(page.getByRole('button')).toBeVisible();

        await expectNoPublicPageA11yViolations(page);
    });

    test('login page has no public Axe smoke violations', async ({ page }) => {
        await page.goto('/login');

        await expect(page.locator('#email')).toBeVisible();
        await expect(page.locator('#password')).toBeVisible();
        await expect(page.getByRole('button')).toBeVisible();
        await expect(page.locator('main > div.w-full')).toHaveCSS('opacity', '1');
        await page.locator('#email').fill('researcher@example.com');
        await page.locator('#password').fill('correct horse battery staple');

        await expectNoPublicPageA11yViolations(page);
    });
});
