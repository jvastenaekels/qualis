import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Structure and contrast. `color-contrast` computes real ratios, which is what the
 * static gate (`npm run lint:a11y`) cannot do — it only bans one literal class.
 */
const STRUCTURE_RULES = [
    'color-contrast',
    'heading-order',
    'landmark-no-duplicate-main',
    'landmark-one-main',
    'page-has-heading-one',
    'region',
];

/**
 * Accessible names, computed from the rendered DOM.
 *
 * This is the half of the accessible-name problem no static checker reaches: axe sees
 * through Radix `asChild`, resolves `<SelectValue>` to the text actually rendered,
 * honours the `title` fallback, and respects `display:none` — so a name that only
 * exists above the `sm` breakpoint fails here and nowhere else.
 *
 * Admin pages are not covered yet: they still carry the backlog measured by task 6.7a
 * (see scripts/a11y-baseline.json). Extending these rules to the admin is task 6.7e,
 * once 6.7b–d have cleared it.
 */
const NAME_RULES = [
    'aria-command-name',
    'aria-input-field-name',
    'aria-toggle-field-name',
    'button-name',
    'image-alt',
    'input-button-name',
    'input-image-alt',
    'label',
    'link-name',
    'select-name',
];

const PUBLIC_PAGE_RULES = [...STRUCTURE_RULES, ...NAME_RULES];

async function expectNoPublicPageA11yViolations(page: Page) {
    const results = await new AxeBuilder({ page }).withRules(PUBLIC_PAGE_RULES).analyze();

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
