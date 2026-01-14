import { test, expect } from "../../fixtures/db-setup";
import {
  testDataBuilders,
  type PresortFieldType,
} from "../../fixtures/test-data";
import type { Page } from "@playwright/test";

/**
 * Systematic Configuration Testing: Presort Fields
 *
 * For each field type, we test:
 * 1. Admin UI: Can configure the field
 * 2. API: Configuration is saved correctly
 * 3. Participant UI: Field renders correctly
 * 4. Validation: Rules are enforced
 * 5. Edge Cases: Limits and interactions
 */

const FIELD_TYPES: PresortFieldType[] = [
  "text",
  "email",
  "number",
  "select",
  "checkbox",
  "radio",
  "date",
  "textarea",
];

test.describe("Presort Field Configuration Testing", () => {
  for (const fieldType of FIELD_TYPES) {
    test.describe(`Field Type: ${fieldType}`, () => {
      let studySlug: string;

      test.beforeEach(async ({ testDb, authToken }) => {
        // Create a study for this test
        const study = await testDb.createStudy(
          authToken,
          testDataBuilders.study({
            slug: `test-presort-${fieldType}-${Date.now()}`,
            statements: testDataBuilders.statements(10),
          }),
        );
        studySlug = study.slug;
      });

      test(`Admin: Can add ${fieldType} field`, async ({ page, authToken }) => {
        // Navigate to study designer
        await page.goto("/admin");
        await page.fill('input[name="username"]', "test@example.com");
        await page.fill('input[name="password"]', "testpassword");
        await page.click('button[type="submit"]');

        // Navigate to presort configuration
        await page.click(`text=${studySlug}`);
        await page.click("text=Pre-Sort");

        // Add a new field
        await page.click('button:has-text("Add Field")');

        // Configure field type
        await page.selectOption('select[name="fieldType"]', fieldType);
        await page.fill('input[name="fieldLabel"]', `Test ${fieldType} Field`);

        // Type-specific configuration
        if (
          fieldType === "select" ||
          fieldType === "radio" ||
          fieldType === "checkbox"
        ) {
          await page.click('button:has-text("Add Option")');
          await page.fill('input[name="option-0"]', "Option 1");
          await page.click('button:has-text("Add Option")');
          await page.fill('input[name="option-1"]', "Option 2");
        }

        if (fieldType === "number") {
          await page.fill('input[name="min"]', "0");
          await page.fill('input[name="max"]', "100");
        }

        // Save the field
        await page.click('button:has-text("Save Field")');

        // Verify field appears in the list
        await expect(
          page.locator(`text=Test ${fieldType} Field`),
        ).toBeVisible();
      });

      test(`API: ${fieldType} field is saved correctly`, async ({
        testDb,
        authToken,
      }) => {
        // Create presort configuration via API
        const field = testDataBuilders.presortField(
          fieldType,
          `Test ${fieldType} Field`,
          {
            required: true,
          },
        );

        const presortConfig = testDataBuilders.presortConfig({
          [`test_${fieldType}`]: field,
        });

        await testDb.updateStudy(authToken, studySlug, {
          presort_config: presortConfig,
        });

        // Verify it was saved
        const study = await testDb.getStudy(authToken, studySlug);

        expect(study.presort_config.enabled).toBe(true);
        expect(study.presort_config.fields[`test_${fieldType}`]).toBeDefined();
        expect(study.presort_config.fields[`test_${fieldType}`].type).toBe(
          fieldType,
        );
        expect(study.presort_config.fields[`test_${fieldType}`].label).toBe(
          `Test ${fieldType} Field`,
        );
        expect(study.presort_config.fields[`test_${fieldType}`].required).toBe(
          true,
        );
      });

      test(`Participant: ${fieldType} field renders correctly`, async ({
        page,
        testDb,
        authToken,
      }) => {
        // Setup: Add field via API
        const field = testDataBuilders.presortField(
          fieldType,
          `Participant ${fieldType} Test`,
        );
        const presortConfig = testDataBuilders.presortConfig({
          [`test_${fieldType}`]: field,
        });

        await testDb.updateStudy(authToken, studySlug, {
          presort_config: presortConfig,
          state: "active",
        });

        // Navigate to study as participant
        await page.goto(`/study/${studySlug}`);

        // Accept consent
        await page.click('button:has-text("Accept")');

        // Verify field renders
        await expect(
          page.locator(`text=Participant ${fieldType} Test`),
        ).toBeVisible();

        // Verify field type-specific rendering
        const fieldSelector = getFieldSelector(fieldType);
        await expect(page.locator(fieldSelector)).toBeVisible();
      });

      test(`Validation: ${fieldType} field validation works`, async ({
        page,
        testDb,
        authToken,
      }) => {
        // Setup: Add required field via API
        const field = testDataBuilders.presortField(
          fieldType,
          `Required ${fieldType}`,
          {
            required: true,
          },
        );
        const presortConfig = testDataBuilders.presortConfig({
          [`required_${fieldType}`]: field,
        });

        await testDb.updateStudy(authToken, studySlug, {
          presort_config: presortConfig,
          state: "active",
        });

        // Navigate to study
        await page.goto(`/study/${studySlug}`);
        await page.click('button:has-text("Accept")');

        // Try to proceed without filling required field
        await page.click('button:has-text("Continue")');

        // Verify validation error appears
        await expect(
          page.locator("text=required", { hasText: /required/i }),
        ).toBeVisible();

        // Fill the field correctly
        await fillField(page, fieldType, "Valid input");

        // Verify can proceed
        await page.click('button:has-text("Continue")');
        await expect(page).toHaveURL(
          new RegExp(`/study/${studySlug}/rough-sort`),
        );
      });

      test(`Edge Case: ${fieldType} field with constraints`, async ({
        page,
        testDb,
        authToken,
      }) => {
        // Type-specific edge case tests
        let field;
        let edgeCaseValue;

        if (fieldType === "number") {
          field = testDataBuilders.presortField(fieldType, "Age", {
            required: true,
            min: 18,
            max: 100,
          });
          edgeCaseValue = { valid: "25", invalid: "150" };
        } else if (fieldType === "text") {
          field = testDataBuilders.presortField(fieldType, "Name", {
            required: true,
            minLength: 2,
            maxLength: 50,
          });
          edgeCaseValue = { valid: "John", invalid: "J" };
        } else if (fieldType === "email") {
          field = testDataBuilders.presortField(fieldType, "Email", {
            required: true,
          });
          edgeCaseValue = {
            valid: "test@example.com",
            invalid: "not-an-email",
          };
        } else {
          // Other field types: test required constraint
          field = testDataBuilders.presortField(
            fieldType,
            `Edge ${fieldType}`,
            {
              required: true,
            },
          );
          edgeCaseValue = { valid: "Valid option", invalid: null };
        }

        const presortConfig = testDataBuilders.presortConfig({
          [`edge_${fieldType}`]: field,
        });

        await testDb.updateStudy(authToken, studySlug, {
          presort_config: presortConfig,
          state: "active",
        });

        // Test invalid value
        await page.goto(`/study/${studySlug}`);
        await page.click('button:has-text("Accept")');

        if (edgeCaseValue.invalid) {
          await fillField(page, fieldType, edgeCaseValue.invalid);
          await page.click('button:has-text("Continue")');
          await expect(
            page.locator("text=invalid", { hasText: /invalid|error/i }),
          ).toBeVisible();
        }

        // Test valid value
        await fillField(page, fieldType, edgeCaseValue.valid);
        await page.click('button:has-text("Continue")');
        await expect(page).toHaveURL(
          new RegExp(`/study/${studySlug}/rough-sort`),
        );
      });
    });
  }
});

// Helper functions
function getFieldSelector(fieldType: PresortFieldType): string {
  switch (fieldType) {
    case "text":
    case "email":
    case "number":
    case "date":
      return `input[type="${fieldType}"]`;
    case "textarea":
      return "textarea";
    case "select":
      return "select";
    case "checkbox":
    case "radio":
      return `input[type="${fieldType}"]`;
    default:
      return "input";
  }
}

async function fillField(page: Page, fieldType: PresortFieldType, value: any) {
  const selector = getFieldSelector(fieldType);

  switch (fieldType) {
    case "checkbox":
      if (value) await page.check(selector);
      break;
    case "radio":
    case "select":
      await page.selectOption(selector, value);
      break;
    default:
      await page.fill(selector, String(value));
  }
}
