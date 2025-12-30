/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mockSubmitAPI } from './fixtures/study-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load and Transform example-study.json
const studyJsonPath = path.resolve(__dirname, '../../backend/data/example-study.json');
const rawStudy = JSON.parse(fs.readFileSync(studyJsonPath, 'utf-8'));

// Synthesize ID for statements as the frontend requires them (normally DB assigns them)
const statements = rawStudy.statements.map((s: any, index: number) => ({
    id: index + 1,
    text: s.translations.en,
    code: s.code,
}));

// Transform into frontend-compatible StudyConfig
const mockStudyConfig = {
    ...rawStudy,
    // Flatten core translations
    title: rawStudy.translations.en.title,
    subtitle: rawStudy.translations.en.subtitle,
    description: rawStudy.translations.en.description || '',
    objective: rawStudy.translations.en.objective,
    instructions: rawStudy.translations.en.instructions,
    ui_labels: rawStudy.translations.en.ui_labels,
    statements: statements,
    state: rawStudy.state || 'active',
};

test.describe('Navigation Flow (Bidirectional)', () => {
    test.beforeEach(async ({ page }) => {
        // Mock Study API (Strict path to avoid capturing /consent)
        await page.route(`**/api/study/${mockStudyConfig.slug}?*`, async (route) => {
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

        // Mock Consent API
        await page.route(`**/api/study/${mockStudyConfig.slug}/consent`, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'recorded' }),
            });
        });
    });

    test('should allow navigating back and forth between steps retaining state', async ({
        page,
    }) => {
        // 1. Start at Welcome
        await page.goto(`/study/${mockStudyConfig.slug}/welcome`);
        await expect(page.getByRole('heading', { name: mockStudyConfig.title })).toBeVisible();

        // 2. Go to Consent
        await page.getByRole('button', { name: /continue|continuer/i }).click();
        await expect(page).toHaveURL(/.*\/consent/);

        // 3. Agree and Go to PreSort
        await page.getByRole('checkbox').check();

        // Verify Consent API Call
        const consentResponsePromise = page.waitForResponse(
            (response) =>
                response.url().includes('/consent') && response.request().method() === 'POST'
        );

        await page.getByRole('button', { name: mockStudyConfig.ui_labels.start_button }).click();

        const consentResponse = await consentResponsePromise;
        expect(consentResponse.status()).toBe(200);

        // Deserialize request to check payload
        const requestData = consentResponse.request().postDataJSON();
        expect(requestData).toMatchObject({
            session_token: expect.any(String),
            language_code: 'en',
            consent_hash: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hex string
        });

        expect(await consentResponse.json()).toEqual({ status: 'recorded' });

        await expect(page).toHaveURL(/.*\/presort/);

        // --- BACKWARD NAVIGATION CHECK 1: PreSort -> Consent ---
        await page.goBack();
        await expect(page).toHaveURL(/.*\/consent/);
        // Verify state retention: Checkbox should still be checked
        await expect(page.getByRole('checkbox')).toBeChecked();

        // --- FORWARD NAVIGATION CHECK 1: Consent -> PreSort ---
        await page.getByRole('button', { name: mockStudyConfig.ui_labels.start_button }).click();
        await expect(page).toHaveURL(/.*\/presort/);

        // 4. Fill PreSort Data
        await page.getByLabel(/age/i).first().fill('42');
        await page.getByLabel(/gender|genre|sukupuoli/i).selectOption({ label: 'Male' });
        await page
            .getByLabel(/education|études|koulutus/i)
            .selectOption({ label: "Master's Degree" });

        // 5. Go to RoughSort
        await page.getByRole('button', { name: /continue|continuer/i }).click();
        // Wait for page transition
        await expect(page).toHaveURL(/.*\/rough-sort/);
        // Wait for instruction/tip to stabilize if any (to avoid flaky back navigation if history state acts up)
        await page.waitForTimeout(500);

        // --- BACKWARD NAVIGATION CHECK 2: RoughSort -> PreSort ---
        await page.goBack();
        await expect(page).toHaveURL(/.*\/presort/);
        // Verify state retention: Age should be 42
        await expect(page.getByLabel(/age/i).first()).toHaveValue('42');

        // --- FORWARD NAVIGATION CHECK 2: PreSort -> RoughSort ---
        await page.getByRole('button', { name: /continue|continuer/i }).click();
        await expect(page).toHaveURL(/.*\/rough-sort/);
    });
});
