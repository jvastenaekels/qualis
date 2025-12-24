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
    
    // 3. Find and check consent checkbox (handle different checkbox implementations)
    const checkbox = page.locator('input[type="checkbox"], [role="checkbox"]').first();
    await checkbox.click();
    
    // 4. Click continue button
    const continueBtn = page.locator('button:has-text("Continue"), button[type="submit"]').first();
    await continueBtn.click();
    
    // 5. Should navigate to Consent, PreSort, or Rough Sort
    await page.waitForURL(/\/(consent|presort|rough-sort)/);
    
    // Handle consent page if present
    if (page.url().includes('consent')) {
      const consentCheckbox = page.locator('input[type="checkbox"]').first();
      if (await consentCheckbox.isVisible()) {
        await consentCheckbox.check();
      }
      await page.locator('button[type="submit"], button:has-text("Continue")').first().click();
      await page.waitForURL(/\/(presort|rough-sort)/);
    }
    
    // Handle presort page if present
    if (page.url().includes('presort')) {
      await page.locator('button[type="submit"], button:has-text("Continue")').first().click();
      await page.waitForURL(/\/rough-sort/);
    }
    
    // 6. Rough Sort - Sort all statements using keyboard or buttons
    await expect(page).toHaveURL(/\/rough-sort/);
    
    // Sort all statements
    for (let i = 0; i < mockStudyConfig.statements.length; i++) {
      await page.waitForTimeout(300);
      
      // Try clicking agree button or use keyboard
      const agreeButton = page.locator('button[aria-label*="agree"], button:has-text("agree")').first();
      if (await agreeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await agreeButton.click();
      } else {
        await page.keyboard.press('ArrowRight');
      }
    }
    
    // 7. Wait for next button and click
    await page.waitForTimeout(500);
    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
    }
    
    // 8. Should be on Fine Sort
    await page.waitForURL(/\/sort/, { timeout: 10000 });
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
