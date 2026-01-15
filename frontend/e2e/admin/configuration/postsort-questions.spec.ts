import { test, expect } from "../../fixtures/db-setup";
import {
  testDataBuilders,
  type PresortFieldType,
} from "../../fixtures/test-data";

/**
 * Systematic Configuration Testing: Post-Sort Questions
 *
 * Tests post-sort configuration options:
 * 1. Admin UI: Can configure post-sort questions
 * 2. API: Configuration is saved correctly
 * 3. Participant UI: Questions render correctly
 * 4. Validation: Required fields enforced
 * 5. Edge Cases: Email collection, consent toggles
 */

test.describe("Post-Sort Configuration Testing", () => {
  test.describe("Email Collection", () => {
    let studySlug: string;

    test.beforeEach(async ({ testDb, authToken }) => {
      const study = await testDb.createStudy(
        authToken,
        testDataBuilders.study({
          slug: `test-postsort-email-${Date.now()}`,
          statements: testDataBuilders.statements(10),
        }),
      );
      studySlug = study.slug;
    });

    test("Admin: Can enable email collection", async ({ page }) => {
      await page.goto("/admin");
      await page.fill('input[name="username"]', "test@example.com");
      await page.fill('input[name="password"]', "testpassword");
      await page.click('button[type="submit"]');

      await page.click(`text=${studySlug}`);
      await page.click("text=Post-Sort");

      // Enable email collection
      const emailToggle = page.locator("#enable-email-collection");
      await emailToggle.check();

      // Verify toggle is checked
      await expect(emailToggle).toBeChecked();
    });

    test("API: Email collection config saves correctly", async ({
      testDb,
      authToken,
    }) => {
      // Enable email collection
      await testDb.updateStudy(authToken, studySlug, {
        postsort_config: {
          email_collection_enabled: true,
          interview_consent_enabled: false,
          newsletter_consent_enabled: false,
          questions: {},
        },
      });

      // Verify
      const study = await testDb.getStudy(authToken, studySlug);
      expect(study.postsort_config.email_collection_enabled).toBe(true);
    });

    test("Participant: Email field appears when enabled", async ({
      page,
      testDb,
      authToken,
    }) => {
      // Enable email collection and activate
      await testDb.updateStudy(authToken, studySlug, {
        postsort_config: {
          email_collection_enabled: true,
        },
        state: "active",
      });

      // Navigate through study to post-sort
      await page.goto(`/study/${studySlug}`);
      await page.click('button:has-text("Accept")');

      // Skip through to post-sort (implementation-specific)
      // ... complete study flow ...

      // Verify email field appears
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('label:has-text("Email")')).toBeVisible();
    });

    test("Validation: Email validation works", async ({
      page,
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        postsort_config: { email_collection_enabled: true },
        state: "active",
      });

      // Navigate to post-sort
      await page.goto(`/study/${studySlug}`);
      // ... complete flow ...

      // Try invalid email
      await page.fill('input[type="email"]', "not-an-email");
      await page.click('button:has-text("Submit")');

      // Verify validation error
      await expect(
        page.locator("text=valid email", { hasText: /valid.*email/i }),
      ).toBeVisible();

      // Fix email
      await page.fill('input[type="email"]', "test@example.com");
      await page.click('button:has-text("Submit")');

      // Should proceed
      await expect(page).toHaveURL(/thank-you|complete/);
    });

    test("Edge Case: Email optional when disabled", async ({
      page,
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        postsort_config: { email_collection_enabled: false },
        state: "active",
      });

      await page.goto(`/study/${studySlug}`);
      // ... complete flow ...

      // Email field should not appear
      await expect(page.locator('input[type="email"]')).not.toBeVisible();

      // Can submit without email
      await page.click('button:has-text("Submit")');
      await expect(page).toHaveURL(/thank-you|complete/);
    });
  });

  test.describe("Consent Options", () => {
    let studySlug: string;

    test.beforeEach(async ({ testDb, authToken }) => {
      const study = await testDb.createStudy(
        authToken,
        testDataBuilders.study({
          slug: `test-postsort-consent-${Date.now()}`,
          statements: testDataBuilders.statements(10),
        }),
      );
      studySlug = study.slug;
    });

    test("Admin: Can enable interview consent", async ({ page }) => {
      await page.goto("/admin");
      await page.fill('input[name="username"]', "test@example.com");
      await page.fill('input[name="password"]', "testpassword");
      await page.click('button[type="submit"]');

      await page.click(`text=${studySlug}`);
      await page.click("text=Post-Sort");

      const consentToggle = page.locator("#enable-interview-consent");
      await consentToggle.check();
      await expect(consentToggle).toBeChecked();
    });

    test("API: Consent config saves correctly", async ({
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        postsort_config: {
          interview_consent_enabled: true,
          newsletter_consent_enabled: true,
        },
      });

      const study = await testDb.getStudy(authToken, studySlug);
      expect(study.postsort_config.interview_consent_enabled).toBe(true);
      expect(study.postsort_config.newsletter_consent_enabled).toBe(true);
    });

    test("Participant: Consent checkboxes appear when enabled", async ({
      page,
      testDb,
      authToken,
    }) => {
      await testDb.updateStudy(authToken, studySlug, {
        postsort_config: {
          interview_consent_enabled: true,
          newsletter_consent_enabled: true,
        },
        state: "active",
      });

      // Navigate to post-sort
      await page.goto(`/study/${studySlug}`);
      // ... complete flow ...

      // Verify both consent checkboxes appear
      await expect(
        page.locator('input[type="checkbox"][name="interview_consent"]'),
      ).toBeVisible();
      await expect(
        page.locator('input[type="checkbox"][name="newsletter_consent"]'),
      ).toBeVisible();
    });
  });

  test.describe("Custom Questions", () => {
    const QUESTION_TYPES: PresortFieldType[] = [
      "text",
      "textarea",
      "select",
      "radio",
      "checkbox",
    ];

    for (const questionType of QUESTION_TYPES) {
      test.describe(`Question Type: ${questionType}`, () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
          const study = await testDb.createStudy(
            authToken,
            testDataBuilders.study({
              slug: `test-postsort-q-${questionType}-${Date.now()}`,
              statements: testDataBuilders.statements(10),
            }),
          );
          studySlug = study.slug;
        });

        test(`Admin: Can add ${questionType} question`, async ({ page }) => {
          await page.goto("/admin");
          await page.fill('input[name="username"]', "test@example.com");
          await page.fill('input[name="password"]', "testpassword");
          await page.click('button[type="submit"]');

          await page.click(`text=${studySlug}`);
          await page.click("text=Post-Sort");

          // Add question
          await page.click('button:has-text("Add Question")');
          await page.selectOption('select[name="questionType"]', questionType);
          await page.fill(
            'input[name="questionLabel"]',
            `Test ${questionType} question`,
          );

          if (
            questionType === "select" ||
            questionType === "radio" ||
            questionType === "checkbox"
          ) {
            await page.click('button:has-text("Add Option")');
            await page.fill('input[name="option-0"]', "Option 1");
          }

          await page.click('button:has-text("Save Question")');

          // Verify question appears
          await expect(
            page.locator(`text=Test ${questionType} question`),
          ).toBeVisible();
        });

        test(`API: ${questionType} question saves correctly`, async ({
          testDb,
          authToken,
        }) => {
          const question = testDataBuilders.postsortQuestion(
            questionType,
            `Test ${questionType}`,
            {
              required: true,
            },
          );

          await testDb.updateStudy(authToken, studySlug, {
            postsort_config: {
              questions: {
                [`test_${questionType}`]: question,
              },
            },
          });

          const study = await testDb.getStudy(authToken, studySlug);
          expect(
            study.postsort_config.questions[`test_${questionType}`],
          ).toBeDefined();
          expect(
            study.postsort_config.questions[`test_${questionType}`].type,
          ).toBe(questionType);
        });

        test(`Participant: ${questionType} question renders correctly`, async ({
          page,
          testDb,
          authToken,
        }) => {
          const question = testDataBuilders.postsortQuestion(
            questionType,
            `Participant ${questionType} Test`,
          );

          await testDb.updateStudy(authToken, studySlug, {
            postsort_config: {
              questions: {
                [`test_${questionType}`]: question,
              },
            },
            state: "active",
          });

          // Navigate to post-sort
          await page.goto(`/study/${studySlug}`);
          // ... complete study flow ...

          // Verify question renders
          await expect(
            page.locator(`text=Participant ${questionType} Test`),
          ).toBeVisible();
        });

        test(`Validation: Required ${questionType} question enforced`, async ({
          page,
          testDb,
          authToken,
        }) => {
          const question = testDataBuilders.postsortQuestion(
            questionType,
            `Required ${questionType}`,
            {
              required: true,
            },
          );

          await testDb.updateStudy(authToken, studySlug, {
            postsort_config: {
              questions: {
                [`required_${questionType}`]: question,
              },
            },
            state: "active",
          });

          // Navigate to post-sort
          await page.goto(`/study/${studySlug}`);
          // ... complete flow ...

          // Try to submit without answering
          await page.click('button:has-text("Submit")');

          // Verify validation error
          await expect(
            page.locator("text=required", { hasText: /required/i }),
          ).toBeVisible();
        });
      });
    }
  });
});
