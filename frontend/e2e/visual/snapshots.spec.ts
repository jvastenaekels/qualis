import { test, expect } from '../fixtures/db-setup';

test.describe('Visual Regression Tests', () => {
    test('Welcome Page should match snapshot', async ({ page, testDb, authToken }) => {
        // Create a specific study for visual testing to ensure consistent content
        const study = await testDb.createStudy(authToken, {
            title: 'Visual Test Study',
            slug: 'visual-test-welcome',
            state: 'active',
            translations: [
                {
                    language_code: 'en',
                    title: 'Visual Test Study',
                    description: 'This is a test study for visual regression.',
                    instructions: 'Please follow the instructions carefully.',
                    objective: 'To verify visual consistency.',
                    condition_of_instruction: 'Sort the items based on your preference.',
                    consent_title: 'Informed Consent',
                    consent_description: 'We collect data for testing purposes.',
                },
            ],
            grid_config: [
                { score: -1, capacity: 1 },
                { score: 0, capacity: 1 },
                { score: 1, capacity: 1 },
            ],
            statements: [
                { code: 's1', translations: [{ language_code: 'en', text: 'S1' }] },
                { code: 's2', translations: [{ language_code: 'en', text: 'S2' }] },
                { code: 's3', translations: [{ language_code: 'en', text: 'S3' }] },
            ],
            presort_config: {},
            postsort_config: {},
        });

        await page.goto(`/study/${study.slug}/welcome`);

        // Wait for fonts/animations
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot('welcome-page.png', {
            fullPage: true,
            // Mask any potentially dynamic elements if necessary
            // For welcome page, content should be static based on config
        });
    });

    test('Admin Dashboard should match snapshot', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);

        // Wait for animation
        await page.waitForTimeout(1000);

        await expect(page).toHaveScreenshot('admin-dashboard.png', {
            fullPage: true,
            mask: [
                // Mask user email in the welcome message
                page.locator('h1 + p span.text-indigo-600'),

                // Mask the "Created X ago" timestamps in recent studies list
                page.locator('text=/Created .* ago/'),

                // Mask specific stats that might vary slightly depending on seed
                page.locator('.text-3xl.font-black.text-indigo-600'), // Stats count
            ],
        });
    });
});
