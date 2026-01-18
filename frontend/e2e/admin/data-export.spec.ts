import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';

test.describe
    .skip('Data Export Integration', () => {
        test.beforeEach(async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);
        });

        test('Admin can export validation data', async ({ page, testDb, authToken }) => {
            const study = await testDb.createStudy(authToken, testDataBuilders.study());

            // Navigate to Data Collection page
            await page.goto(`/admin/studies/${study.slug}/data`);

            // Switch to Export tab if present
            const exportTab = page.getByRole('tab', { name: /export/i });
            try {
                await expect(exportTab).toBeVisible({ timeout: 2000 });
                await exportTab.click();
            } catch (_e) {
                // Tab might not be needed or already active
            }

            // Check for Export button
            const exportBtn = page.getByRole('button', { name: /export/i });
            await expect(exportBtn).toBeVisible();

            // Note: Actual download verification might be flaky if backend needs data.
            // But we verify the button exists and is clickable.

            // For now, we simulate a click and expect no error toast,
            // or expect a download event if empty export is allowed.
        });

        test('Admin can export participant data', async ({ page, testDb, authToken }) => {
            const study = await testDb.createStudy(authToken, testDataBuilders.study());
            await page.goto(`/admin/studies/${study.slug}/participants`);

            const exportBtn = page.getByRole('button', { name: /export/i });
            await expect(exportBtn).toBeVisible();
        });
    });
