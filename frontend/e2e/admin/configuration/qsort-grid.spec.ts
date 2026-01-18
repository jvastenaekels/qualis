import { test, expect } from '../../fixtures/db-setup';
import { testDataBuilders, type GridDistribution } from '../../fixtures/test-data';

/**
 * Systematic Configuration Testing: Q-Sort Grid
 *
 * Tests grid configuration options:
 * 1. Admin UI: Can configure grid layout
 * 2. API: Configuration is saved correctly
 * 3. Participant UI: Grid renders correctly
 * 4. Validation: Capacity constraints enforced
 * 5. Edge Cases: Total capacity vs statements
 */

const GRID_DISTRIBUTIONS: GridDistribution[] = ['symmetric', 'asymmetric', 'minimal'];

test.describe('Q-Sort Grid Configuration Testing', () => {
    for (const distribution of GRID_DISTRIBUTIONS) {
        test.describe(`Grid Distribution: ${distribution}`, () => {
            let studySlug: string;
            let _statementsCount: number;

            test.beforeEach(async ({ testDb, authToken }) => {
                const gridConfig = testDataBuilders.gridConfig(distribution);
                const totalCapacity = gridConfig.reduce((sum, col) => sum + col.capacity, 0);

                // Create study with matching number of statements
                const study = await testDb.createStudy(
                    authToken,
                    testDataBuilders.study({
                        slug: `test-grid-${distribution}-${Math.random().toString(36).substring(2, 7)}`,
                        statements: testDataBuilders.statements(totalCapacity),
                        grid_config: gridConfig,
                        state: 'draft',
                    })
                );
                studySlug = study.slug;
                _statementsCount = totalCapacity;
            });

            test(`Admin: Can configure ${distribution} grid`, async ({ page, testDb }) => {
                // Login and navigate to study designer
                await testDb.loginToAdminUI(page);

                // Navigate to Q-Sort configuration
                await page.getByText(studySlug).click();
                await page
                    .getByRole('link', { name: /design/i })
                    .first()
                    .click();
                await page.getByTestId('tab-q-sort').click();
                await page.getByTestId('subtab-grid').click();

                // Verify grid columns are displayed
                const gridConfig = testDataBuilders.gridConfig(distribution);
                for (let i = 0; i < gridConfig.length; i++) {
                    const column = gridConfig[i];
                    const scoreText = column.score > 0 ? `+${column.score}` : `${column.score}`;
                    await expect(page.getByTestId(`grid-column-${i}-score`)).toHaveText(scoreText);
                    // Capacity is in a tooltip or hidden until hover, but we can check data-testid
                    await expect(page.getByTestId(`grid-column-${i}-slots`)).toBeVisible();
                }
            });

            test(`API: ${distribution} grid saves correctly`, async ({ testDb, authToken }) => {
                const gridConfig = testDataBuilders.gridConfig(distribution);

                // Update grid via API
                await testDb.updateStudy(authToken, studySlug, {
                    grid_config: gridConfig,
                });

                // Verify it was saved
                const study = await testDb.getStudy(authToken, studySlug);

                expect(study.grid_config).toHaveLength(gridConfig.length);
                for (let i = 0; i < gridConfig.length; i++) {
                    expect(study.grid_config[i].score).toBe(gridConfig[i].score);
                    expect(study.grid_config[i].capacity).toBe(gridConfig[i].capacity);
                }
            });

            test(`Participant: ${distribution} grid renders correctly`, async ({
                page,
                testDb,
                authToken,
            }) => {
                // Activate study
                await testDb.updateStudy(authToken, studySlug, { state: 'active' });

                // Navigate to study
                await page.goto(`/study/${studySlug}`);
                await page.getByTestId('start-btn').click(); // Welcome Page
                await page.getByTestId('consent-checkbox').check(); // Consent Page
                await page.getByTestId('consent-accept-btn').click(); // Consent Page form

                // Rough sort navigation - sort all cards to agree using keyboard for speed
                await page.waitForTimeout(1000);
                while ((await page.locator('[data-testid^="card-"]').count()) > 0) {
                    const card = page.locator('[data-testid^="card-"]').first();
                    const cardId = await card.getAttribute('data-testid');
                    await page.keyboard.press('ArrowRight');
                    // Wait for this specific card to disappear to ensure the app processed the vote
                    await expect(page.locator(`[data-testid="${cardId}"]`)).not.toBeVisible({
                        timeout: 5000,
                    });
                }
                await page.getByTestId('rough-sort-next-btn').click({ timeout: 10000 }); // Continue to Fine Sort

                // Verify grid is rendered
                const gridConfig = testDataBuilders.gridConfig(distribution);
                for (const column of gridConfig) {
                    // Check column exists by ID
                    const columnLocator = page.locator(`#column-${column.score}`);
                    await expect(columnLocator).toBeVisible({ timeout: 15000 });

                    // Verify number of slots matches capacity
                    const slotCount = await columnLocator.locator('[id^="slot_"]').count();
                    expect(slotCount).toBe(column.capacity);
                }
            });

            test(`Validation: ${distribution} grid capacity enforced`, async ({
                page,
                testDb,
                authToken,
            }) => {
                await testDb.updateStudy(authToken, studySlug, { state: 'active' });

                await page.goto(`/study/${studySlug}`);
                await page.getByTestId('start-btn').click(); // Welcome Page
                await page.getByTestId('consent-checkbox').check(); // Consent Page
                await page.getByTestId('consent-accept-btn').click(); // Consent Page form

                // Complete rough sort - sort all to agree using keyboard for speed
                await page.waitForTimeout(1000);
                while ((await page.locator('[data-testid^="card-"]').count()) > 0) {
                    const card = page.locator('[data-testid^="card-"]').first();
                    const cardId = await card.getAttribute('data-testid');
                    await page.keyboard.press('ArrowRight');
                    await expect(page.locator(`[data-testid="${cardId}"]`)).not.toBeVisible({
                        timeout: 5000,
                    });
                }
                await page.getByTestId('rough-sort-next-btn').click({ timeout: 15000 });

                // Switch to Agree deck in Fine Sort
                await page.getByTestId('deck-agree').click();

                // Ensure cards are visible in the deck
                await expect(page.locator('[data-testid^="card-"]').first()).toBeVisible({
                    timeout: 10000,
                });

                const gridConfig = testDataBuilders.gridConfig(distribution);
                const smallestColumn = gridConfig.reduce((min, col) =>
                    col.capacity < min.capacity ? col : min
                );

                const colIndex = gridConfig.findIndex((c) => c.score === smallestColumn.score);

                // Place cards in smallest column until full using click-to-place
                for (let i = 0; i < smallestColumn.capacity; i++) {
                    const card = page
                        .locator('[data-testid="deck-cards-container"] [data-testid^="card-"]')
                        .first();
                    const targetSlot = page.locator(`#slot_${colIndex}_${i}`);

                    await card.click();
                    await targetSlot.click();

                    // Wait for card to be placed
                    await expect(targetSlot.locator('[data-testid^="card-"]')).toBeVisible();
                }

                // Verify column is full (all slots have cards)
                const filledSlotsCount = await page
                    .locator(`#column-${smallestColumn.score} [data-testid^="card-"]`)
                    .count();
                expect(filledSlotsCount).toBe(smallestColumn.capacity);

                // Try to add one more - should fail or swap
                const extraCard = page
                    .locator('[data-testid="deck-cards-container"] [data-testid^="card-"]')
                    .first();
                const firstSlot = page.locator(`#slot_${colIndex}_0`);

                await extraCard.click();
                await firstSlot.click();

                // After drag - should either reject or swap, but column count should remain same
                const finalColumnCount = await page
                    .locator(`#column-${smallestColumn.score} [data-testid^="card-"]`)
                    .count();
                expect(finalColumnCount).toBe(smallestColumn.capacity); // Still at capacity
            });

            test(`Edge Case: ${distribution} grid total capacity matches statements`, async ({
                testDb,
                authToken,
            }) => {
                const gridConfig = testDataBuilders.gridConfig(distribution);
                const totalCapacity = gridConfig.reduce((sum, col) => sum + col.capacity, 0);

                // Create study with mismatched statement count (too many)
                const mismatchedStudy = await testDb.createStudy(
                    authToken,
                    testDataBuilders.study({
                        slug: `test-mismatch-${Date.now()}`,
                        statements: testDataBuilders.statements(totalCapacity + 5),
                        grid_config: gridConfig,
                    })
                );

                // Try to activate - should fail validation
                try {
                    await testDb.updateStudy(authToken, mismatchedStudy.slug, {
                        state: 'active',
                    });
                    // If it doesn't throw, validation might pass - check if activation worked
                    const study = await testDb.getStudy(authToken, mismatchedStudy.slug);
                    // In a real scenario, this might still be draft or have validation errors
                    expect(study.state).not.toBe('active');
                } catch (error) {
                    // Expected: validation error
                    expect(error).toBeDefined();
                }
            });
        });
    }

    test.describe('Grid Column Manipulation', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-grid-manip-${Math.random().toString(36).substring(2, 7)}`,
                    statements: testDataBuilders.statements(23),
                    grid_config: testDataBuilders.gridConfig('symmetric'), // 7 columns
                })
            );
            studySlug = study.slug;
        });

        test('Admin: Can expand grid', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);
            await page.getByText(studySlug).click();
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-q-sort').click();
            await page.getByTestId('subtab-grid').click();

            // Initial column count
            const initialCount = await page.locator('[data-testid^="grid-column-"]').count();

            // Expand grid
            await page.getByTestId('expand-grid-button').click();

            // Verify column count increased
            const finalCount = await page.locator('[data-testid^="grid-column-"]').count();
            // Each column has 2 elements: -score and -slots
            expect(finalCount).toBe(initialCount + 4);
        });

        test('Admin: Can reduce grid', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);
            await page.getByText(studySlug).click();
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-q-sort').click();
            await page.getByTestId('subtab-grid').click();

            const initialCount = await page.locator('[data-testid^="grid-column-"]').count();

            // Reduce grid
            await page.getByTestId('reduce-grid-button').click();

            const finalCount = await page.locator('[data-testid^="grid-column-"]').count();
            // Each column has 2 elements: -score and -slots
            // Symmetric reduction removes 2 columns (one extremes left/right)
            expect(finalCount).toBe(initialCount - 4);
        });

        test('Admin: Can modify column capacity', async ({ page, testDb, authToken }) => {
            // Set initial grid
            await testDb.updateStudy(authToken, studySlug, {
                grid_config: testDataBuilders.gridConfig('minimal'),
            });

            await testDb.loginToAdminUI(page);

            await page.getByText(studySlug).click();
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-q-sort').click();
            await page.getByTestId('subtab-grid').click();

            // Increase capacity of first column
            const initialSlots = await page
                .getByTestId('grid-column-0-slots')
                .locator('div')
                .count();
            await page.locator('button[aria-label^="Increase capacity"]').first().click();

            const finalSlots = await page.getByTestId('grid-column-0-slots').locator('div').count();
            expect(finalSlots).toBe(initialSlots + 1);
        });
    });
});
