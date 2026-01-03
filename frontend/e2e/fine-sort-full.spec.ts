
import { test, expect } from '@playwright/test';
import { mockStudyAPI, mockSubmitAPI, mockStudyConfig } from './fixtures/study-config';

test.describe('Fine Sort Comprehensive UX & Layout', () => {
    test.beforeEach(async ({ page }) => {
        // Setup mocked API for consistent test behavior
        await mockStudyAPI(page);
        await mockSubmitAPI(page);
    });

    test('should verify all critical UI elements and interactions', async ({ page }) => {
        // --- SETUP ---
        await test.step('Navigate to Fine Sort', async () => {
            await page.goto(`/study/${mockStudyConfig.slug}`);

            // Wait for loading to finish
            await page.locator('[data-testid="loading-spinner"]').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

            // Select button by test-id
            const startBtn = page.getByTestId('start-btn');
            await expect(startBtn.first()).toBeVisible({ timeout: 30000 });
            await startBtn.first().click();

            // Consent Page
            await page.locator('[data-testid="loading-spinner"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
            const acceptBtn = page.getByRole('button', { name: /accept|accepter|agree|d'accord/i });
            await expect(acceptBtn.first()).toBeVisible({ timeout: 30000 });
            await acceptBtn.first().click();

            // Fast-forward through Rough Sort if needed
            // Try to jump to fine sort if URL manipulation works, otherwise speed-click
            // Knowing the app, we might need to "Click Agree" on all rough sort cards
            // Wait for redirect to rough sort
            try {
                await page.waitForURL(/.*rough-sort/, { timeout: 3000 });
                // Quick rough sort
                const cards = page.locator('[data-testid^="card-stack-item-"]');
                while (await cards.count() > 0 && await cards.first().isVisible()) {
                    await page.getByRole('button', { name: /agree|d'accord/i }).click();
                    await page.waitForTimeout(20); // minimal throttle
                }
                await page.getByRole('button', { name: /continue|continuer/i }).click();
            } catch (e) {
                // Already at fine sort or skipped?
                console.log('Skipped rough sort or already passed');
            }

            await expect(page).toHaveURL(/.*fine-sort/);
        });

        // --- SECTION 1: VISIBILITY & LAYOUT CHECKS ---
        await test.step('Verify Critical Layout Elements', async () => {
            // Spectrum Labels (Bottom bar)
            await expect(page.getByText(/DISAGREE|DÉSACCORD/i).first()).toBeVisible();
            await expect(page.getByText(/AGREE|ACCORD/i).last()).toBeVisible();

            // Zoom Controls (Top Right)
            await expect(page.locator('button[aria-label*="zoom"]')).toHaveCount(2); // In/Out

            // Pile Selectors (should see tabs)
            const pileTabs = page.getByRole('tab');
            await expect(pileTabs).toHaveCount(3);
            await expect(page.getByRole('tab', { selected: true })).toBeVisible(); // One should be active
        });

        // --- SECTION 2: FOOTER INTERACTIONS ---
        await test.step('Verify Footer Interactions', async () => {
            // A. Initial State: "Drag or Tap"
            const footerInstruction = page.locator('text=/Drag|Glissez|Tap|Appuyez/');
            await expect(footerInstruction).toBeVisible();
            await expect(footerInstruction).toBeInViewport();

            // Fixed Position Check (Basic): Bounding box should be at bottom of viewport
            const footerBox = await footerInstruction.boundingBox();
            const viewport = page.viewportSize();
            if (footerBox && viewport) {
                expect(footerBox.y + footerBox.height).toBeGreaterThan(viewport.height - 100); // Near bottom
            }

            // B. Selection State: Click a card -> Footer changes
            const deckCard = page.locator('[data-testid="deck-cards-container"] [data-testid^="card-"]').first();
            await deckCard.click();

            // Footer text should change to "Place on grid"
            const placeInstruction = page.locator('text=/Place|Placez/');
            await expect(placeInstruction).toBeVisible();

            // Deselect (Click bg or same card) - Optional, but good to test toggle
            // For now, assume drag continues
        });

        // --- SECTION 3: DECK & DRAG ---
        await test.step('Verify Deck & Drag Functionality', async () => {
            const deckCard = page.locator('[data-testid="deck-cards-container"] [data-testid^="card-"]').first();
            const targetSlot = page.locator('[data-testid="droppable-slot"]').first();

            const initialDeckCount = await page.locator('[data-testid="deck-cards-container"] [data-testid^="card-"]').count();

            // Drag
            await deckCard.dragTo(targetSlot);

            // Verify Logic
            // 1. Deck count decreases
            await expect(page.locator('[data-testid="deck-cards-container"] [data-testid^="card-"]')).toHaveCount(initialDeckCount - 1);
            // 2. Slot is filled (contains card)
            await expect(targetSlot.locator('[data-testid^="card-"]')).toBeVisible();
        });

        // --- SECTION 4: PILE SWITCHING & EMPTY STATE ---
        await test.step('Verify Pile Switching', async () => {
            // Switch to separate pile (e.g. Agree)
            const agreeTab = page.getByRole('tab').nth(2); // 0=Disagree, 1=Neutral, 2=Agree
            await agreeTab.click();

            // Verify Deck Updated (different cards or just deck visible)
            await expect(page.getByTestId('deck-cards-container')).toBeVisible();

            // Verify Active State of Tab
            await expect(agreeTab).toHaveAttribute('aria-selected', 'true');
        });

        await test.step('Verify Empty State (Simulation)', async () => {
            // It's hard to empty a deck in E2E without robust mocking,
            // but we can check if the "Success Checkmark" is NOT visible when cards exist.
            const successIcon = page.locator('.lucide-check-circle, .lucide-check');
            // The success message shouldn't be main view if cards exist
            // This is a "Negative Assertion" to ensure we don't show empty state prematurely.
            // But we can check if we can FIND the success message locator hidden or absent
            const emptyMessage = page.getByText(/All placed|Toutes les affirmations/i);
            if (await page.locator('[data-testid="deck-cards-container"] [data-testid^="card-"]').count() > 0) {
                 await expect(emptyMessage).not.toBeVisible();
            }
        });
    });
});
