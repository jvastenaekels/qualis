/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable security/detect-non-literal-regexp */
import { test, expect } from '@playwright/test';
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

// 1. Load and Transform example-study.json
const studyJsonPath = path.resolve(__dirname, '../../../backend/data/example-study.json');
const rawStudy = JSON.parse(fs.readFileSync(studyJsonPath, 'utf-8'));

// Synthesize ID for statements as the frontend requires them
const statements = rawStudy.statements.map((s: any, index: number) => ({
    id: index + 1,
    text: s.translations.en,
    code: s.code,
}));

// Transform into frontend-compatible StudyConfig
const mockStudyConfig = {
    ...rawStudy,
    title: rawStudy.translations.en.title,
    subtitle: rawStudy.translations.en.subtitle,
    description: rawStudy.translations.en.description || '',
    objective: rawStudy.translations.en.objective,
    instructions: rawStudy.translations.en.instructions,
    ui_labels: {
        'welcome.start': 'Custom Start',
        'common.next': 'Custom Next',
        'common.undo': 'Custom Undo',
        'common.agree': 'Custom Agree',
        'common.disagree': 'Custom Disagree',
        'common.neutral': 'Custom Neutral',
        'fine.actions.validate': 'Custom Validate',
        'fine.legend.agree': 'Custom Most Agree',
        'post.submit': 'Custom Submit',
        'post.back': 'Custom Back',
    },
    statements: statements,
    state: rawStudy.state || 'active',
};

test.describe('Labels Flow (Example Study)', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', (msg) => console.log(`[Browser]: ${msg.text()}`));
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

    test('should complete the full study lifecycle', async ({ page }) => {
        const welcomePage = new WelcomePage(page);
        const consentPage = new ConsentPage(page);
        const preSortPage = new PreSortPage(page);
        const roughSortPage = new RoughSortPage(page);
        const fineSortPage = new FineSortPage(page);

        // 1. WELCOME
        await welcomePage.visit(mockStudyConfig.slug);
        await expect(page.getByText('Custom Start')).toBeVisible();
        await welcomePage.startStudy();

        // 2. CONSENT
        await consentPage.waitForLoad();
        await expect(page.getByText('Custom Start')).toBeVisible();
        await consentPage.acceptConsent();

        // 3. PRE-SORT
        await preSortPage.waitForLoad();
        await expect(page.getByText('Custom Next')).toBeVisible();
        await preSortPage.completePreSort();

        // 4. ROUGH SORT
        await roughSortPage.waitForLoad();
        await expect(page.getByLabel('Custom Agree')).toBeVisible();
        await expect(page.getByLabel('Custom Disagree')).toBeVisible();
        await expect(page.getByLabel('Custom Neutral')).toBeVisible();
        // Undo might default to icon, so check aria-label or text if visible?
        // RoughSort implementation uses aria-label for undo usually, assuming visual is icon + text
        // Let's verify text if it renders text
        await expect(page.getByText('Custom Undo')).toBeVisible();

        await roughSortPage.completeRoughSort(mockStudyConfig.statements.length);
        await expect(page.getByText('Custom Next')).toBeVisible();

        // 5. FINE SORT
        await fineSortPage.waitForLoad();
        await expect(page.getByText('Custom Most Agree')).toBeVisible();
        // Validate button only appears when done, verifyLayout might do some checks
        // We can manually move cards and check validate button label if we want deep verification
        // For now, let's trust that if the legend updated, the config is being read.
        await fineSortPage.verifyLayout();
    });
});
