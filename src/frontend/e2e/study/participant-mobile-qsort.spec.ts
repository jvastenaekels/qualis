/**
 * E2E: Participant journey on a mobile viewport (375×667)
 *
 * Quality roadmap Phase 4 item C — spec 1/4.
 * Covers the full participant path from welcome through post-sort on a
 * narrow screen, verifying that the UI is usable at 375 px wide (iPhone SE
 * form-factor) and that a participant can complete a Q-sort without desktop-
 * specific interactions.
 *
 * Test 1: full happy-path (welcome → consent → rough-sort → fine-sort → thank-you)
 * Test 2: smoke — fine-sort workbench activates on tap
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';

// Mobile viewport for the whole file — matches the "Study Mobile" project
// defined in playwright.config.ts for study/mobile-ux.spec.ts, but we use
// an explicit override here so this file can also run under "Study E2E".
test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
});

// Skip on Firefox — mobile emulation is Chromium-only in Playwright
test.skip(
    ({ browserName }) => browserName === 'firefox',
    'Firefox does not support touch emulation'
);

// DB seeding can take a moment on a cold backend
test.setTimeout(120_000);

// ---------------------------------------------------------------------------
// Test 1 — Full participant journey on mobile
// ---------------------------------------------------------------------------
test('mobile: full participant journey completes and shows thank-you', async ({
    page,
    studyNav,
}) => {
    // Use studyNav to navigate to rough-sort (it handles welcome + consent for us).
    // We use a small grid (10 statements) to keep the test fast while still
    // exercising a multi-column fine-sort grid.
    const statementCount = 10;
    await studyNav.navigateToStep('rough-sort', {
        title: 'Mobile Q-Sort Test',
        statements: testDataBuilders.statements(statementCount),
        grid_config: [
            { score: -3, capacity: 1 },
            { score: -2, capacity: 1 },
            { score: -1, capacity: 2 },
            { score: 0, capacity: 2 },
            { score: 1, capacity: 2 },
            { score: 2, capacity: 1 },
            { score: 3, capacity: 1 },
        ],
        presort_config: { enabled: false, fields: {} },
    });

    // ----- Rough sort -----
    const roughSort = new RoughSortPage(page);
    await roughSort.waitForLoad();
    await roughSort.completeRoughSort(statementCount);

    // ----- Fine sort -----
    const fineSort = new FineSortPage(page);
    await fineSort.waitForLoad();

    // Verify core layout elements are visible on mobile
    await expect(page.getByTestId('legend-disagree')).toBeVisible();
    await expect(page.getByTestId('legend-agree')).toBeVisible();

    // Complete the fine sort (card-tap + grid-slot mechanism works on mobile)
    await fineSort.completeFineSort();

    // ----- Post-sort wizard -----
    await expect(page).toHaveURL(/.*\/post-sort/, { timeout: 20_000 });

    // Step 1 (feedback): no extreme cards require comments (grid scores -3..+3,
    // extreme_columns default is [-4, 4] so no cards match → validation passes).
    const step1NextBtn = page.getByTestId('postsort-step1-next-btn');
    await expect(step1NextBtn).toBeVisible({ timeout: 15_000 });
    await expect(step1NextBtn).toBeEnabled({ timeout: 5_000 });
    await step1NextBtn.click();

    // Step 2 (questionnaire): no custom questions → submit is immediately available
    const submitBtn = page.getByTestId('postsort-submit-btn');
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    // ----- Thank-you screen -----
    const thankYou = page.getByTestId('thank-you-message');
    await expect(thankYou).toBeVisible({ timeout: 30_000 });
});

// ---------------------------------------------------------------------------
// Test 2 — Tap interaction: selecting a card activates the workbench
// ---------------------------------------------------------------------------
test('mobile: tapping a card activates the workbench (placement mode)', async ({
    page,
    studyNav,
}) => {
    await studyNav.navigateToStep('fine-sort', {
        title: 'Mobile Workbench Test',
        statements: testDataBuilders.statements(10),
        grid_config: [
            { score: -1, capacity: 3 },
            { score: 0, capacity: 4 },
            { score: 1, capacity: 3 },
        ],
        presort_config: { enabled: false, fields: {} },
    });

    const fineSort = new FineSortPage(page);
    await fineSort.waitForLoad();

    // Tap the first card in the deck — expect the workbench instruction to appear
    await fineSort.tapFirstCard();
    await fineSort.verifyWorkbenchActive();
});
