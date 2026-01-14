import { test, expect } from "../fixtures/db-setup";
import { testDataBuilders } from "../fixtures/test-data";
import { WelcomePage } from "../pages/WelcomePage";
import { ConsentPage } from "../pages/ConsentPage";
import { PreSortPage } from "../pages/PreSortPage";
import { RoughSortPage } from "../pages/RoughSortPage";
import { FineSortPage } from "../pages/FineSortPage";

test.describe("UI Consistency & Logic Verification", () => {
  test("Case A: Maximal Study (Pre-Sort + Pre-Instruction + Post-Questions)", async ({
    page,
    testDb,
    authToken,
  }) => {
    page.on("console", (msg) => console.log("BROWSER LOG:", msg.text()));

    // Create study with pre-sort, pre-instruction, and post-sort config
    const study = await testDb.createStudy(
      authToken,
      testDataBuilders.study({
        title: "Maximal UI Test",
        slug: `ui-maximal-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        statements: testDataBuilders.statements(10),
        grid_config: [
          { score: -1, capacity: 3 },
          { score: 0, capacity: 4 },
          { score: 1, capacity: 3 },
        ],
        presort_config: testDataBuilders.presortConfig({
          age: testDataBuilders.presortField("number", "Age", {
            required: true,
          }),
          gender: testDataBuilders.presortField("select", "Gender", {
            required: true,
            options: ["Male", "Female"],
          }),
          education: testDataBuilders.presortField("select", "Education", {
            required: true,
            options: ["High School", "Bachelor"],
          }),
        }),
        state: "active",
      }),
    );

    const welcomePage = new WelcomePage(page);
    const consentPage = new ConsentPage(page);
    const preSortPage = new PreSortPage(page);
    const roughSortPage = new RoughSortPage(page);
    const fineSortPage = new FineSortPage(page);

    // 1. Welcome
    await welcomePage.visit(study.slug);
    await welcomePage.startStudy();

    // 2. Consent
    await consentPage.waitForLoad();
    await consentPage.acceptConsent();

    // 3. Pre-Sort (Should appear)
    await preSortPage.waitForLoad();
    await preSortPage.completePreSort();

    // 4. Rough Sort
    await roughSortPage.waitForLoad();
    await roughSortPage.completeRoughSort(10);

    // 5. Fine Sort
    await fineSortPage.waitForLoad();
    await fineSortPage.verifyLayout();
    await fineSortPage.completeFineSort(10);

    // 6. Should reach post-sort
    await expect(page).toHaveURL(/.*\/post-sort/);

    // Verify post-sort page UI
    await expect(
      page.getByRole("button", { name: /share|submit/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Case B: Minimal (No Pre-Sort)", async ({ page, testDb, authToken }) => {
    // Create study without pre-sort
    const study = await testDb.createStudy(
      authToken,
      testDataBuilders.study({
        title: "Minimal UI Test",
        slug: `ui-minimal-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        statements: testDataBuilders.statements(6),
        grid_config: [
          { score: -1, capacity: 2 },
          { score: 0, capacity: 2 },
          { score: 1, capacity: 2 },
        ],
        // presort_config defaults to disabled
        state: "active",
      }),
    );

    const welcomePage = new WelcomePage(page);
    const consentPage = new ConsentPage(page);
    const roughSortPage = new RoughSortPage(page);
    const fineSortPage = new FineSortPage(page);

    // 1. Welcome
    await welcomePage.visit(study.slug);
    await welcomePage.startStudy();

    // 2. Consent
    await consentPage.waitForLoad();
    await consentPage.acceptConsent();

    // 3. Should SKIP Pre-Sort and Go Straight to RoughSort
    await roughSortPage.waitForLoad();
    const url = page.url();
    expect(url).not.toContain("presort");
    expect(url).toContain("rough-sort");

    // 4. Complete Rough Sort
    await roughSortPage.completeRoughSort(6);

    // 5. Fine Sort
    await fineSortPage.waitForLoad();
    await fineSortPage.completeFineSort(6);

    // 6. Should reach post-sort
    await expect(page).toHaveURL(/.*\/post-sort/);

    // Verify post-sort page UI
    await expect(
      page.getByRole("button", { name: /share|submit/i }),
    ).toBeVisible({ timeout: 10000 });
  });
});
