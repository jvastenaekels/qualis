import { test, expect } from '../fixtures/db-setup';
import { checkAccessibility } from '../helpers/accessibility';
import { testDataBuilders } from '../fixtures/test-data';

test.describe('Accessibility Smoke Checks', () => {
    test.describe('Public Participant Pages', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `a11y-test-${Date.now()}`,
                    // User default statements (23) and grid (23) to avoid capacity mismatch
                    state: 'active',
                })
            );
            studySlug = study.slug;
        });

        test('Welcome Page should be accessible', async ({ page }) => {
            await page.goto(`/study/${studySlug}`);
            // Wait for content
            await expect(page.getByRole('button', { name: /Get Started/i })).toBeVisible();

            await checkAccessibility(page, 'Welcome Page');
        });

        test('Consent Modal should be accessible', async ({ page }) => {
            await page.goto(`/study/${studySlug}`);
            await page.getByRole('button', { name: /Get Started/i }).click();
            await expect(page.locator('text=Informed Consent')).toBeVisible();

            await checkAccessibility(page, 'Consent Modal');
        });
    });

    test.describe('Admin Dashboard', () => {
        test('Admin Overview should be accessible', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);
            // Wait for dashboard
            await expect(page.locator('h1')).toContainText('Workspace dashboard');

            await checkAccessibility(page, 'Admin Overview');
        });
    });
});
