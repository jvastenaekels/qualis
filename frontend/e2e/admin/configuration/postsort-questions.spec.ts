import { test, expect } from '../../fixtures/db-setup';
import { testDataBuilders, type PresortFieldType } from '../../fixtures/test-data';
import { injectParticipantSession } from '../../fixtures/session-utils';

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

test.describe('Post-Sort Configuration Testing', () => {
    test.describe('Email Collection', () => {
        let studySlug: string;
        let statementIds: number[];

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-postsort-email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    statements: testDataBuilders.statements(10),
                    grid_config: [
                        { score: -3, capacity: 1 },
                        { score: -2, capacity: 1 },
                        { score: -1, capacity: 2 },
                        { score: 0, capacity: 2 },
                        { score: 1, capacity: 2 },
                        { score: 2, capacity: 1 },
                        { score: 3, capacity: 1 },
                    ],
                })
            );
            studySlug = study.slug;
            statementIds = study.statements.map((s: any) => s.id);
        });

        test('Admin: Can enable email collection', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.click(`text=${studySlug}`);
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-post-sort').click();

            // Enable email collection
            const emailToggle = page.getByTestId('email-collection-toggle');
            await emailToggle.click();
            await expect(emailToggle).toHaveAttribute('aria-checked', 'true');
        });

        test('API: Email collection config saves correctly', async ({ testDb, authToken }) => {
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

        test('Participant: Email field appears when enabled', async ({
            page,
            testDb,
            authToken,
        }) => {
            // Enable email collection and activate
            await testDb.updateStudy(authToken, studySlug, {
                postsort_config: {
                    email_collection_enabled: true,
                },
                state: 'active',
            });

            // Create participant and inject session to skip straight to Post-Sort
            const { session_token } = await testDb.createParticipant(authToken, studySlug, {
                status: 'started',
            });
            await injectParticipantSession(page, {
                statementCount: 10,
                step: 5,
                token: session_token,
                statementIds: statementIds,
            });

            // Navigate to study (should redirect to Post-Sort based on step 5)
            await page.goto(`/study/${studySlug}`);

            // Verify email field appears
            await expect(page.locator('input[type="email"]')).toBeVisible();
            await expect(page.locator('label:has-text("Email")')).toBeVisible();
        });

        test('Validation: Email validation works', async ({ page, testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                postsort_config: { email_collection_enabled: true },
                state: 'active',
            });

            // Create participant and inject session
            const { session_token } = await testDb.createParticipant(authToken, studySlug, {
                status: 'started',
            });
            await injectParticipantSession(page, {
                statementCount: 10,
                step: 5,
                token: session_token,
                statementIds: statementIds,
            });

            // Navigate to post-sort
            await page.goto(`/study/${studySlug}`);

            // Try invalid email
            await page.fill('input[type="email"]', 'not-an-email');
            await page.getByTestId('postsort-submit-btn').click();

            // Verify validation error
            await expect(page.getByTestId('postsort-email-error')).toBeVisible();

            // Fix email
            await page.fill('input[type="email"]', 'test@example.com');
            await page.getByTestId('postsort-submit-btn').click();

            // Should show success message
            await expect(page.getByText(/thank you/i)).toBeVisible();
            await expect(page.locator('.font-mono')).toBeVisible(); // Confirmation code
        });

        test('Edge Case: Email optional when disabled', async ({ page, testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                postsort_config: { email_collection_enabled: false },
                state: 'active',
            });

            // Create participant and inject session
            const { session_token } = await testDb.createParticipant(authToken, studySlug, {
                status: 'started',
            });
            await injectParticipantSession(page, {
                statementCount: 10,
                step: 5,
                token: session_token,
                statementIds: statementIds,
            });

            await page.goto(`/study/${studySlug}`);

            // Email field should not appear
            await expect(page.locator('input[type="email"]')).not.toBeVisible();

            // Can submit without email
            await page.getByTestId('postsort-submit-btn').click();
            await expect(page.getByText(/thank you/i)).toBeVisible();
        });
    });

    test.describe('Consent Options', () => {
        let studySlug: string;
        let statementIds: number[];

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-postsort-consent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    statements: testDataBuilders.statements(10),
                    grid_config: [
                        { score: -3, capacity: 1 },
                        { score: -2, capacity: 1 },
                        { score: -1, capacity: 2 },
                        { score: 0, capacity: 2 },
                        { score: 1, capacity: 2 },
                        { score: 2, capacity: 1 },
                        { score: 3, capacity: 1 },
                    ],
                })
            );
            studySlug = study.slug;
            statementIds = study.statements.map((s: any) => s.id);
        });

        test('Admin: Can enable interview consent', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.click(`text=${studySlug}`);
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-post-sort').click();

            await page.getByTestId('email-collection-toggle').click();
            const consentToggle = page.getByTestId('interview-consent-toggle');
            await expect(consentToggle).toBeVisible();
            // It's enabled by default when email collection is enabled, so let's toggle it off and on
            await consentToggle.click(); // Off
            await expect(consentToggle).toHaveAttribute('aria-checked', 'false');
            await consentToggle.click(); // On
            await expect(consentToggle).toHaveAttribute('aria-checked', 'true');
        });

        test('API: Consent config saves correctly', async ({ testDb, authToken }) => {
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

        test('Participant: Consent checkboxes appear when enabled', async ({
            page,
            testDb,
            authToken,
        }) => {
            await testDb.updateStudy(authToken, studySlug, {
                postsort_config: {
                    interview_consent_enabled: true,
                    newsletter_consent_enabled: true,
                },
                state: 'active',
            });

            // Create participant and inject session
            const { session_token } = await testDb.createParticipant(authToken, studySlug, {
                status: 'started',
            });
            await injectParticipantSession(page, {
                statementCount: 10,
                step: 5,
                token: session_token,
                statementIds: statementIds,
            });

            // Navigate to post-sort
            await page.goto(`/study/${studySlug}`);

            // Verify both consent checkboxes appear
            await expect(page.locator('#contact-consent-interview')).toBeVisible();
            await expect(page.locator('#contact-consent-newsletter')).toBeVisible();
        });
    });

    test.describe('Custom Questions', () => {
        const QUESTION_TYPES: PresortFieldType[] = [
            'text',
            'textarea',
            'select',
            'radio',
            'checkbox',
        ];

        for (const questionType of QUESTION_TYPES) {
            test.describe(`Question Type: ${questionType}`, () => {
                let studySlug: string;
                let statementIds: number[];

                test.beforeEach(async ({ testDb, authToken }) => {
                    const study = await testDb.createStudy(
                        authToken,
                        testDataBuilders.study({
                            slug: `test-postsort-q-${questionType}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                            statements: testDataBuilders.statements(10),
                            grid_config: [
                                { score: -3, capacity: 1 },
                                { score: -2, capacity: 1 },
                                { score: -1, capacity: 2 },
                                { score: 0, capacity: 2 },
                                { score: 1, capacity: 2 },
                                { score: 2, capacity: 1 },
                                { score: 3, capacity: 1 },
                            ],
                        })
                    );
                    studySlug = study.slug;
                    statementIds = study.statements.map((s: any) => s.id);
                });

                test(`Admin: Can add ${questionType} question`, async ({ page, testDb }) => {
                    await testDb.loginToAdminUI(page);

                    await page.click(`text=${studySlug}`);
                    await page
                        .getByRole('link', { name: /design/i })
                        .first()
                        .click();
                    await page.getByTestId('tab-post-sort').click();

                    // Add question
                    // Add a new question
                    await page.click(`[data-testid="add-question-${questionType}"]`);

                    // Wait for question item to appear and update label
                    await page.locator('[data-testid="question-accordion-trigger"]').last().click();
                    await page
                        .locator('input[value="New question"]')
                        .fill(`Test ${questionType} question`);

                    // Verify/Edit options if applicable
                    if (
                        questionType === 'select' ||
                        questionType === 'radio' ||
                        questionType === 'checkbox'
                    ) {
                        await expect(page.locator('input[value="Option 1"]')).toBeVisible();
                    }

                    // No save button, auto-saves
                    // Verify question preview or presence in list
                    await expect(
                        page.locator('span.font-bold', { hasText: `Test ${questionType} question` })
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
                        }
                    );

                    await testDb.updateStudy(authToken, studySlug, {
                        postsort_config: {
                            questions: {
                                [`test_${questionType}`]: question,
                            },
                        },
                    });

                    const study = await testDb.getStudy(authToken, studySlug);
                    expect(study.postsort_config.questions[`test_${questionType}`]).toBeDefined();
                    expect(study.postsort_config.questions[`test_${questionType}`].type).toBe(
                        questionType
                    );
                });

                test(`Participant: ${questionType} question renders correctly`, async ({
                    page,
                    testDb,
                    authToken,
                }) => {
                    const question = testDataBuilders.postsortQuestion(
                        questionType,
                        `Participant ${questionType} Test`
                    );

                    await testDb.updateStudy(authToken, studySlug, {
                        postsort_config: {
                            questions: {
                                [`test_${questionType}`]: question,
                            },
                        },
                        state: 'active',
                    });

                    // Create participant and inject session
                    const { session_token } = await testDb.createParticipant(authToken, studySlug, {
                        status: 'started',
                    });
                    await injectParticipantSession(page, {
                        statementCount: 10,
                        step: 5,
                        token: session_token,
                        statementIds: statementIds,
                    });

                    // Navigate to post-sort
                    await page.goto(`/study/${studySlug}`);

                    // Verify question renders
                    await expect(
                        page.locator(`text=Participant ${questionType} Test`)
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
                        }
                    );

                    await testDb.updateStudy(authToken, studySlug, {
                        postsort_config: {
                            questions: {
                                [`required_${questionType}`]: question,
                            },
                        },
                        state: 'active',
                    });

                    // Create participant and inject session
                    const { session_token } = await testDb.createParticipant(authToken, studySlug, {
                        status: 'started',
                    });
                    await injectParticipantSession(page, {
                        statementCount: 10,
                        step: 5,
                        token: session_token,
                        statementIds: statementIds,
                    });

                    // Navigate to post-sort
                    await page.goto(`/study/${studySlug}`);

                    // Try to submit without answering
                    await page.getByTestId('postsort-submit-btn').click();

                    // Verify validation error
                    await expect(page.getByTestId('postsort-field-error')).toBeVisible();
                });
            });
        }
    });
});
