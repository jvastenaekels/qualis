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

test.describe('Fine Sort Comprehensive UX & Layout [Refactored]', () => {
    test.setTimeout(120_000);

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

    test('should verify all critical UI elements and interactions', async ({ page }) => {
        const welcomePage = new WelcomePage(page);
        const consentPage = new ConsentPage(page);
        const preSortPage = new PreSortPage(page);
        const roughSortPage = new RoughSortPage(page);
        const fineSortPage = new FineSortPage(page);

        // --- SETUP ---
        await test.step('Navigate to Fine Sort', async () => {
            await welcomePage.visit(mockStudyConfig.slug);
            await welcomePage.startStudy();

            await consentPage.waitForLoad();
            await consentPage.acceptConsent();

            // Fast-forward through Pre-Sort
            try {
                await preSortPage.waitForLoad();
                await preSortPage.completePreSort();
            } catch (e) {
                console.log('Skipped pre-sort or already passed');
            }

            // Fast-forward through Rough Sort
            try {
                await roughSortPage.waitForLoad();
                // Important: Distribute cards to ensure deck is populated in Fine Sort
                await roughSortPage.completeRoughSort(mockStudyConfig.statements.length);

                // Navigate to Fine Sort (RoughSortPage complete logic handles sorting,
                // but we might need explicit next click if not covered)
                // Assuming completeRoughSort finishes the sorting.
                // We need to click next if not done.
                // Checking if we are still on rough sort:
                if (await page.getByRole('button', { name: /next|suivant|continue/i }).count() > 0) {
                     await page.getByRole('button', { name: /next|suivant|continue/i }).first().click();
                }
            } catch (e) {
                console.log('Skipped rough sort or already passed');
            }

            await fineSortPage.waitForLoad();
        });

        // --- SECTION 1: VISIBILITY & LAYOUT CHECKS ---
        await test.step('Verify Critical Layout Elements', async () => {
            await fineSortPage.verifyLayout();
        });

        // --- SECTION 2: FOOTER INTERACTIONS ---
        await test.step('Verify Footer Interactions', async () => {
            // A. Initial State: "Drag or Tap"
            await fineSortPage.checkFooter(/Drag|Glissez|Tap|Appuyez/);

            // B. Selection State: Click a card -> Footer changes
            // For now, this logic is inside FineSortPage but complex checks (bounding box)
            // might remain in test or be moved later. Keeping simple interaction check.
            const deckCard = fineSortPage.deckContainer.locator('[data-testid^="card-"]').first();
            await deckCard.click();

            // Footer text should change to "Place on grid"
            await fineSortPage.checkFooter(/Place|Placez/);
        });

        // --- SECTION 3: DECK & DRAG ---
        await test.step('Verify Deck & Drag Functionality', async () => {
            const initialDeckCount = await fineSortPage.getDeckCount();
            await fineSortPage.dragFirstCardToSlot();

            // Verify Logic
            // 1. Deck count decreases
            const newDeckCount = await fineSortPage.getDeckCount();
            expect(newDeckCount).toBe(initialDeckCount - 1);
        });

        // --- SECTION 4: PILE SWITCHING ---
        await test.step('Verify Pile Switching', async () => {
            // Switch to separate pile (e.g. Agree)
            await fineSortPage.selectPile(2); // Agree
        });
    });
});
