import { test, expect } from '@playwright/test';
import { mockStudyAPI } from './fixtures/study-config';

const visualTestConfig = {
  slug: 'visual-test',
  title: 'Visual Test Study',
  description: 'Study for visual regression testing',
  instructions: 'Test instructions',
  require_consent: true,
  consent_text: 'I consent.',
  require_code: false,
  available_languages: ['en'],
  statements: [
    { id: 1, text: 'Short statement' },
    { id: 2, text: 'Longer statement that might wrap across multiple lines to test card height and text rendering behavior.' },
  ],
  grid_config: [
    { score: -1, capacity: 2 },
    { score: 0, capacity: 4 },
    { score: 1, capacity: 2 },
  ],
  presort_config: {},
  postsort_config: {}
};

test.describe('Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await mockStudyAPI(page, visualTestConfig);
  });

  test('Welcome Page Screenshot', async ({ page }) => {
    await page.goto(`/study/${visualTestConfig.slug}/welcome`);
    await page.waitForSelector('h1');
    
    // Take full page screenshot
    await expect(page).toHaveScreenshot('welcome-page.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('Rough Sort Page Screenshot', async ({ page }) => {
    await page.goto(`/study/${visualTestConfig.slug}/welcome`);
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    
    // Navigate through presort if present
    if (page.url().includes('presort')) {
      await page.click('button[type="submit"]');
    }
    
    await page.waitForURL(/\/rough-sort/);
    
    // Wait for animations to settle
    await page.waitForTimeout(500);
    
    // Take screenshot of rough sort page
    await expect(page).toHaveScreenshot('rough-sort-page.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('Fine Sort Grid Screenshot', async ({ page }) => {
    // Setup: categorize cards first
    await page.goto(`/study/${visualTestConfig.slug}/welcome`);
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    
    // Fast track to fine sort
    await page.goto(`/study/${visualTestConfig.slug}/sort`);
    
    // Wait for grid to render
    await page.waitForSelector('[data-testid="grid-container"]', { timeout: 10000 });
    
    // Wait for animations
    await page.waitForTimeout(1000);
    
    // Take screenshot of the grid area
    const gridContainer = page.locator('[data-testid="grid-container"]');
    if (await gridContainer.isVisible()) {
      await expect(gridContainer).toHaveScreenshot('fine-sort-grid.png', {
        animations: 'disabled'
      });
    } else {
      // Fallback to full page
      await expect(page).toHaveScreenshot('fine-sort-page.png', {
        fullPage: true,
        animations: 'disabled'
      });
    }
  });
});
