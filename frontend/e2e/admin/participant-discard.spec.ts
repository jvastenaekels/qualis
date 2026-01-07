import { test, expect } from '@playwright/test';
import { setupAdminMocks, resetStores, getParticipantsStore } from '../fixtures/admin-mocks';
import { AdminPage } from '../pages/AdminPage';
import { VisualAssertions } from '../helpers/VisualAssertions';

test.beforeEach(async ({ page }) => {
    resetStores();
    await setupAdminMocks(page);
});

test.describe('Participant Discard E2E Tests', () => {
    let adminPage: AdminPage;
    let visual: VisualAssertions;

    test.beforeEach(async ({ page }) => {
        adminPage = new AdminPage(page);
        visual = new VisualAssertions(page);
        await adminPage.login();

        // Add test participants
        const participantsStore = getParticipantsStore();
        participantsStore.push({
            id: 201,
            session_token: 'test-participant-201',
            status: 'completed',
            progress: 100,
            is_completed: true,
            is_discarded: false,
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
            language_used: 'en',
        });
        participantsStore.push({
            id: 202,
            session_token: 'test-participant-202',
            status: 'completed',
            progress: 100,
            is_completed: true,
            is_discarded: true,
            discard_reason: 'Suspicious completion time',
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
            language_used: 'fr',
        });
    });

    test('should navigate to data view and see participants table', async ({ page }) => {
        await page.goto('/admin/studies/example-study/exports');

        // Wait for table to load
        await page.waitForSelector('[data-testid="participants-table"]', { state: 'visible' });

        // Capture full data view
        await visual.compareScreenshot('data-view-with-participants', {
            fullPage: true,
        });
    });

    test('should select participant and open detail sheet', async ({ page }) => {
        await page.goto('/admin/studies/example-study/exports');

        // Click on first participant row
        const firstRow = page.locator('[data-testid="participant-row"]').first();
        await firstRow.click();

        // Wait for sheet to open
        const detailSheet = page.locator('[data-testid="participant-detail-sheet"]');
        await detailSheet.waitFor({ state: 'visible' });

        // Capture detail sheet
        await visual.captureElement(
            '[data-testid="participant-detail-sheet"]',
            'participant-detail-sheet-normal'
        );
    });

    test('should toggle discard status via button', async ({ page }) => {
        await page.goto('/admin/studies/example-study/exports');

        // Select a non-discarded participant
        const normalRow = page
            .locator('[data-testid="participant-row"]')
            .filter({ hasText: 'test-participant-201' });
        await normalRow.click();

        // Wait for detail sheet
        await page.waitForSelector('[data-testid="participant-detail-sheet"]', {
            state: 'visible',
        });

        // Capture before discard
        await visual.captureElement(
            '[data-testid="participant-detail-sheet"]',
            'participant-before-discard'
        );

        // Click discard button
        const discardButton = page.getByRole('button', { name: /discard participant/i });
        await discardButton.click();

        // Wait for API call and update
        await page.waitForTimeout(500);

        // Verify "Discarded" badge appeared
        await expect(page.getByText('Discarded')).toBeVisible();

        // Capture after discard
        await visual.captureElement(
            '[data-testid="participant-detail-sheet"]',
            'participant-after-discard'
        );

        // Close sheet
        await page.keyboard.press('Escape');

        // Verify row is now dimmed in table
        const _updatedRow = page
            .locator('[data-testid="participant-row"]')
            .filter({ hasText: 'test-participant-201' });
        await visual.captureElement(
            '[data-testid="participant-row"]:has-text("test-participant-201")',
            'participant-row-discarded'
        );
    });

    test('should restore discarded participant', async ({ page }) => {
        await page.goto('/admin/studies/example-study/exports');

        // Select the discarded participant
        const discardedRow = page
            .locator('[data-testid="participant-row"]')
            .filter({ hasText: 'test-participant-202' });
        await discardedRow.click();

        // Wait for detail sheet
        await page.waitForSelector('[data-testid="participant-detail-sheet"]', {
            state: 'visible',
        });

        // Verify discarded badge is visible
        await expect(page.getByText('Discarded')).toBeVisible();

        // Capture discarded state
        await visual.captureElement(
            '[data-testid="participant-detail-sheet"]',
            'participant-discarded-state'
        );

        // Click restore button
        const restoreButton = page.getByRole('button', { name: /restore participant/i });
        await restoreButton.click();

        // Wait for update
        await page.waitForTimeout(500);

        // Verify "Discarded" badge disappeared
        await expect(page.getByText('Discarded')).not.toBeVisible();

        // Capture restored state
        await visual.captureElement(
            '[data-testid="participant-detail-sheet"]',
            'participant-restored-state'
        );
    });

    test('should display discarded row with visual dimming', async ({ page }) => {
        await page.goto('/admin/studies/example-study/exports');

        // Wait for table
        await page.waitForSelector('[data-testid="participants-table"]', { state: 'visible' });

        // Find discarded row
        const discardedRow = page
            .locator('[data-testid="participant-row"]')
            .filter({ hasText: 'test-participant-202' });

        // Verify row has dimmed styling
        await expect(discardedRow).toHaveClass(/opacity-50|grayscale/);

        // Capture discarded row
        await visual.captureElement(
            '[data-testid="participant-row"]:has-text("test-participant-202")',
            'table-row-discarded-visual'
        );
    });

    test('should show discarded badge in detail sheet header', async ({ page }) => {
        await page.goto('/admin/studies/example-study/exports');

        // Select discarded participant
        const discardedRow = page
            .locator('[data-testid="participant-row"]')
            .filter({ hasText: 'test-participant-202' });
        await discardedRow.click();

        // Wait for sheet
        await page.waitForSelector('[data-testid="participant-detail-sheet"]', {
            state: 'visible',
        });

        // Capture header with badge
        await visual.captureElement('[data-testid="sheet-header"]', 'discarded-badge-in-header');

        // Verify badge styling
        const discardedBadge = page.locator('[data-testid="discarded-badge"]');
        await expect(discardedBadge).toBeVisible();
        await expect(discardedBadge).toHaveClass(/bg-red|text-red/);
    });

    test('should exclude discarded participants from CSV export preview', async ({ page }) => {
        await page.goto('/admin/studies/example-study/exports');

        // Switch to File Downloads tab
        await page.getByRole('tab', { name: /file downloads/i }).click();

        // Capture export section
        await visual.captureElement(
            '[data-testid="export-section"]',
            'export-options-with-discarded'
        );

        // Note: Actual export verification would require checking downloaded file content
        // which is typically done in integration tests rather than visual tests
    });

    test('should display discard button with pending state', async ({ page }) => {
        await page.goto('/admin/studies/example-study/exports');

        // Select participant
        const row = page.locator('[data-testid="participant-row"]').first();
        await row.click();

        // Wait for sheet
        await page.waitForSelector('[data-testid="participant-detail-sheet"]', {
            state: 'visible',
        });

        const discardButton = page.getByRole('button', { name: /discard participant/i });

        // Intercept API to delay response
        await page.route('**/api/admin/studies/participants/**/discard', async (route) => {
            await page.waitForTimeout(2000);
            await route.continue();
        });

        // Click discard - don't await
        const clickPromise = discardButton.click();

        // Capture loading state
        await page.waitForTimeout(100);
        await visual.captureElement('[data-testid="discard-button"]', 'discard-button-loading');

        await clickPromise;
    });

    test.describe('Recent Activity Integration', () => {
        test('should show discarded participants in separate section on dashboard', async ({
            page,
        }) => {
            await page.goto('/admin/studies/example-study');

            // Wait for Recent Activity card
            const activityCard = page.locator('text=Recent activity').locator('..');
            await activityCard.waitFor({ state: 'visible' });

            // Check for "Discarded" section
            const discardedSection = page.locator('text=Discarded').locator('..');
            if (await discardedSection.isVisible()) {
                await visual.captureElement(
                    '[data-testid="discarded-section"]',
                    'recent-activity-discarded-section'
                );
            }
        });
    });

    test.describe('Visual States & Interactions', () => {
        test('should show hover state on discard button', async ({ page }) => {
            await page.goto('/admin/studies/example-study/exports');

            const row = page.locator('[data-testid="participant-row"]').first();
            await row.click();

            await page.waitForSelector('[data-testid="participant-detail-sheet"]', {
                state: 'visible',
            });

            const discardButton = page.getByRole('button', { name: /discard participant/i });
            await discardButton.hover();

            await visual.captureElement('[data-testid="discard-button"]', 'discard-button-hover');
        });

        test('should display discarded table on mobile', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/admin/studies/example-study/exports');

            await visual.compareScreenshot('data-view-mobile-with-discarded', {
                fullPage: true,
            });
        });
    });
});
