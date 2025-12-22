import { test, expect } from '@playwright/test';
import { mockStudyConfig, mockStudyAPI, mockSubmitAPI } from './fixtures/study-config';

test.describe('Basic Study Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup API mocking
    await mockStudyAPI(page);
    await mockSubmitAPI(page);
  });

  test('should navigate through study from welcome to fine sort', async ({ page }) => {
    // 1. Navigate to Welcome Page
    await page.goto(`/study/${mockStudyConfig.slug}/welcome`);
    
    // 2. Verify Welcome Page loaded
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.locator('h1')).toContainText(mockStudyConfig.title);
    
    // 3. Accept consent and start study
    await page.check('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    
    // 4. Should navigate to PreSort (or Rough Sort if no presort config)
    await page.waitForURL(/\/(presort|rough-sort)/);
    
    // If on presort, continue to rough sort
    if (page.url().includes('presort')) {
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/rough-sort/);
    }
    
    // 5. Rough Sort - Sort all statements
    await expect(page).toHaveURL(/\/rough-sort/);
    
    // Click agree button for each statement
    for (let i = 0; i < mockStudyConfig.statements.length; i++) {
      // Wait for card to be visible
      await page.waitForSelector('[data-testid="card-stack"]', { state: 'visible', timeout: 5000 }).catch(() => {
        // Fallback: look for any card-like element
      });
      
      // Click agree button (right side)
      const agreeButton = page.locator('button').filter({ hasText: /agree|like/i }).first();
      if (await agreeButton.isVisible()) {
        await agreeButton.click();
      } else {
        // Fallback: try keyboard
        await page.keyboard.press('ArrowRight');
      }
      
      // Short wait for animation
      await page.waitForTimeout(300);
    }
    
    // 6. Should show completion state
    await page.waitForSelector('button:has-text("Next")', { timeout: 5000 });
    await page.click('button:has-text("Next")');
    
    // 7. Should be on Fine Sort
    await page.waitForURL(/\/sort/);
    await expect(page.locator('[data-testid="grid-container"]')).toBeVisible({ timeout: 10000 });
  });

  test('should persist consent when navigating back', async ({ page }) => {
    // Navigate to welcome
    await page.goto(`/study/${mockStudyConfig.slug}/welcome`);
    
    // Accept consent
    await page.check('input[type="checkbox"]');
    
    // Navigate away and back
    await page.goto('/');
    await page.goto(`/study/${mockStudyConfig.slug}/welcome`);
    
    // Consent should be persisted
    await expect(page.locator('input[type="checkbox"]')).toBeChecked();
  });
});

test.describe('Error Handling', () => {
  test('should show error for non-existent study', async ({ page }) => {
    // Mock 404 response
    await page.route('**/api/study/nonexistent**', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Study not found' })
      });
    });
    
    await page.goto('/study/nonexistent/welcome');
    
    // Should show error message (use first() to handle multiple matches)
    await expect(page.locator('text=/not found|error/i').first()).toBeVisible({ timeout: 10000 });
  });
});
