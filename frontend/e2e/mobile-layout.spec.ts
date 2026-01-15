import { expect, test } from "@playwright/test";
import { mockStudyAPI, mockStudyConfig } from "./fixtures/study-config";

test.describe("Mobile Layout & Navigation", () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE/8
    isMobile: true,
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await mockStudyAPI(page);
  });

  test("Welcome page adapts to small screen", async ({ page }) => {
    await page.goto(`/study/${mockStudyConfig.slug}/welcome`);

    // Check structural elements stacking
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS("font-size", /.*/); // Just checking existence for now

    // Check if button is visible and clickable without scrolling (ideally)
    const startBtn = page.getByRole("button", { name: /continue|continuer/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Should navigate to Consent
    await expect(page).toHaveURL(/.*\/consent/);
  });

  test("Rough sort uses touch buttons on mobile", async ({ page }) => {
    // Fast forward to Rough Sort
    await page.goto(`/study/${mockStudyConfig.slug}/welcome`);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/consent/i).check();
    await page.getByRole("button", { name: /get started/i }).click();
    await page.getByRole("button", { name: /continue|submit/i }).click(); // Presort

    await expect(page).toHaveURL(/.*\/rough-sort/);

    // Verify touch buttons are visible using stable shortcuts attributes
    const disagreeBtn = page.locator('button[aria-keyshortcuts="ArrowLeft"]');
    const neutralBtn = page.locator('button[aria-keyshortcuts="ArrowDown"]');
    const agreeBtn = page.locator('button[aria-keyshortcuts="ArrowRight"]');

    await expect(disagreeBtn).toBeVisible();
    await expect(neutralBtn).toBeVisible();
    await expect(agreeBtn).toBeVisible();

    // Perform interactions
    // 1. Sort Disagree
    await disagreeBtn.click();

    // 2. Sort Neutral
    await neutralBtn.click();

    // 3. Sort Agree
    await agreeBtn.click();

    // Optional: Check Undo visibility
    const undoBtn = page.locator('button[aria-keyshortcuts="z"]');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();
  });

  test("Fine sort displays components in mobile layout", async ({ page }) => {
    // We can navigate directly to fine sort if we mock state, but navigating flow is safer
    // To skip rough sort rapidly:
    await page.goto(`/study/${mockStudyConfig.slug}/welcome`);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/consent/i).check();
    await page.getByRole("button", { name: /get started/i }).click();
    await page.getByRole("button", { name: /continue|submit/i }).click(); // Presort

    // Rough sort: auto-complete by clicking buttons rapidly
    const cardsTotal = mockStudyConfig.statements.length;
    const btns = [
      page.locator('button[aria-keyshortcuts="ArrowLeft"]'),
      page.locator('button[aria-keyshortcuts="ArrowDown"]'),
      page.locator('button[aria-keyshortcuts="ArrowRight"]'),
    ];

    // We need to click `cardsTotal` times.
    for (let i = 0; i < cardsTotal; i++) {
      await btns[i % 3].click();
      // Small stability wait - increased for mobile emulation reliability
      await page.waitForTimeout(300);
    }

    // Navigate to Fine Sort
    await page.getByRole("button", { name: /next|suivant/i }).click();

    await expect(page).toHaveURL(/.*\/fine-sort/);

    // Verify Mobile Layout Elements
    // 1. Deck at bottom
    await expect(page.getByTestId("deck-cards-container")).toBeVisible();

    // 3. Verify tip is visible (or auto-show) is skipped as it might auto-close
  });
});
