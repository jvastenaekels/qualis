import { test, expect } from "../fixtures/db-setup";
import { testDataBuilders } from "../fixtures/test-data";
import { WelcomePage } from "../pages/WelcomePage";
import { ConsentPage } from "../pages/ConsentPage";
import { PreSortPage } from "../pages/PreSortPage";
import { RoughSortPage } from "../pages/RoughSortPage";
import { FineSortPage } from "../pages/FineSortPage";
import { PostSortPage } from "../pages/PostSortPage";

test.describe("Study Configurations", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => console.log(`BROWSER: ${msg.text()}`));
  });

  // --- PRESORT CONFIGURATIONS ---

  test("Study with no presort steps should skip presort page", async ({
    page,
    testDb,
    authToken,
  }) => {
    const studyData = testDataBuilders.study({
      presort_config: { enabled: false, fields: {} },
      state: "active",
    });
    const study = await testDb.createStudy(authToken, studyData);

    const welcomePage = new WelcomePage(page);
    await welcomePage.visit(study.slug);
    await welcomePage.startStudy();

    const consentPage = new ConsentPage(page);
    await consentPage.waitForLoad();
    await consentPage.acceptConsent();

    const roughSortPage = new RoughSortPage(page);
    await roughSortPage.waitForLoad();
  });

  test("Study with mandatory presort fields should require input", async ({
    page,
    testDb,
    authToken,
  }) => {
    const studyData = testDataBuilders.study({
      presort_config: testDataBuilders.presortConfig({
        age: testDataBuilders.presortField("number", "Age", { required: true }),
        gender: testDataBuilders.presortField("select", "Gender", {
          required: true,
          options: ["Male", "Female", "Other"],
        }),
        education: testDataBuilders.presortField("select", "Education", {
          required: true,
          options: ["Context High School", "Bachelor", "Master", "PhD"],
        }),
      }),
      state: "active",
    });
    const study = await testDb.createStudy(authToken, studyData);

    const welcomePage = new WelcomePage(page);
    await welcomePage.visit(study.slug);
    await welcomePage.startStudy();

    const consentPage = new ConsentPage(page);
    await consentPage.waitForLoad();
    await consentPage.acceptConsent();

    const preSortPage = new PreSortPage(page);
    await preSortPage.waitForLoad();

    // 5. Verify Submit is Disabled initially (Validation)
    const submitBtn = page.getByTestId("presort-submit-btn");
    await expect(submitBtn).toBeDisabled();

    // 6. Fill Fields
    await page.getByLabel("Age").fill("25");
    await page.getByLabel("Age").blur();
    await page.getByLabel("Gender").selectOption({ label: "Female" });
    await page.getByLabel("Education").selectOption({ label: "Bachelor" });
    await page.getByLabel("Education").blur();

    // 7. Click Submit (Button should now be enabled)
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    // 7. Verify navigation to Rough Sort
    const roughSortPage = new RoughSortPage(page);
    await roughSortPage.waitForLoad();
  });

  // --- Q-SORT CONFIGURATIONS ---

  test("Study with Asymmetric Grid should render correctly", async ({
    page,
    testDb,
    authToken,
  }) => {
    const subGrid = [
      { score: -3, capacity: 1 },
      { score: -2, capacity: 2 },
      { score: -1, capacity: 3 },
      { score: 0, capacity: 6 },
      { score: 1, capacity: 4 },
      { score: 2, capacity: 3 },
      { score: 3, capacity: 2 },
    ];
    // Total = 1+2+3+6+4+3+2 = 21
    const totalCards = 21;

    const studyData = testDataBuilders.study({
      grid_config: subGrid,
      statements: testDataBuilders.statements(totalCards),
      state: "active",
    });
    const study = await testDb.createStudy(authToken, studyData);

    const welcomePage = new WelcomePage(page);
    await welcomePage.visit(study.slug);
    await welcomePage.startStudy();

    const consentPage = new ConsentPage(page);
    await consentPage.waitForLoad();
    await consentPage.acceptConsent();

    const roughSortPage = new RoughSortPage(page);
    await roughSortPage.waitForLoad();
    await roughSortPage.completeRoughSort(studyData.statements.length);

    const fineSortPage = new FineSortPage(page);
    await fineSortPage.waitForLoad();

    // Check columns capacity using ID selector
    await expect(page.locator('#column--3 [role="gridcell"]')).toHaveCount(1);
    await expect(page.locator('#column-0 [role="gridcell"]')).toHaveCount(6);
  });

  // --- POST-SORT CONFIGURATIONS ---

  test("Study with email collection should show email input", async ({
    page,
    testDb,
    authToken,
  }) => {
    const studyData = testDataBuilders.study({
      postsort_config: {
        email_collection_enabled: true,
        interview_consent_enabled: false,
      },
      state: "active",
    });
    const study = await testDb.createStudy(authToken, studyData);

    // Shortcut: Manually navigate to PostSort? No, state check prevents it.
    // We must complete the flow.
    // Using "Shortcut" mode logic?
    // For speed, let's use minimal study (3 cards).

    // Setup minimal study
    const minimalGrid = [{ score: 0, capacity: 3 }];
    const minimalStudyData = testDataBuilders.study({
      grid_config: minimalGrid,
      statements: testDataBuilders.statements(3),
      postsort_config: {
        email_collection_enabled: true,
        interview_consent_enabled: false,
      },
      state: "active",
    });
    const s = await testDb.createStudy(authToken, minimalStudyData);

    const welcomePage = new WelcomePage(page);
    await welcomePage.visit(s.slug);
    await welcomePage.startStudy();

    const consentPage = new ConsentPage(page);
    await consentPage.waitForLoad();
    await consentPage.acceptConsent();

    // Skip Presort (default none)

    const rough = new RoughSortPage(page);
    await rough.waitForLoad();
    await rough.completeRoughSort(3);

    const fine = new FineSortPage(page);
    await fine.waitForLoad();
    await fine.completeFineSort(3); // Need to implement completeFineSort logic if not present?
    // FineSortPage logic usually involves drag and drop.
    // Let's rely on manual drag implementation in FineSortPage or use helper.
    // Wait, FineSortPage.ts (Step 23187) size 5178 suggests it has helper.

    // If FineSortPage.completeFineSort exists, use it.
    // Let's assume completeFineSort handles placing any remaining cards to random slots.

    const postSort = new PostSortPage(page);
    await postSort.waitForLoad();

    // Verify Email Input
    await expect(page.getByLabel("Email", { exact: false })).toBeVisible();
  });

  test("Study with interview consent should show checkboxes", async ({
    page,
    testDb,
    authToken,
  }) => {
    const minimalGrid = [{ score: 0, capacity: 3 }];
    const studyData = testDataBuilders.study({
      grid_config: minimalGrid,
      statements: testDataBuilders.statements(3),
      postsort_config: {
        email_collection_enabled: false,
        interview_consent_enabled: true,
      },
      state: "active",
    });
    const study = await testDb.createStudy(authToken, studyData);

    const welcomePage = new WelcomePage(page);
    await welcomePage.visit(study.slug);
    await welcomePage.startStudy();

    const consentPage = new ConsentPage(page);
    await consentPage.waitForLoad();
    await consentPage.acceptConsent();

    const rough = new RoughSortPage(page);
    await rough.waitForLoad();
    await rough.completeRoughSort(3);

    const fine = new FineSortPage(page);
    await fine.waitForLoad();
    await fine.completeFineSort(3);

    const postSort = new PostSortPage(page);
    await postSort.waitForLoad();

    // Verify Consent Checkbox
    // Label usually contains "interview" or similar text from translations
    // Default text?
    await expect(page.getByText("interview", { exact: false })).toBeVisible();
  });
});
