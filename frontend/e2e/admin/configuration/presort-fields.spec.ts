import { test, expect } from '../../fixtures/db-setup';
import { testDataBuilders, type PresortFieldType } from '../../fixtures/test-data';
import { WelcomePage } from '../../pages/WelcomePage';
import { ConsentPage } from '../../pages/ConsentPage';
import type { Page } from '@playwright/test';

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

/** Navigate a participant through welcome + consent to reach presort */
async function navigateToPresort(page: Page, studySlug: string) {
    const welcomePage = new WelcomePage(page);
    await welcomePage.visit(studySlug);
    await welcomePage.startStudy();
    const consentPage = new ConsentPage(page);
    await consentPage.waitForLoad();
    await consentPage.acceptConsent();
}

test.describe('Presort Field Configuration Testing', () => {
    for (const fieldType of FIELD_TYPES) {
        test.describe(`Field Type: ${fieldType}`, () => {
            let studySlug: string;

            test.beforeEach(async ({ testDb, authToken }) => {
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
                await testDb.loginToAdminUI(page);

                await page.getByText(studySlug).click();
                await page
                    .getByRole('link', { name: /design/i })
                    .first()
                    .click();
                await page.getByTestId('tab-pre-sort').click();

                const toggle = page.getByTestId('presort-toggle');
                const isChecked = (await toggle.getAttribute('aria-checked')) === 'true';
                if (!isChecked) {
                    await toggle.click();
                }

                await expect(page.getByTestId('add-question-text')).toBeVisible({ timeout: 10000 });
                await page.getByTestId(`add-question-${fieldType}`).click();

                await page.locator('[data-testid="question-accordion-trigger"]').last().click();
                await page.locator('input[value="New question"]').fill(`Test ${fieldType} Field`);

                if (fieldType === 'select' || fieldType === 'radio' || fieldType === 'checkbox') {
                    await expect(page.locator('input[value="Option 1"]')).toBeVisible();
                    await expect(page.locator('input[value="Option 2"]')).toBeVisible();
                }

                await expect(
                    page.locator('span.font-bold', { hasText: `Test ${fieldType} Field` })
                ).toBeVisible();
            });

            test(`API: ${fieldType} field is saved correctly`, async ({ testDb, authToken }) => {
                const field = testDataBuilders.presortField(fieldType, `Test ${fieldType} Field`, {
                    required: true,
                });

                const presortConfig = testDataBuilders.presortConfig({
                    [`test_${fieldType}`]: field,
                });

                await testDb.updateStudy(authToken, studySlug, {
                    presort_config: presortConfig,
                });

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

                await navigateToPresort(page, studySlug);

                await expect(page.getByText(`Participant ${fieldType} Test`)).toBeVisible();

                const fieldSelector = getFieldSelector(fieldType);
                await expect(page.locator(fieldSelector).first()).toBeVisible();
            });

            test(`Validation: ${fieldType} field validation works`, async ({
                page,
                testDb,
                authToken,
            }) => {
                const fieldOptions =
                    fieldType === 'select' || fieldType === 'checkbox' || fieldType === 'radio'
                        ? { required: true, options: ['Option 1', 'Option 2'] }
                        : { required: true };

                const field = testDataBuilders.presortField(
                    fieldType,
                    `Required ${fieldType}`,
                    fieldOptions
                );
                const presortConfig = testDataBuilders.presortConfig({
                    [`required_${fieldType}`]: field,
                });

                await testDb.updateStudy(authToken, studySlug, {
                    presort_config: presortConfig,
                    state: 'active',
                });

                await navigateToPresort(page, studySlug);

                if (fieldType !== 'number') {
                    await expect(page.getByTestId('presort-submit-btn')).toBeDisabled();
                }

                let finalValue: string;
                if (fieldType === 'checkbox' || fieldType === 'radio' || fieldType === 'select') {
                    finalValue = 'Option 1';
                } else if (fieldType === 'email') {
                    finalValue = 'test@example.com';
                } else if (fieldType === 'date') {
                    finalValue = '2024-01-01';
                } else if (fieldType === 'number') {
                    finalValue = '42';
                } else {
                    finalValue = 'Valid input';
                }

                await fillField(page, fieldType, finalValue);

                await expect(page.getByTestId('presort-submit-btn')).toBeEnabled();
                await page.getByTestId('presort-submit-btn').click();
                await expect(page).toHaveURL(new RegExp(`/study/${studySlug}/rough-sort`));
            });

            test(`Edge Case: ${fieldType} field with constraints`, async ({
                page,
                testDb,
                authToken,
            }) => {
                let field: ReturnType<typeof testDataBuilders.presortField>;
                let edgeCaseValue: { valid: string; invalid: string | null };

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
                } else if (fieldType === 'date') {
                    field = testDataBuilders.presortField(fieldType, 'Date', {
                        required: true,
                    });
                    edgeCaseValue = { valid: '2022-01-01', invalid: null };
                } else {
                    const fieldOptions: { required: boolean; options?: string[] } = {
                        required: true,
                    };
                    if (
                        fieldType === 'select' ||
                        fieldType === 'checkbox' ||
                        fieldType === 'radio'
                    ) {
                        fieldOptions.options = ['Option 1', 'Option 2'];
                    }

                    field = testDataBuilders.presortField(
                        fieldType,
                        `Edge ${fieldType}`,
                        fieldOptions
                    );
                    edgeCaseValue = { valid: 'Option 1', invalid: null };
                }

                const presortConfig = testDataBuilders.presortConfig({
                    [`edge_${fieldType}`]: field,
                });

                await testDb.updateStudy(authToken, studySlug, {
                    presort_config: presortConfig,
                    state: 'active',
                });

                await navigateToPresort(page, studySlug);

                if (edgeCaseValue.invalid) {
                    await fillField(page, fieldType, edgeCaseValue.invalid);
                    await expect(page.getByTestId('presort-submit-btn')).toBeDisabled();
                }

                await fillField(page, fieldType, edgeCaseValue.valid);
                await expect(page.getByTestId('presort-submit-btn')).toBeEnabled();
                await page.getByTestId('presort-submit-btn').click();
                await expect(page).toHaveURL(new RegExp(`/study/${studySlug}/rough-sort`));
            });
        });
    }
});

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

async function fillField(page: Page, fieldType: PresortFieldType, value: string) {
    const selector = getFieldSelector(fieldType);

    switch (fieldType) {
        case 'checkbox':
        case 'radio':
            await page.getByText(value, { exact: true }).click();
            break;
        case 'select':
            await page.selectOption(selector, value);
            break;
        default:
            await page.fill(selector, value);
    }
}
