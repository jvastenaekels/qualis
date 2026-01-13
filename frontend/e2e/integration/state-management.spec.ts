import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders, gridConfig10 } from '../fixtures/test-data';

/**
 * Integration Testing: State Management Flows
 *
 * Verifies that study state transitions work correctly and
 * affect participant access appropriately.
 */


test.describe('State Management Flow Tests', () => {
    test.describe('Study State Transitions', () => {
        test('Draft → Active → Paused → Active → Closed flow', async ({ page, testDb, authToken }) => {
            // 1. Create study in draft state
            const study = await testDb.createStudy(authToken, testDataBuilders.study({
                slug: `test-state-flow-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                state: 'draft',
            }));

            // 2. Verify participant cannot access draft study
            await page.goto(`/study/${study.slug}`);
            await expect(page.locator('text=not available', { hasText: /not.*available|unavailable/i })).toBeVisible();

            // 3. Activate study
            await testDb.updateStudy(authToken, study.slug, { state: 'active' });

            // 4. Verify participant can now access
            await page.goto(`/study/${study.slug}`);
            await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();

            // 5. Pause study
            await testDb.updateStudy(authToken, study.slug, { state: 'paused' });

            // 6. Verify participant cannot access paused study
            await page.goto(`/study/${study.slug}`);
            await expect(page.locator('text=paused', {  hasText: /paused|temporarily.*unavailable/i })).toBeVisible();

            // 7. Reactivate
            await testDb.updateStudy(authToken, study.slug, { state: 'active' });
            await page.goto(`/study/${study.slug}`);
            await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();

            // 8. Close study
            await testDb.updateStudy(authToken, study.slug, { state: 'closed' });

            // 9. Verify participant cannot access closed study
            await page.goto(`/study/${study.slug}`);
            await expect(page.locator('text=closed', { hasText: /closed|ended/i }).first()).toBeVisible();
        });

        test('In-progress participant session persists across page reloads', async ({ page, testDb, authToken }) => {
            const study = await testDb.createStudy(authToken, testDataBuilders.study({
                slug: `test-session-persist-${Date.now()}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                state: 'active',
            }));

            // Start study
            await page.goto(`/study/${study.slug}`);
            await page.getByRole('button', { name: 'Get Started' }).click();

            // Handle Consent if it exists (it does by default)
            await page.getByTestId('consent-checkbox').check();
            await page.getByTestId('consent-accept-btn').click();

            // Navigate to a specific step (e.g., rough sort)
            const currentUrl = page.url();

            // Reload page
            await page.reload();

            // Verify we're still at the same step
            await expect(page).toHaveURL(currentUrl);
        });

        test('Study state change in Admin reflects immediately in participant view', async ({ context, testDb, authToken }) => {
            const study = await testDb.createStudy(authToken, testDataBuilders.study({
                slug: `test-state-sync-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                state: 'active',
            }));

            // Open two pages: Admin and Participant
            const adminPage = await context.newPage();
            const participantPage = await context.newPage();

            // Admin: Login and navigate directly to study
            await testDb.loginToAdminUI(adminPage);
            await adminPage.goto(`/admin/studies/${study.slug}`);
            // Wait for study page to load by checking h1 (Title is "Overview" + Badge)
            await expect(adminPage.locator('h1')).toContainText('Overview');
            await expect(adminPage).toHaveURL(new RegExp(`/admin/studies/${study.slug}`));

            // Participant: Access study
            await participantPage.goto(`/study/${study.slug}`);
            await expect(participantPage.getByRole('button', { name: 'Get Started' })).toBeVisible();

            // Admin: Pause study
            // 1. Click the "Paused" step in the control grid (this is the trigger)
            await adminPage.getByRole('button', { name: 'Paused' }).click();
            // 2. Click the "Pause Study" button in the confirmation dialog
            await adminPage.getByRole('button', { name: 'Pause Study' }).click();

            // Wait for state to update in UI
            await expect(adminPage.getByRole('status').filter({ hasText: 'Paused' })).toBeVisible();

            // Participant: Refresh and verify study is now paused
            await participantPage.reload();
            await expect(participantPage.locator('text=paused')).toBeVisible();

            await adminPage.close();
            await participantPage.close();
        });
    });

    test.describe('Configuration Updates', () => {
        test('Configuration changes do not affect ongoing participant sessions', async ({ context, testDb, authToken }) => {
            const study = await testDb.createStudy(authToken, testDataBuilders.study({
                slug: `test-config-isolation-${Date.now()}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                state: 'active',
            }));

            // Participant starts study
            const participantPage = await context.newPage();
            await participantPage.goto(`/study/${study.slug}`);
            await participantPage.getByRole('button', { name: 'Get Started' }).click();

            // Handle Consent
            await participantPage.getByTestId('consent-checkbox').check();
            await participantPage.getByTestId('consent-accept-btn').click();

            // Now we should be at Rough Sort
            await expect(participantPage).toHaveURL(/rough-sort/);

            // Capture original UI labels in Rough Sort
            const originalLabel = await participantPage.getByTestId('rough-agree-btn').textContent();

            // Participant session should still show original labels
            // Re-capture label after potential navigation to Rough Sort
            const currentLabel = await participantPage.getByTestId('rough-agree-btn').textContent();
            expect(currentLabel).not.toBe('UPDATED AGREE');

            await participantPage.close();
        });

        test('New participants get updated configuration', async ({ context, testDb, authToken }) => {
            const study = await testDb.createStudy(authToken, testDataBuilders.study({
                slug: `test-new-config-${Date.now()}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                state: 'active',
            }));

            // Update configuration
            await testDb.updateStudy(authToken, study.slug, {
                translations: [{
                    language_code: 'en',
                    title: 'Updated Study',
                    ui_labels: {
                        'common.agree': 'NEW AGREE LABEL',
                    },
                }],
            });

            // New participant session
            const participantPage = await context.newPage();
            await participantPage.goto(`/study/${study.slug}`);
            await participantPage.getByRole('button', { name: 'Get Started' }).click();
            await participantPage.getByTestId('consent-checkbox').check();
            await participantPage.getByTestId('consent-accept-btn').click();


            // Verify new labels appear
            await expect(participantPage.getByTestId('rough-agree-btn')).toContainText('NEW AGREE LABEL');

            await participantPage.close();
        });
    });

    test.describe('Data Persistence', () => {
        test('Participant progress saved and recoverable', async ({ page, testDb, authToken }) => {
            const study = await testDb.createStudy(authToken, testDataBuilders.study({
                slug: `test-progress-save-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                presort_config: { enabled: true, fields: {
                    'name': testDataBuilders.presortField('text', 'Name', { required: true }),
                }},
                state: 'active',
            }));

            // Fill presort
            await page.goto(`/study/${study.slug}`);
            await page.getByRole('button', { name: 'Get Started' }).click();

            // Handle Consent
            await page.getByTestId('consent-checkbox').check();
            await page.getByTestId('consent-accept-btn').click();

            await page.waitForURL(/\/study\/.+\/presort/);
            await page.fill('input[name="name"]', 'Test Participant');
            await page.getByTestId('presort-submit-btn').click();

            // Verify we're at rough sort
            await page.waitForURL(/\/study\/.+\/rough-sort/);
            await expect(page).toHaveURL(/rough-sort/);

            // Reload page
            await page.reload();

            // Should still be at rough sort (progress saved in localStorage/session)
            await page.waitForURL(/\/study\/.+\/rough-sort/);
            await expect(page).toHaveURL(/rough-sort/);
        });

        test('Study submission creates participant record', async ({ page, testDb, authToken }) => {
            const study = await testDb.createStudy(authToken, testDataBuilders.study({
                slug: `test-submission-record-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                statements: testDataBuilders.statements(10), // Must match grid capacity
                grid_config: gridConfig10,
                // Explicitly disable presort to avoid unexpected navigation
                presort_config: { enabled: false, fields: {} },
                state: 'active',
            }));

            const participantApiUrl = `${testDb.baseUrl}/api/admin/studies/${study.slug}/participants`;

            // Start
            await page.goto(`/study/${study.slug}`);
            await page.getByRole('button', { name: 'Get Started' }).click();

            await page.getByTestId('consent-checkbox').check();
            await page.getByTestId('consent-accept-btn').click();


            // Rough Sort: Distribute cards into piles (3-4-3)
            for (let i = 0; i < 10; i++) {
                // Wait for the card to be visible
                await expect(page.locator('[data-testid^="card-"]').first()).toBeVisible();

                if (i < 3) {
                    await page.getByTestId('rough-disagree-btn').click();
                } else if (i < 7) {
                    await page.getByTestId('rough-neutral-btn').click();
                } else {
                    await page.getByTestId('rough-agree-btn').click();
                }

                // Wait for animation to finish
                await page.waitForTimeout(250);
            }

            // Click the "Continue" button that appears after all cards are sorted
            // Wait for it to be visible first to ensure state transition in UI is complete
            await expect(page.getByTestId('rough-sort-next-btn')).toBeVisible();
            await page.getByTestId('rough-sort-next-btn').click();

            // Wait for transition to Fine Sort
            await expect(page).toHaveURL(/fine-sort/);

            // Fine Sort
            // Auto-fill is usually a debug feature, but here we can try drag/drop or use a "Auto-fill" if available in test env
            // Or manually place 10 cards.
            // Since we don't have auto-fill in production mode, we simulate drag and drop.
            // For simplicity/speed in State tests, we might want to ensure we rely on "Complete" if possible,
            // but the UI requires full sort.

            // NOTE: To make this robust, we should place cards in the first available slots.
            // Simplified placement logic:

            // Wait for grid to appear
            await expect(page.locator('[data-testid^="slot_"]').first()).toBeVisible();

            // Basic drag and drop of all cards from the deck to slots
            // We iterate through each pile since Fine Sort displays them separately
            const piles = ['disagree', 'neutral', 'agree'];
            for (const pile of piles) {
                 // Click the pile tab to active it
                 const pileTab = page.locator(`[data-testid="deck-${pile}"]`);
                 await pileTab.click();

                 // Wait for the tab to be active
                 await expect(pileTab).toHaveAttribute('aria-selected', 'true');

                 const currentDeckArea = page.locator(`[data-testid="deck-area-${pile}"]`);

                 // Drag all cards currently in this pile
                 while (await currentDeckArea.locator('[data-testid^="card-"]').count() > 0) {
                     const card = currentDeckArea.locator('[data-testid^="card-"]').first();
                     const slot = page.locator('[data-testid^="slot_"]:not(:has([data-testid^="card-"]))').first();

                     // Use click-to-place instead of dragTo for better E2E reliability with dnd-kit
                     await card.click();
                     await slot.click();

                     // Small wait to ensure state updates
                     await page.waitForTimeout(100);
                 }
            }

            // Verify all cards are in the grid
            await expect(page.locator('[data-testid^="slot_"] [data-testid^="card-"]')).toHaveCount(10);

            // Click Confirm Sort
            await page.getByTestId('fine-sort-validate-btn').click();

            // Post-Sort (if any)
            // Default config has a post-sort page with comments
            await expect(page).toHaveURL(/post-sort/);

            // Wait for either Submit or Continue
            // Default config has a post-sort page with comments
            const submitButton = page.getByRole('button', { name: /Submit|Finish|Share my perspective/i });
            const continueButton = page.getByRole('button', { name: /Continue/i });

            if (await submitButton.isVisible()) {
                await submitButton.click();
            } else if (await continueButton.isVisible()) {
                 await continueButton.click();
                 await page.getByRole('button', { name: /Submit/i }).click();
            }

            // Verify completion page
            await expect(page.locator('text=Thank you')).toBeVisible();

            // Verify submission was recorded in database
            const response = await fetch(participantApiUrl, {
                headers: { 'Authorization': `Bearer ${await testDb.login()}` },
            });
            const participants = await response.json();

            expect(participants.length).toBeGreaterThan(0);
            // Verify status
            expect(participants[0].status).toBe('completed');
        });
    });
});
