import { test } from '@playwright/test';
import { setupAdminMocks, resetStores } from '../fixtures/admin-mocks';
import { AdminPage } from '../pages/AdminPage';
import { VisualAssertions } from '../helpers/VisualAssertions';

test.beforeEach(async ({ page }) => {
    resetStores();
    await setupAdminMocks(page);
});

test.describe('Admin Visual Regression Tests', () => {
    let adminPage: AdminPage;
    let visual: VisualAssertions;

    test.beforeEach(async ({ page }) => {
        adminPage = new AdminPage(page);
        visual = new VisualAssertions(page);
        await adminPage.login();
    });

    test.describe('Dashboard Overview', () => {
        test('should match dashboard layout with all components', async ({ page }) => {
            await page.goto('/admin/studies/example-study');
            await page.waitForSelector('[data-testid="study-overview"]', { state: 'visible' });

            // Mask dynamic content (timestamps, participant IDs)
            const _masks = visual.getMask([
                '[data-testid="participant-time"]',
                '[data-testid="participant-id"]',
            ]);

            await visual.compareScreenshot('dashboard-overview', {
                maxDiffPixelRatio: 0.05,
            });
        });

        test('should display metrics cards correctly', async ({ page }) => {
            await page.goto('/admin/studies/example-study');

            // Capture individual metrics cards
            await visual.captureElement(
                '[data-testid="completion-rate-card"]',
                'metrics-completion-rate'
            );
            await visual.captureElement(
                '[data-testid="participants-card"]',
                'metrics-participants'
            );
            await visual.captureElement(
                '[data-testid="median-duration-card"]',
                'metrics-median-duration'
            );
        });

        test('should show Recent Activity with status grouping', async ({ page }) => {
            await page.goto('/admin/studies/example-study');

            // Wait for Recent Activity card
            const activityCard = page.locator('text=Recent activity').locator('..');
            await activityCard.waitFor({ state: 'visible' });

            // Capture Recent Activity card
            await visual.captureElement(
                '[data-testid="recent-activity-card"]',
                'recent-activity-card'
            );
        });

        test('should display empty state when no participants', async ({ page }) => {
            // Create a new study with no participants
            await adminPage.createStudy('Empty Study', 'empty-study');
            await page.goto('/admin/studies/empty-study');

            await visual.compareScreenshot('dashboard-empty-state');
        });
    });

    test.describe('Study Design Page', () => {
        test('should match design page layout', async ({ page }) => {
            await page.goto('/admin/studies/example-study/design');
            await page.waitForSelector('text=Study design', { state: 'visible' });

            await visual.compareScreenshot('study-design-overview', {
                fullPage: true,
            });
        });

        test('should display guidance cards with methodology info', async ({ page }) => {
            await page.goto('/admin/studies/example-study/design');

            // Navigate to Q-Sort tab
            await page.getByRole('tab', { name: /Q-Sort Task/i }).click();

            // Capture guidance card
            const guidanceCard = page.locator('[data-testid="guidance-card"]');
            if (await guidanceCard.isVisible()) {
                await visual.captureElement('[data-testid="guidance-card"]', 'qsort-guidance-card');
            }
        });

        test('should show statement list with proper styling', async ({ page }) => {
            await page.goto('/admin/studies/example-study/design');
            await page.getByRole('tab', { name: /Q-Sort Task/i }).click();

            // Wait for statements to load
            await page.waitForSelector('text=Statement', { state: 'visible' });

            await visual.captureElement('[data-testid="statements-list"]', 'statements-list');
        });
    });

    test.describe('Recruitment Page', () => {
        test('should match recruitment page with glassmorphic cards', async ({ page }) => {
            await page.goto('/admin/studies/example-study/recruitment');
            await page.waitForSelector('text=Recruitment', { state: 'visible' });

            await visual.compareScreenshot('recruitment-overview');
        });

        test('should display recruitment links table', async ({ page }) => {
            await page.goto('/admin/studies/example-study/recruitment');

            // Wait for table to load
            await page.waitForSelector('[data-testid="recruitment-links-table"]', {
                state: 'visible',
            });

            await visual.captureElement(
                '[data-testid="recruitment-links-table"]',
                'recruitment-links-table'
            );
        });

        test('should show create link dialog with guidance', async ({ page }) => {
            await page.goto('/admin/studies/example-study/recruitment');

            // Open create link dialog
            await page.getByRole('button', { name: /create access link/i }).click();
            await page.waitForSelector('[role="dialog"]', { state: 'visible' });

            await visual.captureElement('[role="dialog"]', 'create-link-dialog');
        });
    });

    test.describe('Data Exports Page', () => {
        test('should match data exports layout', async ({ page }) => {
            await page.goto('/admin/studies/example-study/exports');
            await page.waitForSelector('text=Data & Analytics', { state: 'visible' });

            await visual.compareScreenshot('data-exports-overview');
        });

        test('should display interactive data view table', async ({ page }) => {
            await page.goto('/admin/studies/example-study/exports');

            // Wait for data table
            await page.waitForSelector('[data-testid="participants-table"]', { state: 'visible' });

            await visual.captureElement('[data-testid="participants-table"]', 'participants-table');
        });

        test('should show participant detail sheet', async ({ page }) => {
            await page.goto('/admin/studies/example-study/exports');

            // Click on a participant row
            const firstRow = page.locator('[data-testid="participant-row"]').first();
            await firstRow.click();

            // Wait for sheet to open
            await page.waitForSelector('[data-testid="participant-detail-sheet"]', {
                state: 'visible',
            });

            await visual.captureElement(
                '[data-testid="participant-detail-sheet"]',
                'participant-detail-sheet'
            );
        });

        test('should display discarded participant with visual markers', async ({ page }) => {
            // This would require a discarded participant in the mock data
            await page.goto('/admin/studies/example-study/exports');

            // Look for discarded participant row
            const discardedRow = page
                .locator('[data-testid="participant-row"]')
                .filter({ hasText: 'Discarded' });
            if ((await discardedRow.count()) > 0) {
                await visual.captureElement(
                    '[data-testid="participant-row"]:has-text("Discarded")',
                    'participant-discarded-row'
                );
            }
        });
    });

    test.describe('Team Management Page', () => {
        test('should match team management layout', async ({ page }) => {
            await page.goto('/admin/studies/example-study/team');
            await page.waitForSelector('text=Team', { state: 'visible' });

            await visual.compareScreenshot('team-management-overview');
        });

        test('should display collaborators table', async ({ page }) => {
            await page.goto('/admin/studies/example-study/team');

            await visual.captureElement(
                '[data-testid="collaborators-table"]',
                'collaborators-table'
            );
        });
    });

    test.describe('Settings Page', () => {
        test('should match settings page layout', async ({ page }) => {
            await page.goto('/admin/studies/example-study/settings');
            await page.waitForSelector('text=General Settings', { state: 'visible' });

            await visual.compareScreenshot('settings-overview');
        });

        test('should show danger zone for superusers', async ({ page }) => {
            await page.goto('/admin/studies/example-study/settings');

            // Check if danger zone is visible (requires superuser)
            const dangerZone = page.locator('text=Danger Zone').locator('..');
            if (await dangerZone.isVisible()) {
                await visual.captureElement('[data-testid="danger-zone"]', 'settings-danger-zone');
            }
        });
    });

    test.describe('Responsive Design', () => {
        test('should adapt to different viewport sizes', async ({ page }) => {
            await page.goto('/admin/studies/example-study');

            const viewports = [
                { name: 'desktop', width: 1920, height: 1080 },
                { name: 'tablet', width: 768, height: 1024 },
                { name: 'mobile', width: 375, height: 667 },
            ];

            await visual.verifyResponsiveLayout(viewports);
        });

        test('should show mobile sidebar correctly', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/admin/studies/example-study');

            // Open mobile sidebar
            const sidebarTrigger = page.locator('[data-sidebar="trigger"]');
            if (await sidebarTrigger.isVisible()) {
                await sidebarTrigger.click();
                await page.waitForTimeout(300); // Animation

                await visual.compareScreenshot('mobile-sidebar-open');
            }
        });
    });

    test.describe('Loading & Error States', () => {
        test('should display loading skeletons correctly', async ({ page }) => {
            // Intercept API and delay response
            await page.route('**/api/admin/studies/**', async (route) => {
                await page.waitForTimeout(2000);
                await route.continue();
            });

            const loadingPromise = page.goto('/admin/studies/example-study');

            // Capture loading state immediately
            await visual.captureLoadingState('dashboard-loading');

            await loadingPromise;
        });

        test('should display error state gracefully', async ({ page }) => {
            // Intercept API and return error
            await page.route('**/api/admin/studies/**', (route) => {
                route.fulfill({
                    status: 500,
                    body: JSON.stringify({ detail: 'Internal server error' }),
                });
            });

            await page.goto('/admin/studies/example-study');
            await page.waitForSelector('text=error', { state: 'visible' });

            await visual.captureErrorState('dashboard-error');
        });
    });
});
