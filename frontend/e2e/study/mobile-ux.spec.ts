/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable security/detect-non-literal-regexp */
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockSubmitAPI } from '../fixtures/study-config';
import { WelcomePage } from '../pages/WelcomePage';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { FineSortPage } from '../pages/FineSortPage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load and Transform example-study.json
const studyJsonPath = path.resolve(__dirname, '../../../backend/data/example-study.json');
const rawStudy = JSON.parse(fs.readFileSync(studyJsonPath, 'utf-8'));

// Synthesize ID for statements
const statements = rawStudy.statements.map((s: any, index: number) => ({
    id: index + 1,
    text: s.translations.en,
    code: s.code,
}));

const mockStudyConfig = {
    ...rawStudy,
    title: rawStudy.translations.en.title,
    subtitle: rawStudy.translations.en.subtitle,
    description: rawStudy.translations.en.description || '',
    objective: rawStudy.translations.en.objective,
    instructions: rawStudy.translations.en.instructions,
    ui_labels: rawStudy.translations.en.ui_labels,
    statements: statements,
    state: rawStudy.state || 'active',
};

test.describe('Mobile UX (Focus Flow) [Refactored]', () => {
    test.use({
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
    });

    test.skip(
        ({ browserName }) => browserName === 'firefox',
        'Firefox does not support mobile emulation'
    );

    test.beforeEach(async ({ page }) => {
        // Mock Study API
        await page.route(`**/api/study/${mockStudyConfig.slug}**`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockStudyConfig),
            });
        });

        // Mock Submission API
        await mockSubmitAPI(page);

        // Mock Logging
        await page.route('**/api/logs', async (route) => {
            await route.fulfill({ status: 200, body: '{}' });
        });
    });

    test('should activate workbench on card tap', async ({ page }) => {
        const welcomePage = new WelcomePage(page);
        const consentPage = new ConsentPage(page);
        const preSortPage = new PreSortPage(page);
        const roughSortPage = new RoughSortPage(page);
        const fineSortPage = new FineSortPage(page);

        // 1. WELCOME
        await welcomePage.visit(mockStudyConfig.slug);
        await welcomePage.startStudy();

        // 2. CONSENT
        await consentPage.waitForLoad();
        await consentPage.acceptConsent();

        // 3. PRESORT
        // Ensure we handle presort if it appears
        // In mobile-ux original, it was explicit click
        await preSortPage.waitForLoad();
        await preSortPage.completePreSort();

        // 4. ROUGH SORT
        await roughSortPage.waitForLoad();
        // Distribute to populate Fine Sort Disagree deck (Mock logic puts 1st in Disagree)
        await roughSortPage.completeRoughSort(mockStudyConfig.statements.length);

        // 5. FINE SORT
        await fineSortPage.waitForLoad();

        // Mobile Interactions
        await fineSortPage.tapFirstCard();
        await fineSortPage.verifyWorkbenchActive();
    });
});
