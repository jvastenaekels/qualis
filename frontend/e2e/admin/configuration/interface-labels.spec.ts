import { test, expect } from "../../fixtures/db-setup";
import { testDataBuilders } from "../../fixtures/test-data";

/**
 * Systematic Configuration Testing: Interface Customization
 *
 * Tests UI label and interface customization options:
 * 1. Admin UI: Can customize labels
 * 2. API: Customizations save correctly
 * 3. Participant UI: Custom labels appear
 * 4. Validation: Non-empty labels
 * 5. Edge Cases: Special characters, long text
 */

test.describe("Interface Customization Testing", () => {
  test.describe("UI Labels", () => {
    let studySlug: string;

    test.beforeEach(async ({ testDb, authToken }) => {
      const study = await testDb.createStudy(
        authToken,
        testDataBuilders.study({
          slug: `test-interface-labels-${Date.now()}`,
          statements: testDataBuilders.statements(10),
        }),
      );
      studySlug = study.slug;
    });

    test("Admin: Can customize button labels", async ({ page }) => {
      await page.goto("/admin");
      await page.fill('input[name="username"]', "test@example.com");
      await page.fill('input[name="password"]', "testpassword");
      await page.click('button[type="submit"]');

      await page.click(`text=${studySlug}`);
      await page.click("text=Interface");

      // Customize labels
      await page.fill('input[name="label_agree"]', "I Agree");
      await page.fill('input[name="label_disagree"]', "I Disagree");
      await page.fill('input[name="label_neutral"]', "Unsure");

      // Verify changes are reflected
      await expect(page.locator('input[name="label_agree"]')).toHaveValue(
        "I Agree",
      );
    });

    test("API: Custom labels save correctly", async ({ testDb, authToken }) => {
      const customLabels = {
        agree: "Strongly Agree",
        disagree: "Strongly Disagree",
        neutral: "Neutral",
        continue: "Next Step",
        submit: "Finish Study",
      };

      await testDb.updateStudy(authToken, studySlug, {
        translations: [
          {
            language_code: "en",
            title: "Test Study",
            ui_labels: customLabels,
          },
        ],
      });

      const study = await testDb.getStudy(authToken, studySlug);
      const enTranslation = study.translations.find(
        (t) => t.language_code === "en",
      );

      expect(enTranslation.ui_labels.agree).toBe("Strongly Agree");
      expect(enTranslation.ui_labels.disagree).toBe("Strongly Disagree");
    });

    test("Participant: Custom labels appear in UI", async ({
      page,
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        translations: [
          {
            language_code: "en",
            title: "Test Study",
            ui_labels: {
              agree: "Custom Agree",
              disagree: "Custom Disagree",
              neutral: "Custom Neutral",
            },
          },
        ],
        state: "active",
      });

      await page.goto(`/study/${studySlug}`);
      await page.click('button:has-text("Accept")');

      // Verify custom labels appear
      await expect(
        page.locator('button:has-text("Custom Agree")'),
      ).toBeVisible();
      await expect(
        page.locator('button:has-text("Custom Disagree")'),
      ).toBeVisible();
      await expect(
        page.locator('button:has-text("Custom Neutral")'),
      ).toBeVisible();
    });

    test("Validation: Empty labels not allowed", async ({ page }) => {
      await page.goto("/admin");
      await page.fill('input[name="username"]', "test@example.com");
      await page.fill('input[name="password"]', "testpassword");
      await page.click('button[type="submit"]');

      await page.click(`text=${studySlug}`);
      await page.click("text=Interface");

      // Try to clear a label
      await page.fill('input[name="label_agree"]', "");
      await page.blur('input[name="label_agree"]');

      // Verify validation error or default value restored
      const value = await page
        .locator('input[name="label_agree"]')
        .inputValue();
      expect(value).toBeTruthy(); // Should not be empty
    });

    test("Edge Case: Long custom labels", async ({
      page,
      testDb,
      authToken,
    }) => {
      const longLabel =
        "This is a very long custom label that might cause layout issues in the UI";

      await testDb.updateStudy(authToken, studySlug, {
        translations: [
          {
            language_code: "en",
            title: "Test Study",
            ui_labels: {
              agree: longLabel,
            },
          },
        ],
        state: "active",
      });

      await page.goto(`/study/${studySlug}`);
      await page.click('button:has-text("Accept")');

      // Verify long label appears and doesn't break layout
      const button = page.locator(
        `button:has-text("${longLabel.substring(0, 20)}")`,
      );
      await expect(button).toBeVisible();

      // Check button is still clickable
      const boundingBox = await button.boundingBox();
      expect(boundingBox).toBeTruthy();
    });
  });

  test.describe("Process Steps Customization", () => {
    let studySlug: string;

    test.beforeEach(async ({ testDb, authToken }) => {
      const study = await testDb.createStudy(
        authToken,
        testDataBuilders.study({
          slug: `test-interface-steps-${Date.now()}`,
          statements: testDataBuilders.statements(10),
        }),
      );
      studySlug = study.slug;
    });

    test("Admin: Can customize process step names", async ({ page }) => {
      await page.goto("/admin");
      await page.fill('input[name="username"]', "test@example.com");
      await page.fill('input[name="password"]', "testpassword");
      await page.click('button[type="submit"]');

      await page.click(`text=${studySlug}`);
      await page.click("text=Interface");

      // Customize step names
      await page.fill('input[name="step_presort"]', "Initial Questions");
      await page.fill('input[name="step_roughsort"]', "First Sorting");
      await page.fill('input[name="step_finesort"]', "Final Arrangement");
      await page.fill('input[name="step_postsort"]', "Final Questions");

      // Verify
      await expect(page.locator('input[name="step_finesort"]')).toHaveValue(
        "Final Arrangement",
      );
    });

    test("API: Process steps save correctly", async ({ testDb, authToken }) => {
      const processSteps = {
        presort: "Demographics",
        roughsort: "Quick Sort",
        finesort: "Detailed Sorting",
        postsort: "Questionnaire",
      };

      await testDb.updateStudy(authToken, studySlug, {
        translations: [
          {
            language_code: "en",
            title: "Test Study",
            process_steps: processSteps,
          },
        ],
      });

      const study = await testDb.getStudy(authToken, studySlug);
      const enTranslation = study.translations.find(
        (t) => t.language_code === "en",
      );

      expect(enTranslation.process_steps.presort).toBe("Demographics");
      expect(enTranslation.process_steps.finesort).toBe("Detailed Sorting");
    });

    test("Participant: Custom step names in navigation", async ({
      page,
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        translations: [
          {
            language_code: "en",
            title: "Test Study",
            process_steps: {
              roughsort: "Custom Rough Sort",
              finesort: "Custom Fine Sort",
            },
          },
        ],
        state: "active",
      });

      await page.goto(`/study/${studySlug}`);
      await page.click('button:has-text("Accept")');

      // Check if custom step names appear in progress/breadcrumb
      // (Implementation-specific)
      const hasCustomLabel = await page
        .locator("text=Custom Rough Sort, text=Custom Fine Sort")
        .count();
      expect(hasCustomLabel).toBeGreaterThan(0);
    });
  });

  test.describe("Help Text Customization", () => {
    let studySlug: string;

    test.beforeEach(async ({ testDb, authToken }) => {
      const study = await testDb.createStudy(
        authToken,
        testDataBuilders.study({
          slug: `test-interface-help-${Date.now()}`,
          statements: testDataBuilders.statements(10),
        }),
      );
      studySlug = study.slug;
    });

    test("Admin: Can add help text for steps", async ({ page }) => {
      await page.goto("/admin");
      await page.fill('input[name="username"]', "test@example.com");
      await page.fill('input[name="password"]', "testpassword");
      await page.click('button[type="submit"]');

      await page.click(`text=${studySlug}`);
      await page.click("text=Interface");

      // Add help text
      await page.fill(
        'textarea[name="help_roughsort"]',
        "Sort statements into three piles...",
      );
      await page.fill(
        'textarea[name="help_finesort"]',
        "Arrange statements in the grid...",
      );

      // Verify
      await expect(page.locator('textarea[name="help_finesort"]')).toHaveValue(
        "Arrange statements in the grid...",
      );
    });

    test("API: Help text saves correctly", async ({ testDb, authToken }) => {
      const stepHelp = {
        roughsort: "Rough sort instructions here",
        finesort: "Fine sort instructions here",
      };

      await testDb.updateStudy(authToken, studySlug, {
        translations: [
          {
            language_code: "en",
            title: "Test Study",
            step_help: stepHelp,
          },
        ],
      });

      const study = await testDb.getStudy(authToken, studySlug);
      const enTranslation = study.translations.find(
        (t) => t.language_code === "en",
      );

      expect(enTranslation.step_help.roughsort).toBe(
        "Rough sort instructions here",
      );
    });

    test("Participant: Help text appears in steps", async ({
      page,
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        translations: [
          {
            language_code: "en",
            title: "Test Study",
            step_help: {
              roughsort: "Custom help for rough sort",
            },
          },
        ],
        state: "active",
      });

      await page.goto(`/study/${studySlug}`);
      await page.click('button:has-text("Accept")');

      // Navigate to rough sort
      // Verify help text appears
      await expect(
        page.locator("text=Custom help for rough sort"),
      ).toBeVisible();
    });
  });

  test.describe("Statement Code Display", () => {
    let studySlug: string;

    test.beforeEach(async ({ testDb, authToken }) => {
      const study = await testDb.createStudy(
        authToken,
        testDataBuilders.study({
          slug: `test-interface-codes-${Date.now()}`,
          statements: testDataBuilders.statements(10),
          show_statement_codes: false,
        }),
      );
      studySlug = study.slug;
    });

    test("Admin: Can toggle statement codes", async ({ page }) => {
      await page.goto("/admin");
      await page.fill('input[name="username"]', "test@example.com");
      await page.fill('input[name="password"]', "testpassword");
      await page.click('button[type="submit"]');

      await page.click(`text=${studySlug}`);
      await page.click("text=Interface");

      // Toggle statement codes
      const toggle = page.locator("#show-statement-codes");
      await toggle.check();

      await expect(toggle).toBeChecked();
    });

    test("API: Statement code setting saves", async ({ testDb, authToken }) => {
      await testDb.updateStudy(authToken, studySlug, {
        show_statement_codes: true,
      });

      const study = await testDb.getStudy(authToken, studySlug);
      expect(study.show_statement_codes).toBe(true);
    });

    test("Participant: Statement codes shown when enabled", async ({
      page,
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        show_statement_codes: true,
        state: "active",
      });

      await page.goto(`/study/${studySlug}`);
      await page.click('button:has-text("Accept")');

      // Verify statement codes appear (e.g., "S1", "S2")
      await expect(page.locator("text=S1")).toBeVisible();
    });

    test("Participant: Statement codes hidden when disabled", async ({
      page,
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        show_statement_codes: false,
        state: "active",
      });

      await page.goto(`/study/${studySlug}`);
      await page.click('button:has-text("Accept")');

      // Statement codes should not appear
      const codeCount = await page.locator("text=/^S\\d+$/").count();
      expect(codeCount).toBe(0);
    });
  });
});
