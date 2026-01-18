import { expect, test } from '@playwright/test';
import { mockStudyConfig } from './fixtures/study-config';

test.describe('Error Handling Scenarios', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to origin first to allow localStorage access
        await page.goto('/');

        // Clear any persisted state to ensure we test "fresh" error states
        await page.context().clearCookies();
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
    });

    test('should handle API rate limiting (429)', async ({ page }) => {
        // 1. Mock 429 Response
        await page.route(`**/api/study/${mockStudyConfig.slug}**`, async (route) => {
            await route.fulfill({
                status: 429,
                contentType: 'application/json',
                headers: {
                    'X-RateLimit-Reset': String(Date.now() + 60), // Reset in 60s
                },
                body: JSON.stringify({ detail: 'Too Many Requests' }),
            });
        });

        // 2. Visit the page
        await page.goto(`/study/${mockStudyConfig.slug}/welcome`);

        // 3. Verify UI
        // Should see specific title for 429
        await expect(
            page.getByRole('heading', {
                name: /Too Many Requests|Trop de requêtes/i,
            })
        ).toBeVisible();

        // Should see specific message
        await expect(
            page.getByText(/You are doing that too fast|Vous allez trop vite/i)
        ).toBeVisible();

        // Should see Retry button
        const retryButton = page.getByRole('button', { name: /Retry|Réessayer/i });
        await expect(retryButton).toBeVisible();
    });

    test('should handle network connection errors', async ({ page }) => {
        // 1. Mock Network Failure
        await page.route(`**/api/study/${mockStudyConfig.slug}**`, async (route) => {
            await route.abort('failed');
        });

        // 2. Visit the page
        await page.goto(`/study/${mockStudyConfig.slug}/welcome`);

        // 3. Verify UI
        // Should see Connection Lost title
        await expect(
            page.getByRole('heading', { name: /Connection Lost|Connexion perdue/i })
        ).toBeVisible();

        // Should see Retry button
        const retryButton = page.getByRole('button', { name: /Retry|Réessayer/i });
        await expect(retryButton).toBeVisible();
    });
});
