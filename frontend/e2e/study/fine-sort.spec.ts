import { test, expect } from "../fixtures/db-setup";
import { WelcomePage } from "../pages/WelcomePage";
import { ConsentPage } from "../pages/ConsentPage";
import { PreSortPage } from "../pages/PreSortPage";
import { RoughSortPage } from "../pages/RoughSortPage";
import { FineSortPage } from "../pages/FineSortPage";
import { testDataBuilders } from "../fixtures/test-data";

test.describe("Fine Sort Comprehensive UX & Layout (Real Backend)", () => {
  test.setTimeout(120_000);

  let studySlug: string;

  test.beforeEach(async ({ testDb, authToken }) => {
    // Create a real study for this test
    // We use asymmetric grid to be interesting or standard symmetric
    const study = await testDb.createStudy(
      authToken,
      testDataBuilders.study({
        title: "Fine Sort UX Test",
        slug: `ux-test-flow-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
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
    studySlug = study.slug;
  });

  test("should verify all critical UI elements and interactions", async ({
    page,
    testDb,
    authToken,
  }) => {
    const welcomePage = new WelcomePage(page);
    const consentPage = new ConsentPage(page);
    const preSortPage = new PreSortPage(page);
    const roughSortPage = new RoughSortPage(page);
    const fineSortPage = new FineSortPage(page);

    // --- SETUP ---
    await test.step("Navigate to Fine Sort", async () => {
      await welcomePage.visit(studySlug);
      await welcomePage.startStudy();

      await consentPage.waitForLoad();
      await consentPage.acceptConsent();

      // Fast-forward through Pre-Sort
      try {
        await preSortPage.waitForLoad();
        await preSortPage.completePreSort();
      } catch (_e) {
        console.log("Skipped pre-sort or already passed");
      }

      // Fast-forward through Rough Sort
      await roughSortPage.waitForLoad();
      // Important: Distribute cards to ensure deck is populated in Fine Sort
      await roughSortPage.completeRoughSort(10);

      await fineSortPage.waitForLoad();
    });

    // --- SECTION 1: VISIBILITY & LAYOUT CHECKS ---
    await test.step("Verify Critical Layout Elements", async () => {
      await fineSortPage.verifyLayout();
    });

    // --- SECTION 2: FOOTER INTERACTIONS ---
    await test.step("Verify Footer Interactions", async () => {
      // A. Initial State: "Drag or Tap"
      await fineSortPage.checkFooter(/Drag|Glissez|Tap|Appuyez/);

      // B. Selection State: Click a card -> Footer changes
      const deckCard = fineSortPage.deckContainer
        .locator('[data-testid^="card-"]')
        .first();
      await deckCard.click();

      // Footer text should change to "Place" or specific instruction
      // Use regex for flexibility
      await fineSortPage.checkFooter(/Select a slot|Place|Choisi/i);
    });

    // --- SECTION 3: DECK & DRAG ---
    await test.step("Verify Deck & Drag Functionality", async () => {
      const initialDeckCount = await fineSortPage.getDeckCount();
      await fineSortPage.dragFirstCardToSlot();

      // Verify Logic
      // 1. Deck count decreases
      const newDeckCount = await fineSortPage.getDeckCount();
      expect(newDeckCount).toBe(initialDeckCount - 1);
    });

    // --- SECTION 4: PILE SWITCHING ---
    await test.step("Verify Pile Switching", async () => {
      // Switch to separate pile (e.g. Agree)
      await fineSortPage.selectPile(2); // Agree
    });
  });
});
