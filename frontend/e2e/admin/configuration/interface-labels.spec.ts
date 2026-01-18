import { test, expect } from '../../fixtures/db-setup';
import { testDataBuilders } from '../../fixtures/test-data';

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

test.describe('Interface Customization Testing', () => {
    test.describe('UI Labels', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-interface-labels-${Date.now()}`,
                    statements: testDataBuilders.statements(10),
                })
            );
            studySlug = study.slug;
        });

        test('Admin: Can customize button labels', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.getByText(studySlug).click();
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-interface').click();

            // Customize labels
            await page.fill('input[name="common.agree"]', 'I Agree');
            await page.fill('input[name="common.disagree"]', 'I Disagree');
            await page.fill('input[name="common.neutral"]', 'Unsure');

            // Verify changes are reflected
            await expect(page.locator('input[name="common.agree"]')).toHaveValue('I Agree');
        });

        test('API: Custom labels save correctly', async ({ testDb, authToken }) => {
            const customLabels = {
                'common.agree': 'Strongly Agree',
                'common.disagree': 'Strongly Disagree',
                'common.neutral': 'Neutral',
                'common.next': 'Next Step',
                'post.submit': 'Finish Study',
            };

            await testDb.updateStudy(authToken, studySlug, {
                translations: [
                    {
                        language_code: 'en',
                        title: 'Test Study',
                        ui_labels: customLabels,
                    },
                ],
            });

            const study = await testDb.getStudy(authToken, studySlug);
            const enTranslation = study.translations.find((t) => t.language_code === 'en');

            expect(enTranslation.ui_labels['common.agree']).toBe('Strongly Agree');
            expect(enTranslation.ui_labels['common.disagree']).toBe('Strongly Disagree');
        });

        test('Participant: Custom labels appear in UI', async ({ page, testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                translations: [
                    {
                        language_code: 'en',
                        title: 'Test Study',
                        ui_labels: {
                            'common.agree': 'Custom Agree',
                            'common.disagree': 'Custom Disagree',
                            'common.neutral': 'Custom Neutral',
                        },
                    },
                ],
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);
            // Accept consent (New Flow)
            await page.click('[data-testid="start-btn"]');
            await page.check('[data-testid="consent-checkbox"]');
            await page.click('[data-testid="consent-accept-btn"]');

            // Verify custom labels appear
            await expect(page.locator('button:has-text("Custom Agree")')).toBeVisible();
            await expect(page.locator('button:has-text("Custom Disagree")')).toBeVisible();
            await expect(page.locator('button:has-text("Custom Neutral")')).toBeVisible();
        });

        test('Validation: Empty labels not allowed', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.getByText(studySlug).click();
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-interface').click();

            // Try to clear a label
            await page.fill('input[name="common.agree"]', '');
            await page.blur('input[name="common.agree"]');

            // Verify validation error or default value restored
            const value = await page.locator('input[name="common.agree"]').inputValue();
            expect(value).toBeTruthy(); // Should not be empty
        });

        test('Edge Case: Long custom labels', async ({ page, testDb, authToken }) => {
            const longLabel =
                'This is a very long custom label that might cause layout issues in the UI';

            await testDb.updateStudy(authToken, studySlug, {
                translations: [
                    {
                        language_code: 'en',
                        title: 'Test Study',
                        ui_labels: {
                            'common.agree': longLabel,
                        },
                    },
                ],
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);
            // Accept consent (New Flow)
            await page.click('[data-testid="start-btn"]');
            await page.check('[data-testid="consent-checkbox"]');
            await page.click('[data-testid="consent-accept-btn"]');

            // Verify long label appears and doesn't break layout
            const button = page.locator(`button:has-text("${longLabel.substring(0, 20)}")`);
            await expect(button).toBeVisible();

            // Check button is still clickable
            const boundingBox = await button.boundingBox();
            expect(boundingBox).toBeTruthy();
        });
    });

    test.describe('Process Steps Customization', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-interface-steps-${Date.now()}`,
                    statements: testDataBuilders.statements(10),
                })
            );
            studySlug = study.slug;
        });

        test.skip('Admin: Can customize process step names', async ({ page, testDb }) => {
            // Skipped: Process steps UI has changed to dynamic list, selectors need update
        });

        test('API: Process steps save correctly', async ({ testDb, authToken }) => {
            const processSteps = [
                { id: 'profile', title: 'Demographics', description: 'Desc', icon: 'User' },
                { id: 'rough', title: 'Quick Sort', description: 'Desc', icon: 'Zap' },
                { id: 'fine', title: 'Detailed Sorting', description: 'Desc', icon: 'Target' },
                { id: 'post', title: 'Questionnaire', description: 'Desc', icon: 'MessageSquare' },
            ];

            await testDb.updateStudy(authToken, studySlug, {
                translations: [
                    {
                        language_code: 'en',
                        title: 'Test Study',
                        process_steps: processSteps,
                    },
                ],
            });

            const study = await testDb.getStudy(authToken, studySlug);
            const enTranslation = study.translations.find((t) => t.language_code === 'en');

            const profileStep = enTranslation.process_steps.find((s: any) => s.id === 'profile');
            const fineStep = enTranslation.process_steps.find((s: any) => s.id === 'fine');
            expect(profileStep.title).toBe('Demographics');
            expect(fineStep.title).toBe('Detailed Sorting');
        });

        test('Participant: Custom step names in navigation', async ({
            page,
            testDb,
            authToken,
        }) => {
            await testDb.updateStudy(authToken, studySlug, {
                translations: [
                    {
                        language_code: 'en',
                        title: 'Test Study',
                        process_steps: [
                            {
                                id: 'rough',
                                title: 'Custom Rough Sort',
                                description: 'Desc',
                                icon: 'Zap',
                            },
                            {
                                id: 'fine',
                                title: 'Custom Fine Sort',
                                description: 'Desc',
                                icon: 'Target',
                            },
                        ],
                    },
                ],
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);
            // Accept consent (New Flow)
            await page.click('[data-testid="start-btn"]');
            await page.check('[data-testid="consent-checkbox"]');
            await page.click('[data-testid="consent-accept-btn"]');

            // Check if custom step names appear in progress/breadcrumb
            // (Implementation-specific)
            const hasCustomLabel = await page
                .locator('text=Custom Rough Sort, text=Custom Fine Sort')
                .count();
            expect(hasCustomLabel).toBeGreaterThan(0);
        });
    });

    test.describe('Help Text Customization', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-interface-help-${Date.now()}`,
                    statements: testDataBuilders.statements(10),
                })
            );
            studySlug = study.slug;
        });

        test('Admin: Can add help text for steps', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.getByText(studySlug).click();
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-interface').click();

            // Add help text
            await page.fill(
                'textarea[name="help_roughsort"]',
                'Sort statements into three piles...'
            );
            await page.fill('textarea[name="help_finesort"]', 'Arrange statements in the grid...');

            // Verify
            await expect(page.locator('textarea[name="help_finesort"]')).toHaveValue(
                'Arrange statements in the grid...'
            );
        });

        test('API: Help text saves correctly', async ({ testDb, authToken }) => {
            const stepHelp = {
                roughsort: 'Rough sort instructions here',
                finesort: 'Fine sort instructions here',
            };

            await testDb.updateStudy(authToken, studySlug, {
                translations: [
                    {
                        language_code: 'en',
                        title: 'Test Study',
                        step_help: stepHelp,
                    },
                ],
            });

            const study = await testDb.getStudy(authToken, studySlug);
            const enTranslation = study.translations.find((t) => t.language_code === 'en');

            expect(enTranslation.step_help.roughsort).toBe('Rough sort instructions here');
        });

        test('Participant: Help text appears in steps', async ({ page, testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                translations: [
                    {
                        language_code: 'en',
                        title: 'Test Study',
                        step_help: {
                            roughsort: 'Custom help for rough sort',
                        },
                    },
                ],
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);
            // Accept consent (New Flow)
            await page.click('[data-testid="start-btn"]');
            await page.check('[data-testid="consent-checkbox"]');
            await page.click('[data-testid="consent-accept-btn"]');

            // Navigate to rough sort
            // Verify help text appears
            await expect(page.locator('text=Custom help for rough sort')).toBeVisible();
        });
    });

    test.describe('Statement Code Display', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-interface-codes-${Date.now()}`,
                    statements: testDataBuilders.statements(10),
                    show_statement_codes: false,
                })
            );
            studySlug = study.slug;
        });

        test('Admin: Can toggle statement codes', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.getByText(studySlug).click();
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-interface').click();

            // Toggle statement codes
            const toggle = page.locator('#show-statement-codes');
            await toggle.check();

            await expect(toggle).toBeChecked();
        });

        test('API: Statement code setting saves', async ({ testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                show_statement_codes: true,
            });

            const study = await testDb.getStudy(authToken, studySlug);
            expect(study.show_statement_codes).toBe(true);
        });

        test('Participant: Statement codes shown when enabled', async ({
            page,
            testDb,
            authToken,
        }) => {
            await testDb.updateStudy(authToken, studySlug, {
                show_statement_codes: true,
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);
            // Accept consent (New Flow)
            await page.click('[data-testid="start-btn"]');
            await page.check('[data-testid="consent-checkbox"]');
            await page.click('[data-testid="consent-accept-btn"]');

            // Verify statement codes appear (e.g., "S1", "S2")
            await expect(page.locator('text=S1')).toBeVisible();
        });

        test('Participant: Statement codes hidden when disabled', async ({
            page,
            testDb,
            authToken,
        }) => {
            await testDb.updateStudy(authToken, studySlug, {
                show_statement_codes: false,
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);
            // Accept consent (New Flow)
            await page.click('[data-testid="start-btn"]');
            await page.check('[data-testid="consent-checkbox"]');
            await page.click('[data-testid="consent-accept-btn"]');

            // Statement codes should not appear
            const codeCount = await page.locator('text=/^S\\d+$/').count();
            expect(codeCount).toBe(0);
        });
    });
});
