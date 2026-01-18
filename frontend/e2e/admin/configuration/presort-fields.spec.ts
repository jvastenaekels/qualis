import { test, expect } from '../../fixtures/db-setup';
import { testDataBuilders, type PresortFieldType } from '../../fixtures/test-data';
import type { Page } from '@playwright/test';

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
    'text',
    'email',
    'number',
    'select',
    'checkbox',
    'radio',
    'date',
    'textarea',
];

test.describe('Presort Field Configuration Testing', () => {
    for (const fieldType of FIELD_TYPES) {
        test.describe(`Field Type: ${fieldType}`, () => {
            let studySlug: string;

            test.beforeEach(async ({ testDb, authToken }) => {
                // Create a study for this test
                const study = await testDb.createStudy(
                    authToken,
                    testDataBuilders.study({
                        slug: `test-presort-${fieldType}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                        statements: testDataBuilders.statements(10),
                    })
                );
                studySlug = study.slug;
            });

            test(`Admin: Can add ${fieldType} field`, async ({ page, testDb }) => {
                // Navigate to study designer
                await testDb.loginToAdminUI(page);

                // Navigate to presort configuration
                await page.click(`text=${studySlug}`);
                await page
                    .getByRole('link', { name: /design/i })
                    .first()
                    .click();
                await page.getByTestId('tab-pre-sort').click();

                // Ensure presort is enabled
                const toggle = page.getByTestId('presort-toggle');
                const isChecked = (await toggle.getAttribute('aria-checked')) === 'true';
                if (!isChecked) {
                    await toggle.click();
                }

                // Wait for toolbar to be visible
                await expect(page.getByTestId('add-question-text')).toBeVisible({ timeout: 10000 });

                // Add a new field by clicking the specific type button
                await page.click(`[data-testid="add-question-${fieldType}"]`);

                // Wait for question item to appear
                await page.locator('[data-testid="question-accordion-trigger"]').last().click();

                // Update Label
                await page.locator('input[value="New question"]').fill(`Test ${fieldType} Field`);

                // Type-specific configuration
                // Default options are "Option 1", "Option 2". We can verify them.
                if (fieldType === 'select' || fieldType === 'radio' || fieldType === 'checkbox') {
                    await expect(page.locator('input[value="Option 1"]')).toBeVisible();
                    await expect(page.locator('input[value="Option 2"]')).toBeVisible();
                }

                if (fieldType === 'number') {
                    // Min/Max are likely not in the basic view unless we check implementation.
                    // Checked QuestionBuilder.tsx: min/max support exists but not exposed in the simplified UI shown in code?
                    // Correction: The provided QuestionBuilder.tsx (lines 173+) only shows Label, Required, Options.
                    // It does NOT show Min/Max configuration inputs in the code snippet provided!
                    // lines 188-208 show Required switch.
                    // Line 210 shows Options.
                    // There are NO inputs for min/max/placeholder in the rendered TSX in QuestionBuilder!
                    // They are in the `QuestionConfig` interface but not in the UI for editing.
                    // So we CANNOT test configuring them in Admin UI if they aren't there.
                    // We will skip Min/Max config in this test for now.
                }

                // Auto-saving happens. No save button.

                // Verify field label is updated in the preview/header
                await expect(
                    page.locator('span.font-bold', { hasText: `Test ${fieldType} Field` })
                ).toBeVisible();
            });

            test(`API: ${fieldType} field is saved correctly`, async ({ testDb, authToken }) => {
                // Create presort configuration via API
                const field = testDataBuilders.presortField(fieldType, `Test ${fieldType} Field`, {
                    required: true,
                });

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
                expect(study.presort_config.fields[`test_${fieldType}`].type).toBe(fieldType);
                expect(study.presort_config.fields[`test_${fieldType}`].label).toBe(
                    `Test ${fieldType} Field`
                );
                expect(study.presort_config.fields[`test_${fieldType}`].required).toBe(true);
            });

            test(`Participant: ${fieldType} field renders correctly`, async ({
                page,
                testDb,
                authToken,
            }) => {
                // Setup: Add field via API
                const field = testDataBuilders.presortField(
                    fieldType,
                    `Participant ${fieldType} Test`
                );
                const presortConfig = testDataBuilders.presortConfig({
                    [`test_${fieldType}`]: field,
                });

                await testDb.updateStudy(authToken, studySlug, {
                    presort_config: presortConfig,
                    state: 'active',
                });

                // Navigate to study as participant
                await page.goto(`/study/${studySlug}`);

                // Accept consent
                // Accept consent (New Flow)
                await page.click('[data-testid="start-btn"]');
                await page.check('[data-testid="consent-checkbox"]');
                await page.click('[data-testid="consent-accept-btn"]');

                // Verify field renders
                await expect(page.locator(`text=Participant ${fieldType} Test`)).toBeVisible();

                // Verify field renders
                const fieldSelector = getFieldSelector(fieldType);
                await expect(page.locator(fieldSelector).first()).toBeVisible();
            });

            test(`Validation: ${fieldType} field validation works`, async ({
                page,
                testDb,
                authToken,
            }) => {
                // Setup: Add required field via API
                const field = testDataBuilders.presortField(fieldType, `Required ${fieldType}`, {
                    required: true,
                });
                const presortConfig = testDataBuilders.presortConfig({
                    [`required_${fieldType}`]: field,
                });

                await testDb.updateStudy(authToken, studySlug, {
                    presort_config: presortConfig,
                    state: 'active',
                });

                // Navigate to study
                await page.goto(`/study/${studySlug}`);
                // Accept consent (New Flow)
                await page.click('[data-testid="start-btn"]');
                await page.check('[data-testid="consent-checkbox"]');
                await page.click('[data-testid="consent-accept-btn"]');

                // Try to proceed without filling required field
                await page.getByTestId('presort-submit-btn').click();

                // Verify validation error appears
                await expect(page.getByTestId('presort-field-error')).toBeVisible();

                // Fill the field correctly
                const validValue =
                    fieldType === 'checkbox' || fieldType === 'radio' || fieldType === 'select'
                        ? 'Option 1'
                        : 'Valid input';

                // For email/date/number, "Valid input" might fail validation (e.g. email format)
                // Adjust for specific types
                let finalValue = validValue;
                if (fieldType === 'email') finalValue = 'test@example.com';
                if (fieldType === 'date') finalValue = '2024-01-01';
                if (fieldType === 'number') finalValue = '42';

                await fillField(page, fieldType, finalValue);

                // Verify can proceed
                await page.getByTestId('presort-submit-btn').click();
                await expect(page).toHaveURL(new RegExp(`/study/${studySlug}/rough-sort`));
            });

            test(`Edge Case: ${fieldType} field with constraints`, async ({
                page,
                testDb,
                authToken,
            }) => {
                // Type-specific edge case tests
                let field: any = null;
                let edgeCaseValue: any = null;

                if (fieldType === 'number') {
                    field = testDataBuilders.presortField(fieldType, 'Age', {
                        required: true,
                        min: 18,
                        max: 100,
                    });
                    edgeCaseValue = { valid: '25', invalid: '150' };
                } else if (fieldType === 'text') {
                    field = testDataBuilders.presortField(fieldType, 'Name', {
                        required: true,
                        minLength: 2,
                        maxLength: 50,
                    });
                    edgeCaseValue = { valid: 'John', invalid: 'J' };
                } else if (fieldType === 'email') {
                    field = testDataBuilders.presortField(fieldType, 'Email', {
                        required: true,
                    });
                    edgeCaseValue = {
                        valid: 'test@example.com',
                        invalid: 'not-an-email',
                    };
                } else {
                    // Other field types: test required constraint
                    field = testDataBuilders.presortField(fieldType, `Edge ${fieldType}`, {
                        required: true,
                    });
                    edgeCaseValue = { valid: 'Option 1', invalid: null };
                }

                const presortConfig = testDataBuilders.presortConfig({
                    [`edge_${fieldType}`]: field,
                });

                await testDb.updateStudy(authToken, studySlug, {
                    presort_config: presortConfig,
                    state: 'active',
                });

                // Test invalid value
                await page.goto(`/study/${studySlug}`);
                // Accept consent (New Flow)
                await page.click('[data-testid="start-btn"]');
                await page.check('[data-testid="consent-checkbox"]');
                await page.click('[data-testid="consent-accept-btn"]');

                if (edgeCaseValue.invalid) {
                    await fillField(page, fieldType, edgeCaseValue.invalid);
                    await page.getByTestId('presort-submit-btn').click();
                    await expect(page.getByTestId('presort-field-error')).toBeVisible();
                }

                // Test valid value
                await fillField(page, fieldType, edgeCaseValue.valid);
                await page.getByTestId('presort-submit-btn').click();
                await expect(page).toHaveURL(new RegExp(`/study/${studySlug}/rough-sort`));
            });
        });
    }
});

// Helper functions
function getFieldSelector(fieldType: PresortFieldType): string {
    switch (fieldType) {
        case 'text':
        case 'email':
        case 'number':
        case 'date':
            return `input[type="${fieldType}"]`;
        case 'textarea':
            return 'textarea';
        case 'select':
            return 'select';
        case 'checkbox':
        case 'radio':
            return `input[type="${fieldType}"]`;
        default:
            return 'input';
    }
}

async function fillField(page: Page, fieldType: PresortFieldType, value: any) {
    const selector = getFieldSelector(fieldType);

    switch (fieldType) {
        case 'checkbox':
        case 'radio':
            // Click the label corresponding to the value "Option 1"
            await page.getByText(String(value), { exact: true }).click();
            break;
        case 'select':
            await page.selectOption(selector, String(value));
            break;
        default:
            await page.fill(selector, String(value));
    }
}
