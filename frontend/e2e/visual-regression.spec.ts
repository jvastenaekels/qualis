import { expect, test } from '@playwright/test';
import { mockStudyAPI } from './fixtures/study-config';

const visualTestConfig = {
    slug: 'visual-test',
    title: 'Visual Test Study',
    subtitle: 'Visual Test Subtitle',
    description: 'Study for visual regression testing',
    objective: 'Visual Test Objective',
    instructions: 'Test instructions',
    require_consent: true,
    consent_text: 'I consent.',
    require_code: false,
    available_languages: ['en'],
    statements: [
        { id: 1, text: 'Short statement' },
        {
            id: 2,
            text: 'Longer statement that might wrap across multiple lines to test card height and text rendering behavior.',
        },
    ],
    grid_config: [
        { score: -1, capacity: 2 },
        { score: 0, capacity: 4 },
        { score: 1, capacity: 2 },
    ],
    presort_config: {},
    postsort_config: {},
};

test.describe('Visual Regression', () => {
    test.beforeEach(async ({ page }) => {
        await mockStudyAPI(page, visualTestConfig);
    });

    // Skip: Requires baseline screenshots to be generated first
    test.skip('Welcome Page Screenshot', async ({ page }) => {
        await page.goto(`/study/${visualTestConfig.slug}/welcome`);
        await expect(page.locator('h1')).toContainText(visualTestConfig.title);

        // Take full page screenshot
        await expect(page).toHaveScreenshot('welcome-page.png', {
            fullPage: true,
            animations: 'disabled',
            maxDiffPixelRatio: 0.05,
        });
    });

    // Skip navigation-dependent tests for now
    test.skip('Rough Sort Page Screenshot', async () => {
        // This test requires full navigation flow which is complex to mock
    });

    test.skip('Fine Sort Grid Screenshot', async () => {
        // This test requires full navigation flow which is complex to mock
    });
});
